/**
 * supabase/functions/alpaca-trading/index.ts
 *
 * Secure proxy between the Butterfly Trading app and the Alpaca Paper Trading API.
 *
 * All Alpaca API calls are routed through this function so that API keys
 * never touch the client bundle.
 *
 * CURRENCY: the MVP demo universe is US-listed ETFs. All prices from the
 * Alpaca US data host (and fill prices on the webhook) are USD; they are
 * converted to GBP here, at the edge, so the app only ever sees pounds.
 * Rate comes from the USD_PER_GBP secret. TODO(fx): live FX feed later.
 *
 * Supported actions (passed as JSON body):
 *   { action: 'get_account' }
 *   { action: 'get_positions' }
 *   { action: 'get_orders', status?: 'open' | 'closed' | 'all' }
 *   { action: 'place_order', symbol, qty, side, type, time_in_force }
 *   { action: 'cancel_order', order_id }
 *   { action: 'get_bars', symbol, timeframe, limit }   // start/end optional overrides
 *   { action: 'get_latest_quote', symbol }
 *   { action: 'get_latest_bar', symbol }
 *
 * Webhook path (POST /alpaca-trading/webhook):
 *   Receives Alpaca order events, fires donation logic on fill.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateDonation } from './donation.ts'

// ─── Environment ──────────────────────────────────────────────────────────────

const ALPACA_API_KEY    = Deno.env.get('ALPACA_API_KEY')!
const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY')!
const ALPACA_BASE_URL   = Deno.env.get('ALPACA_BASE_URL') ?? 'https://paper-api.alpaca.markets'
const ALPACA_DATA_URL   = 'https://data.alpaca.markets'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * USD per 1 GBP (e.g. 1.27). All Alpaca US market data and fill prices are
 * USD; every price leaving this function is converted to GBP with this rate.
 * TODO(fx): replace the static rate with a live FX source before real money.
 */
const USD_PER_GBP = Number(Deno.env.get('USD_PER_GBP'))
if (!Number.isFinite(USD_PER_GBP) || USD_PER_GBP <= 0) {
  // Fail loudly at cold start rather than silently mispricing everything.
  throw new Error('USD_PER_GBP env var missing or invalid — set it with: supabase secrets set USD_PER_GBP=1.27')
}

/** USD → GBP, rounded to 4 dp to strip float noise (display rounds further). */
function usdToGbp(usd: number): number {
  return Math.round((usd / USD_PER_GBP) * 10_000) / 10_000
}

// ─── Headers ─────────────────────────────────────────────────────────────────

const alpacaHeaders = {
  'APCA-API-KEY-ID':     ALPACA_API_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
  'Content-Type':        'application/json',
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Supabase client (service role — server-side only) ────────────────────────

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ─── Alpaca API helpers ───────────────────────────────────────────────────────

async function alpacaGet(path: string, baseUrl = ALPACA_BASE_URL) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: alpacaHeaders,
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Alpaca GET ${path} failed (${res.status}): ${error}`)
  }
  return res.json()
}

async function alpacaPost(path: string, body: unknown) {
  const res = await fetch(`${ALPACA_BASE_URL}${path}`, {
    method: 'POST',
    headers: alpacaHeaders,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Alpaca POST ${path} failed (${res.status}): ${error}`)
  }
  return res.json()
}

async function alpacaDelete(path: string) {
  const res = await fetch(`${ALPACA_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: alpacaHeaders,
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Alpaca DELETE ${path} failed (${res.status}): ${error}`)
  }
  return { success: true }
}

/**
 * lookbackStart
 *
 * ISO timestamp far enough back to contain `limit` bars of `timeframe`,
 * padding generously (×2, +7 days) for weekends, holidays and half-days.
 * Overshooting is harmless: with sort=desc + limit, Alpaca still returns
 * exactly the most recent `limit` bars inside the window. (Without an explicit
 * start, Alpaca defaults to the beginning of the CURRENT day — which is why
 * the old get_bars returned nothing for 1M/3M/1Y.)
 */
function lookbackStart(timeframe: string, limit: number): string {
  const m = timeframe.match(/^(\d+)(Min|Hour|Day|Week|Month)$/)
  const amount = m ? parseInt(m[1], 10) : 1
  const unit   = m ? m[2] : 'Day'

  // Approximate CALENDAR days consumed per bar.
  const daysPerBar =
    unit === 'Min'   ? amount / 390     // ~390 trading minutes / day
  : unit === 'Hour'  ? amount / 6.5     // ~6.5 trading hours / day
  : unit === 'Day'   ? amount * (7 / 5) // 5 trading days / week
  : unit === 'Week'  ? amount * 7
  : /* Month */        amount * 31

  const calendarDays = Math.ceil(daysPerBar * limit * 2) + 7
  return new Date(Date.now() - calendarDays * 86_400_000).toISOString()
}

// ─── Donation logic ───────────────────────────────────────────────────────────

// ─── Webhook handler ──────────────────────────────────────────────────────────

/**
 * handleWebhook
 *
 * Receives Alpaca order status events. On a confirmed 'fill':
 *   1. Deduplicates via processed_events table (edge case 8.4 / idempotency)
 *   2. Resolves OUR order row by broker_order_ref (the Alpaca order id)
 *   3. BUY  → record_buy_fill (create/update position, weighted-avg cost)
 *      SELL → look up position, calc P&L + donation, record_fill_and_donation
 *
 * Non-fill events (pending, cancelled, rejected, partial_fill) are
 * acknowledged and ignored — no position or donation change is made.
 */
async function handleWebhook(req: Request): Promise<Response> {
  const supabase = getSupabase()

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400)
  }

  const event      = payload as unknown as AlpacaOrderEvent
  const event_id   = event.event_id ?? event.order?.id  // dedup key
  const order      = event.order
  const event_type = event.event // 'fill' | 'partial_fill' | 'cancelled' | etc.

  console.log(`[webhook] event=${event_type} order_id=${order?.id}`)

  // ── Idempotency: skip if already processed (edge cases 1.5, 8.4) ──
  if (event_id) {
    const { data: existing } = await supabase
      .from('processed_events')
      .select('id')
      .eq('event_id', event_id)
      .maybeSingle()

    if (existing) {
      console.log(`[webhook] duplicate event ${event_id}, skipping`)
      return jsonResponse({ ok: true, skipped: true })
    }

    await supabase.from('processed_events').insert({ event_id })
  }

  // ── Act only on TERMINAL events ──
  // Alpaca's order object carries cumulative filled_qty / filled_avg_price on
  // every event, so the terminal event alone has the complete fill picture.
  // We ignore non-terminal events (incl. partial_fill) to avoid double-counting:
  // a fully-filled order — even one filled in several tranches — produces one
  // 'fill', and a partial-then-cancel produces 'canceled'/'expired' carrying the
  // filled quantity. (Alpaca spells the event 'canceled', one l.)
  const TERMINAL_EVENTS = ['fill', 'canceled', 'cancelled', 'expired']
  if (!TERMINAL_EVENTS.includes(event_type)) {
    return jsonResponse({ ok: true, action: 'ignored_non_terminal' })
  }

  const alpacaOrderId = order?.id
  if (!alpacaOrderId) {
    return jsonResponse({ error: 'Event missing order id' }, 400)
  }

  // ── Resolve OUR order row by the Alpaca order id (broker_order_ref) ──
  // This is the authoritative source of account_id + product_id. We never
  // trust identity fields on the Alpaca payload directly: the paper Trading
  // API uses a single shared account and its events do not carry our ids.
  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('order_id, account_id, product_id, side')
    .eq('broker_order_ref', alpacaOrderId)
    .maybeSingle()

  if (orderErr || !orderRow) {
    console.error('[webhook] no local order for broker ref', alpacaOrderId, orderErr)
    return jsonResponse({ error: 'No local order found for this fill' }, 422)
  }

  // Alpaca reports fills in USD; convert before ANY position/P&L/donation math.
  // (qty is a share count — no conversion. avg_cost_gbp is stored in GBP, so
  //  pnl_gbp and calculateDonation operate entirely in pounds.)
  const fill_price_gbp = usdToGbp(parseFloat(order.filled_avg_price ?? '0'))
  const qty            = parseFloat(order.filled_qty ?? '0')
  const commission_gbp = usdToGbp(parseFloat((order.commission ?? '0') as string))
  const side           = orderRow.side as 'buy' | 'sell'

  // ── Nothing filled (pure cancel / expire) → close the order, no side effects ──
  if (!(qty > 0)) {
    const empty_status = 'cancelled'  // permitted set: pending/filled/cancelled/failed
    await supabase.from('orders')
      .update({ status: empty_status })
      .eq('order_id', orderRow.order_id)
      .neq('status', 'filled')   // never override an already-filled order
    console.log('[webhook] terminal event with no fill', {
      order_id: orderRow.order_id, event_type, empty_status,
    })
    return jsonResponse({ ok: true, action: 'closed_no_fill', status: empty_status })
  }

  // Any terminal event that filled shares produced a position, so the order is
  // labelled 'filled' — including a partial-then-cancel (product decision).
  // orders.status only permits: pending / filled / cancelled / failed.
  const final_status = 'filled'

  // ── BUY fill: create/update the position (weighted-average cost basis) ──
  if (side === 'buy') {
    const { error: buyErr } = await supabase.rpc('record_buy_fill', {
      p_order_id:       orderRow.order_id,
      p_account_id:     orderRow.account_id,
      p_product_id:     orderRow.product_id,
      p_fill_price:     fill_price_gbp,
      p_qty:            qty,
      p_commission_gbp: commission_gbp,
      p_filled_at:      order.filled_at,
      p_final_status:   final_status,
    })

    if (buyErr) {
      console.error('[webhook] record_buy_fill failed', buyErr)
      return jsonResponse({ error: 'Failed to record buy fill' }, 500)
    }

    console.log('[webhook] buy fill recorded', {
      order_id: orderRow.order_id, qty, fill_price_gbp, final_status,
    })
    return jsonResponse({ ok: true, action: 'position_updated', filled_qty: qty, status: final_status })
  }

  // ── SELL fill: realise P&L, calculate donation, record atomically ──
  const { data: position, error: posErr } = await supabase
    .from('positions')
    .select('position_id, avg_cost_gbp')
    .eq('account_id', orderRow.account_id)
    .eq('product_id', orderRow.product_id)
    .maybeSingle()

  if (posErr || !position) {
    console.error('[webhook] position lookup failed', posErr)
    return jsonResponse({ error: 'Position not found for this sell' }, 422)
  }

  const avg_cost_gbp = position.avg_cost_gbp as number
  const pnl_gbp = (fill_price_gbp - avg_cost_gbp) * qty

  const result = calculateDonation({ pnl_gbp, commission_gbp })

  console.log('[webhook] donation result', {
    order_id:     orderRow.order_id,
    pnl_gbp,
    donation_gbp: result.donation_gbp,
    is_win:       result.is_win,
    is_capped:    result.is_capped,
  })

  // ── Write donation row + update order status atomically ──
  // Using supabase rpc for atomicity (edge case 2.10)
  const { error: rpcErr } = await supabase.rpc('record_fill_and_donation', {
    p_order_id:       orderRow.order_id,
    p_account_id:     orderRow.account_id,
    p_position_id:    position.position_id,
    p_fill_price_gbp: fill_price_gbp,
    p_qty:            qty,
    p_pnl_gbp:        pnl_gbp,
    p_donation_gbp:   result.donation_gbp,
    p_is_win:         result.is_win,
    p_is_capped:      result.is_capped,
    p_raw_donation:   result.raw_amount,
    p_commission_gbp: result.inputs.commission_gbp,
    p_filled_at:      order.filled_at,
    p_final_status:   final_status,
  })

  if (rpcErr) {
    console.error('[webhook] record_fill_and_donation failed', rpcErr)
    return jsonResponse({ error: 'Failed to record fill and donation' }, 500)
  }

  return jsonResponse({ ok: true, donation_gbp: result.donation_gbp, filled_qty: qty, status: final_status })
}

// ─── Alpaca order event shape (partial) ──────────────────────────────────────

interface AlpacaOrder {
  id:               string
  account_id:       string
  symbol:           string
  side:             'buy' | 'sell'
  filled_qty:       string
  filled_avg_price: string
  filled_at:        string
  commission?:      string | number
}

interface AlpacaOrderEvent {
  event:    string
  event_id?: string
  order:    AlpacaOrder
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleAction(action: string, body: Record<string, unknown>) {
  switch (action) {

    case 'get_account':
      return await alpacaGet('/v2/account')

    case 'get_positions':
      return await alpacaGet('/v2/positions')

    case 'get_orders': {
      const status = (body.status as string) ?? 'open'
      return await alpacaGet(`/v2/orders?status=${status}&limit=50`)
    }

    case 'place_order': {
      const { symbol, qty, side, type, time_in_force, account_id, notional_gbp } = body
      if (!symbol || !qty || !side) {
        throw new Error('place_order requires: symbol, qty, side')
      }
      if (!account_id) {
        // Needed to attribute the eventual fill to the right Butterfly account.
        throw new Error('place_order requires: account_id')
      }
      // orders.notional_gbp is NOT NULL. For a market order the true notional
      // isn't known until fill, so this is the INDICATIVE GBP value the review
      // screen showed the user (qty × displayed price). It is overwritten with
      // the actual executed value on fill. The client must supply it.
      const notional = Number(notional_gbp)
      if (!Number.isFinite(notional) || notional <= 0) {
        throw new Error('place_order requires: notional_gbp (positive number)')
      }

      const supabase = getSupabase()

      // Resolve our product_id from the ticker BEFORE touching Alpaca, so an
      // unknown symbol fails fast without leaving a dangling broker order.
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .select('product_id')
        .eq('ticker', symbol)
        .maybeSingle()

      if (prodErr || !product) {
        throw new Error(`No product found for ticker: ${symbol}`)
      }

      // Submit to Alpaca.
      const alpacaOrder = await alpacaPost('/v2/orders', {
        symbol,
        qty,
        side,
        type:          type ?? 'market',
        time_in_force: time_in_force ?? 'day',
      })

      // Persist OUR order row. broker_order_ref links it to the Alpaca order
      // so the fill webhook can resolve account_id + product_id authoritatively.
      const { data: orderRow, error: orderErr } = await supabase
        .from('orders')
        .insert({
          account_id,
          product_id:       product.product_id,
          side,
          quantity:         qty,
          notional_gbp:     notional,
          status:           'pending',
          broker_order_ref: alpacaOrder.id,
          placed_at:        new Date().toISOString(),
        })
        .select('order_id')
        .single()

      if (orderErr) {
        // Alpaca already accepted the order; log loudly for reconciliation.
        console.error('[place_order] placed at broker but local insert failed', {
          broker_order_ref: alpacaOrder.id, orderErr,
        })
        throw new Error('Order placed with broker but failed to persist locally')
      }

      return { ...alpacaOrder, butterfly_order_id: orderRow.order_id }
    }

    case 'cancel_order': {
      const { order_id } = body
      if (!order_id) throw new Error('cancel_order requires: order_id')
      return await alpacaDelete(`/v2/orders/${order_id}`)
    }

    /**
     * get_bars
     * Historical OHLC bars for the product price chart, converted USD → GBP.
     * Contract (services/trading.ts → getPriceHistory):
     *   request:  { symbol, timeframe, limit }   start/end optional overrides
     *   response: { symbol, currency, bars: [{ t, o, h, l, c }] } — oldest first
     */
    case 'get_bars': {
      const { symbol, timeframe, start, end, limit } = body
      if (!symbol) throw new Error('get_bars requires: symbol')

      const tf = (timeframe as string) ?? '1Day'
      // Clamp to something sane; RANGE_CONFIG tops out at 90.
      const requested = Math.min(Math.max(Number(limit) || 100, 1), 1000)

      const params = new URLSearchParams({
        timeframe: tf,
        limit:     String(requested),
        sort:      'desc', // most recent N bars within the window
        start:     (start as string) ?? lookbackStart(tf, requested),
        ...(end ? { end: end as string } : {}),
        // If Alpaca ever 403s with "subscription does not permit querying
        // recent SIP data", add:  feed: 'iex'
      })

      const raw = await alpacaGet(
        `/v2/stocks/${symbol}/bars?${params.toString()}`,
        ALPACA_DATA_URL
      )

      // Alpaca returns `bars: null` (not []) for symbols with no data.
      const bars: Array<Record<string, number | string>> =
        Array.isArray(raw?.bars) ? raw.bars : []
      bars.reverse() // desc → asc (oldest first, ready for charting)

      return {
        symbol,
        currency: 'GBP',
        bars: bars.map((b) => ({
          t: b.t,
          o: usdToGbp(b.o as number),
          h: usdToGbp(b.h as number),
          l: usdToGbp(b.l as number),
          c: usdToGbp(b.c as number),
        })),
      }
    }

    /**
     * get_latest_quote
     * Latest NBBO quote for a symbol, bid/ask converted USD → GBP.
     */
    case 'get_latest_quote': {
      const { symbol } = body
      if (!symbol) throw new Error('get_latest_quote requires: symbol')
      const raw = await alpacaGet(
        `/v2/stocks/${symbol}/quotes/latest`,
        ALPACA_DATA_URL
      )
      if (raw?.quote) {
        if (typeof raw.quote.ap === 'number') raw.quote.ap = usdToGbp(raw.quote.ap)
        if (typeof raw.quote.bp === 'number') raw.quote.bp = usdToGbp(raw.quote.bp)
      }
      return { ...raw, currency: 'GBP' }
    }

    /**
     * get_latest_bar
     * Latest OHLCV bar for a symbol, prices converted USD → GBP.
     * Feeds getLatestPrice() → buy cost estimate, sell proceeds, chart header,
     * and notional_gbp on order placement — must agree with get_bars.
     */
    case 'get_latest_bar': {
      const { symbol } = body
      if (!symbol) throw new Error('get_latest_bar requires: symbol')
      const raw = await alpacaGet(
        `/v2/stocks/${symbol}/bars/latest`,
        ALPACA_DATA_URL
      )
      if (raw?.bar) {
        for (const k of ['o', 'h', 'l', 'c'] as const) {
          if (typeof raw.bar[k] === 'number') raw.bar[k] = usdToGbp(raw.bar[k])
        }
      }
      return { ...raw, currency: 'GBP' }
    }

    /**
     * get_portfolio
     * Server-side (service-role) read of an account's portfolio: cash balance,
     * open holdings (joined to products for ticker/name), and matched-donation
     * impact per holding plus the account total. Routed through the function so
     * the app never depends on RLS or a particular auth session for reads.
     */
    case 'get_portfolio': {
      const { account_id } = body
      if (!account_id) throw new Error('get_portfolio requires: account_id')
      const supabase = getSupabase()

      const [{ data: account }, { data: positions }, { data: donations }] = await Promise.all([
        supabase.from('accounts')
          .select('cash_balance, currency')
          .eq('account_id', account_id).maybeSingle(),
        supabase.from('positions')
          .select('position_id, product_id, quantity, avg_cost_gbp, current_value_gbp, unrealised_pnl, products(ticker, name)')
          .eq('account_id', account_id).gt('quantity', 0),
        supabase.from('donations')
          .select('donation_amount_gbp, orders(product_id)')
          .eq('account_id', account_id),
      ])

      // Aggregate matched-donation impact per product and overall.
      const impactByProduct: Record<string, number> = {}
      let total_impact_gbp = 0
      for (const d of donations ?? []) {
        const amt = Number((d as Record<string, unknown>).donation_amount_gbp) || 0
        total_impact_gbp += amt
        const pid = ((d as Record<string, unknown>).orders as { product_id?: string } | null)?.product_id
        if (pid) impactByProduct[pid] = (impactByProduct[pid] ?? 0) + amt
      }

      const holdings = (positions ?? []).map((p) => {
        const row = p as Record<string, unknown>
        const product = row.products as { ticker?: string; name?: string } | null
        return {
          position_id:       row.position_id,
          product_id:        row.product_id,
          ticker:            product?.ticker ?? null,
          name:              product?.name ?? null,
          quantity:          Number(row.quantity),
          avg_cost_gbp:      Number(row.avg_cost_gbp),
          current_value_gbp: row.current_value_gbp != null ? Number(row.current_value_gbp) : null,
          impact_gbp:        impactByProduct[row.product_id as string] ?? 0,
        }
      })

      return {
        cash_balance:     Number(account?.cash_balance ?? 0),
        currency:         account?.currency ?? 'GBP',
        holdings,
        total_impact_gbp,
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

// ─── Response helper ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─── Entry point ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)

  // ── Webhook route: POST /alpaca-trading/webhook ──
  if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
    return await handleWebhook(req)
  }

  // ── Action proxy route ──
  try {
    const body = await req.json() as Record<string, unknown>
    const { action } = body

    if (!action) {
      return jsonResponse({ error: 'Missing required field: action' }, 400)
    }

    const data = await handleAction(action as string, body)
    return jsonResponse({ data })

  } catch (err) {
    console.error('[alpaca-trading]', err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500
    )
  }
})