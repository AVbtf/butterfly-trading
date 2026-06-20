/**
 * services/trading.ts
 *
 * Trading service for Butterfly Trading.
 *
 * Unlike services/account.ts (mock), this talks to the LIVE backend: the
 * deployed `alpaca-trading` Supabase edge function. Reads and writes are routed
 * through that function (service-role) so the app never depends on RLS policies
 * or a particular auth session for trading data.
 *
 * Backend actions used (see supabase/functions/alpaca-trading/index.ts):
 *   get_portfolio    — cash, holdings, matched-donation impact
 *   place_order      — submit a buy/sell (requires account_id + notional_gbp)
 *   get_latest_bar   — latest price for a symbol (for cost estimates)
 *   get_bars         — historical price bars for a symbol (for the price chart)
 *
 * NOTE on account_id: the app's account layer is still mock, so there is no
 * real account_id flowing from the UI yet. getActiveAccountId() derives it from
 * the authenticated session where one exists, and otherwise falls back to the
 * seeded dev account so the UI is testable against real data. Remove the dev
 * fallback once accountService is wired to the real `accounts` table.
 */

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderSide = 'buy' | 'sell';

export interface Holding {
  positionId: string;
  productId: string;
  ticker: string | null;
  name: string | null;
  quantity: number;
  avgCostGbp: number;
  /** Last value written on a fill; may be null for buy-created positions. */
  currentValueGbp: number | null;
  /** Matched-donation impact attributed to this holding (GBP). */
  impactGbp: number;
}

export interface Portfolio {
  cashBalance: number;
  currency: string;
  holdings: Holding[];
  totalImpactGbp: number;
}

export interface PlaceOrderParams {
  accountId: string;
  symbol: string;
  qty: number;
  side: OrderSide;
  /** Indicative GBP value shown to the user at review (qty × displayed price). */
  notionalGbp: number;
}

export interface PlaceOrderResult {
  /** Our orders.order_id for the persisted order row. */
  butterflyOrderId: string;
  /** Raw Alpaca order id (broker_order_ref). */
  brokerOrderRef: string;
  status: string;
}

/** Supported chart ranges (UI). */
export type PriceRange = '1W' | '1M' | '3M' | '1Y';

/** A single OHLC price bar. Timestamp is ISO 8601. */
export interface PriceBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

// ─── Dev fallback ───────────────────────────────────────────────────────────
// The seeded test account from backend testing. Used only when there is no
// authenticated session yet (mock account layer). DELETE once auth+accounts
// are real.
const DEV_ACCOUNT_ID = 'bd2cfffe-20b3-4e93-91ff-42b44715360a';

// Maps a UI range to an Alpaca bar timeframe + how many bars to request.
// Tune these alongside the get_bars action once it's deployed.
const RANGE_CONFIG: Record<PriceRange, { timeframe: string; limit: number }> = {
  '1W': { timeframe: '1Hour', limit: 56 },
  '1M': { timeframe: '1Day', limit: 30 },
  '3M': { timeframe: '1Day', limit: 90 },
  '1Y': { timeframe: '1Week', limit: 52 },
};

// ─── Edge-function helper ─────────────────────────────────────────────────────

/**
 * Invokes an `alpaca-trading` action and normalises the response.
 *
 * The function wraps successful action results as `{ data: <result> }` and
 * returns `{ error: <message> }` with a non-2xx status on failure. This unwraps
 * the nested data and surfaces the function's own error message.
 */
async function invokeAction<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('alpaca-trading', {
    body: { action, ...params },
  });

  if (error) {
    let message = error.message;
    // Read the function's `{ error }` body off the failed response, if present.
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const body = await ctx?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // fall back to error.message
    }
    throw new Error(message);
  }

  // Action route nests its payload under `data`.
  return ((data as { data?: T })?.data ?? (data as T));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const tradingService = {
  /**
   * Resolves the account_id to trade/read against.
   * Prefers the authenticated user's account; falls back to the seeded dev
   * account when there is no session (mock account layer).
   */
  async getActiveAccountId(): Promise<string> {
    // ⚠️ TEMP: view seeded data — REMOVE this line to use the real logged-in account.
    return DEV_ACCOUNT_ID;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('accounts')
          .select('account_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (data?.account_id) return data.account_id as string;
      }
    } catch {
      // fall through to dev fallback
    }
    console.warn('[trading] no session account — using DEV_ACCOUNT_ID fallback');
    return DEV_ACCOUNT_ID;
  },

  /** Fetches cash, holdings, and matched-donation impact for an account. */
  async getPortfolio(accountId: string): Promise<Portfolio> {
    const data = await invokeAction<{
      cash_balance: number;
      currency: string;
      total_impact_gbp: number;
      holdings: Array<{
        position_id: string;
        product_id: string;
        ticker: string | null;
        name: string | null;
        quantity: number;
        avg_cost_gbp: number;
        current_value_gbp: number | null;
        impact_gbp: number;
      }>;
    }>('get_portfolio', { account_id: accountId });

    return {
      cashBalance: data.cash_balance,
      currency: data.currency,
      totalImpactGbp: data.total_impact_gbp,
      holdings: data.holdings.map((h) => ({
        positionId: h.position_id,
        productId: h.product_id,
        ticker: h.ticker,
        name: h.name,
        quantity: h.quantity,
        avgCostGbp: h.avg_cost_gbp,
        currentValueGbp: h.current_value_gbp,
        impactGbp: h.impact_gbp,
      })),
    };
  },

  /**
   * Submits a buy or sell order.
   * Backend submits to Alpaca, then persists an orders row; the fill arrives
   * later via the webhook (position + donation effects).
   */
  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    const data = await invokeAction<{
      butterfly_order_id: string;
      id: string;
      status: string;
    }>('place_order', {
      account_id: params.accountId,
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      notional_gbp: params.notionalGbp,
    });

    return {
      butterflyOrderId: data.butterfly_order_id,
      brokerOrderRef: data.id,
      status: data.status,
    };
  },

  /**
   * Latest price for a symbol, used to estimate order cost on the review screen.
   * Returns null if the market-data endpoint can't price the symbol (e.g. LSE
   * tickers on the US paper endpoint) — callers should degrade gracefully.
   */
  async getLatestPrice(symbol: string): Promise<number | null> {
    try {
      const bar = await invokeAction<{ bar?: { c?: number } }>('get_latest_bar', { symbol });
      const close = bar?.bar?.c;
      return typeof close === 'number' ? close : null;
    } catch {
      return null;
    }
  },

  /**
   * Historical price bars for a symbol over a UI range, used to draw the product
   * price chart. Calls the `get_bars` edge action (Alpaca historical bars).
   *
   * Returns [] when the market-data endpoint can't serve the symbol (e.g. LSE
   * tickers on the US paper endpoint) so callers can fall back to an empty/mock
   * state.
   *
   * NOTE: requires a `get_bars` action to be added to the alpaca-trading edge
   * function and deployed. Until then this resolves to [].
   */
  async getPriceHistory(symbol: string, range: PriceRange): Promise<PriceBar[]> {
    const { timeframe, limit } = RANGE_CONFIG[range];
    try {
      const res = await invokeAction<{ bars?: PriceBar[] }>('get_bars', {
        symbol,
        timeframe,
        limit,
      });
      return res?.bars ?? [];
    } catch {
      return [];
    }
  },
};