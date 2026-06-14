/**
 * supabase/functions/alpaca-trading/index.ts
 *
 * Secure proxy between the Butterfly Trading app and the Alpaca Paper Trading API.
 *
 * All Alpaca API calls are routed through this function so that API keys
 * never touch the client bundle.
 *
 * Supported actions (passed as JSON body):
 *   { action: 'get_account' }
 *   { action: 'get_positions' }
 *   { action: 'get_orders', status?: 'open' | 'closed' | 'all' }
 *   { action: 'place_order', symbol, qty, side, type, time_in_force }
 *   { action: 'cancel_order', order_id }
 *   { action: 'get_bars', symbol, timeframe, start, end }
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

  // ── Only act on confirmed full fills ──
  // (partial_fill handling is a separate follow-up — see session notes)
  if (event_type !== 'fill') {
    return jsonResponse({ ok: true, action: 'ignored_non_fill' })
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

  const fill_price_gbp = parseFloat(order.filled_avg_price ?? '0')
  const qty            = parseFloat(order.filled_qty ?? '0')
  const commission_gbp = parseFloat((order.commission ?? '0') as string)
  const side           = orderRow.side as 'buy' | 'sell'

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
    })

    if (buyErr) {
      console.error('[webhook] record_buy_fill failed', buyErr)
      return jsonResponse({ error: 'Failed to record buy fill' }, 500)
    }

    console.log('[webhook] buy fill recorded', {
      order_id: orderRow.order_id, qty, fill_price_gbp,
    })
    return jsonResponse({ ok: true, action: 'position_updated' })
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
  })

  if (rpcErr) {
    console.error('[webhook] record_fill_and_donation failed', rpcErr)
    return jsonResponse({ error: 'Failed to record fill and donation' }, 500)
  }

  return jsonResponse({ ok: true, donation_gbp: result.donation_gbp })
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

    case 'get_bars': {
      const { symbol, timeframe, start, end } = body
      if (!symbol) throw new Error('get_bars requires: symbol')
      const params = new URLSearchParams({
        timeframe: (timeframe as string) ?? '1Day',
        ...(start ? { start: start as string } : {}),
        ...(end   ? { end:   end   as string } : {}),
        limit: '100',
      })
      return await alpacaGet(
        `/v2/stocks/${symbol}/bars?${params.toString()}`,
        ALPACA_DATA_URL
      )
    }

    /**
     * get_latest_quote
     * Returns the latest NBBO quote (bid/ask + sizes) for a symbol.
     * Use for real-time price display on product detail screens.
     */
    case 'get_latest_quote': {
      const { symbol } = body
      if (!symbol) throw new Error('get_latest_quote requires: symbol')
      return await alpacaGet(
        `/v2/stocks/${symbol}/quotes/latest`,
        ALPACA_DATA_URL
      )
    }

    /**
     * get_latest_bar
     * Returns the latest OHLCV bar for a symbol.
     * Use for current price + intraday change calculations.
     */
    case 'get_latest_bar': {
      const { symbol } = body
      if (!symbol) throw new Error('get_latest_bar requires: symbol')
      return await alpacaGet(
        `/v2/stocks/${symbol}/bars/latest`,
        ALPACA_DATA_URL
      )
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
