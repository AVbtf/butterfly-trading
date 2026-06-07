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

// ─── Environment ──────────────────────────────────────────────────────────────

const ALPACA_API_KEY    = Deno.env.get('ALPACA_API_KEY')!
const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY')!
const ALPACA_BASE_URL   = Deno.env.get('ALPACA_BASE_URL') ?? 'https://paper-api.alpaca.markets'
const ALPACA_DATA_URL   = 'https://data.alpaca.markets'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Butterfly matches 5% of profit on winning trades.
 * Our matching contribution is capped at £50,000 per trade to mitigate
 * liquidity risk. The cap triggers when pnl_gbp × 0.05 > £50,000,
 * i.e. when profit exceeds £1,000,000.
 *
 * Examples:
 *   pnl = £1,000,000 → match = £50,000 (5% exactly hits cap)
 *   pnl = £1,800,000 → match = £50,000 (capped)
 *   pnl = £500       → match = £25.00   (5%, under cap)
 */
const DONATION_RATE      = 0.05
const DONATION_CAP_GBP   = 50_000

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

interface DonationInput {
  pnl_gbp:        number  // Realised P&L on the closing trade (negative = loss)
  commission_gbp: number  // Broker commission for this order (floor at 0)
}

interface DonationResult {
  donation_gbp:  number   // Rounded down to nearest penny
  is_win:        boolean
  is_capped:     boolean  // True if the £50k cap was applied
  raw_amount:    number   // Pre-cap, pre-rounding amount (for audit log)
  inputs:        DonationInput
}

/**
 * calculateDonation
 *
 * Win  (pnl > 0): donation = pnl × 5%, capped at £50,000
 * Loss (pnl ≤ 0): donation = commission × 5%  (break-even treated as loss)
 *
 * All results rounded DOWN to the nearest penny (floor), always in
 * favour of the user. Full-precision raw_amount stored for audit trail.
 */
export function calculateDonation(input: DonationInput): DonationResult {
  const { pnl_gbp } = input
  const commission_gbp = Math.max(0, input.commission_gbp) // Edge case 2.3: floor at 0

  const is_win = pnl_gbp > 0

  let raw_amount: number
  let is_capped = false

  if (is_win) {
    const uncapped = pnl_gbp * DONATION_RATE
    if (uncapped > DONATION_CAP_GBP) {
      raw_amount = DONATION_CAP_GBP
      is_capped  = true
    } else {
      raw_amount = uncapped
    }
  } else {
    // Loss or break-even (edge case 2.1): donate on commission only
    raw_amount = commission_gbp * DONATION_RATE
  }

  // Round DOWN to nearest penny — always in favour of the user (edge case 2.4)
  const donation_gbp = Math.floor(raw_amount * 100) / 100

  return {
    donation_gbp,
    is_win,
    is_capped,
    raw_amount,
    inputs: { pnl_gbp, commission_gbp },
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

/**
 * handleWebhook
 *
 * Receives Alpaca order status events. On a confirmed 'fill' for a sell order:
 *   1. Deduplicates via processed_events table (edge case 8.4 / idempotency)
 *   2. Looks up the position's avg_cost_gbp from Supabase
 *   3. Calculates realised P&L
 *   4. Calls calculateDonation
 *   5. Writes donation row atomically with order status update
 *
 * Non-fill events (pending, cancelled, rejected) are acknowledged and ignored
 * for donation purposes — no donation row is ever created for them.
 */
async function handleWebhook(req: Request): Promise<Response> {
  const supabase = getSupabase()

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400)
  }

  const event      = payload as AlpacaOrderEvent
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

  // ── Only fire donation logic on confirmed fills for sell orders ──
  // Buy fills create/update positions; donations only trigger on close (sell).
  if (event_type !== 'fill' || order?.side !== 'sell') {
    return jsonResponse({ ok: true, action: 'no_donation_required' })
  }

  // ── Look up position to get avg_cost_gbp ──
  const { data: position, error: posErr } = await supabase
    .from('positions')
    .select('id, avg_cost_gbp, account_id')
    .eq('symbol', order.symbol)
    .eq('account_id', order.account_id)
    .maybeSingle()

  if (posErr || !position) {
    console.error('[webhook] position lookup failed', posErr)
    return jsonResponse({ error: 'Position not found for this order' }, 422)
  }

  // ── Calculate realised P&L ──
  const fill_price_gbp  = parseFloat(order.filled_avg_price ?? '0')
  const qty             = parseFloat(order.filled_qty ?? '0')
  const avg_cost_gbp    = position.avg_cost_gbp as number
  const commission_gbp  = parseFloat((order.commission ?? '0') as string)

  const pnl_gbp = (fill_price_gbp - avg_cost_gbp) * qty

  // ── Calculate donation ──
  const result = calculateDonation({ pnl_gbp, commission_gbp })

  console.log('[webhook] donation result', {
    order_id:      order.id,
    pnl_gbp,
    donation_gbp:  result.donation_gbp,
    is_win:        result.is_win,
    is_capped:     result.is_capped,
  })

  // ── Write donation row + update order status atomically ──
  // Using supabase rpc for atomicity (edge case 2.10)
  const { error: rpcErr } = await supabase.rpc('record_fill_and_donation', {
    p_order_id:       order.id,
    p_account_id:     position.account_id,
    p_position_id:    position.id,
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
      const { symbol, qty, side, type, time_in_force } = body
      if (!symbol || !qty || !side) {
        throw new Error('place_order requires: symbol, qty, side')
      }
      return await alpacaPost('/v2/orders', {
        symbol,
        qty,
        side,
        type:          type ?? 'market',
        time_in_force: time_in_force ?? 'day',
      })
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

serve(async (req) => {
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
