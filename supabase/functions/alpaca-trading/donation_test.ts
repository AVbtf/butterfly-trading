/**
 * supabase/functions/alpaca-trading/donation_test.ts
 *
 * Unit tests for calculateDonation — the highest-risk business logic in the
 * build. Run from the repo root with:
 *
 *   deno test supabase/functions/alpaca-trading/
 *
 * (No permissions flags needed — this module is pure and has no I/O.)
 *
 * Confirmed model (product owner, 7 June 2026):
 *   Win  (pnl > 0): 5% of profit, capped at a flat £50,000.
 *   Loss (pnl ≤ 0): 5% of commission → £0.25 on the standard £5 commission.
 *   Break-even (pnl === 0) counts as a loss. Commission floored at £0.
 *   Donations floored to the penny.
 */

import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { calculateDonation, DONATION_CAP_GBP } from './donation.ts'

// ── Wins, under the cap ──────────────────────────────────────────────────────

Deno.test('win: 5% of profit, under cap', () => {
  const r = calculateDonation({ pnl_gbp: 500, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 25.0)
  assert(r.is_win)
  assert(!r.is_capped)
  assertAlmostEquals(r.raw_amount, 25.0, 1e-9)
})

Deno.test('win: small profit', () => {
  assertEquals(calculateDonation({ pnl_gbp: 10, commission_gbp: 5 }).donation_gbp, 0.5)
})

Deno.test('win: commission is irrelevant to a winning donation', () => {
  const r = calculateDonation({ pnl_gbp: 500, commission_gbp: 100 })
  assertEquals(r.donation_gbp, 25.0)        // unchanged by the £100 commission
  assertEquals(r.inputs.commission_gbp, 100) // but still recorded for the audit trail
})

// ── Penny flooring, including IEEE-754 boundary cases ────────────────────────
// These are the cases a naive Math.floor(x * 100) / 100 gets wrong by a penny.

Deno.test('floors to penny — IEEE-754 boundary cases', () => {
  assertEquals(calculateDonation({ pnl_gbp: 1.4, commission_gbp: 5 }).donation_gbp, 0.07)
  assertEquals(calculateDonation({ pnl_gbp: 2.8, commission_gbp: 5 }).donation_gbp, 0.14)
  assertEquals(calculateDonation({ pnl_gbp: 5.8, commission_gbp: 5 }).donation_gbp, 0.29)
  assertEquals(calculateDonation({ pnl_gbp: 11.6, commission_gbp: 5 }).donation_gbp, 0.58)
})

Deno.test('floors genuine sub-penny amounts DOWN', () => {
  assertEquals(calculateDonation({ pnl_gbp: 10.07, commission_gbp: 5 }).donation_gbp, 0.5)  // 0.5035 → 0.50
  assertEquals(calculateDonation({ pnl_gbp: 33.33, commission_gbp: 5 }).donation_gbp, 1.66) // 1.6665 → 1.66
  assertEquals(calculateDonation({ pnl_gbp: 0.19, commission_gbp: 5 }).donation_gbp, 0.0)   // 0.0095 → 0.00
})

// ── The £50,000 cap ──────────────────────────────────────────────────────────

Deno.test('cap: exactly £1,000,000 profit hits £50,000 but is NOT clamped', () => {
  // Cap binds only when 5% EXCEEDS £50k (profit > £1m). At exactly £1m the
  // match equals the cap and is_capped is false — nothing was clamped.
  const r = calculateDonation({ pnl_gbp: 1_000_000, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 50_000)
  assertEquals(r.is_capped, false)
})

Deno.test('cap: just over £1,000,000 is clamped', () => {
  const r = calculateDonation({ pnl_gbp: 1_000_000.01, commission_gbp: 5 })
  assertEquals(r.donation_gbp, DONATION_CAP_GBP)
  assert(r.is_capped)
})

Deno.test('cap: far above the cap stays flat at £50,000', () => {
  const r = calculateDonation({ pnl_gbp: 1_800_000, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 50_000)
  assert(r.is_capped)
  assertEquals(r.raw_amount, DONATION_CAP_GBP) // raw is the cap, not 5% of pnl
})

Deno.test('cap: just under the threshold is not capped', () => {
  const r = calculateDonation({ pnl_gbp: 999_999.99, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 49_999.99)
  assertEquals(r.is_capped, false)
})

// ── Confirmed model vs superseded doc (NO proration) ─────────────────────────
// The May-2026 edge-case doc (Section 2 core formula, Section 4.4) described the
// £50k as a POSITION-NOTIONAL cap with a proration: donation × (50,000/notional).
// The product owner superseded this: the £50k is a FLAT cap on the donation
// amount, with NO proration. This guard pins that decision so the proration
// model can never be reintroduced.
Deno.test('no proration: flat 5% even when position notional exceeds £50k', () => {
  // Doc 4.4 example: £75k notional position, £2,000 gain on close.
  // Superseded model would give (2000 × 0.05) × (50000/75000) = £66.67.
  // Confirmed flat model gives 5% × 2000 = £100.00 (cap not binding).
  const r = calculateDonation({ pnl_gbp: 2000, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 100.0)
  assertEquals(r.is_capped, false)
})

// ── Losses ───────────────────────────────────────────────────────────────────

Deno.test('loss: donates 5% of the £5 commission = £0.25', () => {
  const r = calculateDonation({ pnl_gbp: -100, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 0.25)
  assert(!r.is_win)
  assert(!r.is_capped)
})

Deno.test('loss: donation depends on commission only, not loss size', () => {
  assertEquals(calculateDonation({ pnl_gbp: -1_000_000, commission_gbp: 5 }).donation_gbp, 0.25)
})

Deno.test('loss: zero commission donates nothing', () => {
  assertEquals(calculateDonation({ pnl_gbp: -100, commission_gbp: 0 }).donation_gbp, 0.0)
})

// ── Break-even (pnl === 0) is treated as a loss ──────────────────────────────

Deno.test('break-even: treated as a loss, donates on commission', () => {
  const r = calculateDonation({ pnl_gbp: 0, commission_gbp: 5 })
  assertEquals(r.donation_gbp, 0.25)
  assertEquals(r.is_win, false)
})

Deno.test('break-even with zero commission donates nothing', () => {
  assertEquals(calculateDonation({ pnl_gbp: 0, commission_gbp: 0 }).donation_gbp, 0.0)
})

// ── Commission floored at zero ───────────────────────────────────────────────

Deno.test('negative commission is floored to £0 (loss side)', () => {
  const r = calculateDonation({ pnl_gbp: -50, commission_gbp: -3 })
  assertEquals(r.donation_gbp, 0.0)
  assertEquals(r.inputs.commission_gbp, 0) // floored value recorded
})

Deno.test('negative commission is floored to £0 (recorded on a win too)', () => {
  const r = calculateDonation({ pnl_gbp: 500, commission_gbp: -3 })
  assertEquals(r.donation_gbp, 25.0)
  assertEquals(r.inputs.commission_gbp, 0)
})

// ── Audit-trail shape ────────────────────────────────────────────────────────

Deno.test('result carries the full audit shape', () => {
  const r = calculateDonation({ pnl_gbp: 500, commission_gbp: 5 })
  assertEquals(Object.keys(r).sort(), [
    'donation_gbp', 'inputs', 'is_capped', 'is_win', 'raw_amount',
  ])
  assertEquals(r.inputs.pnl_gbp, 500)
  assertEquals(r.inputs.commission_gbp, 5)
})

Deno.test('raw_amount keeps full precision for uncapped wins', () => {
  const r = calculateDonation({ pnl_gbp: 999_999.99, commission_gbp: 5 })
  assertAlmostEquals(r.raw_amount, 49_999.9995, 1e-6) // pre-floor, full precision
  assertEquals(r.donation_gbp, 49_999.99)             // floored for the actual donation
})
