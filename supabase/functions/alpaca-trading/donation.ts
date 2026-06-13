/**
 * supabase/functions/alpaca-trading/donation.ts
 *
 * Butterfly's matching-contribution logic, isolated from the edge-function
 * entry point so it can be unit-tested without booting the HTTP server.
 *
 *   Win  (pnl > 0): donation = 5% of profit, capped at £50,000.
 *                   The cap binds when profit EXCEEDS £1,000,000. At exactly
 *                   £1m the match is £50,000 and is_capped is FALSE — nothing
 *                   was clamped (5% simply equals the cap).
 *   Loss (pnl ≤ 0): donation = 5% of commission. Break-even (pnl === 0) is
 *                   treated as a loss. Commission is floored at £0.
 *
 * All results are floored to the nearest penny (always in the user's favour).
 * raw_amount preserves full precision for the audit trail.
 */

export const DONATION_RATE   = 0.05
export const DONATION_CAP_GBP = 50_000

export interface DonationInput {
  pnl_gbp:        number  // Realised P&L on the closing trade (negative = loss)
  commission_gbp: number  // Broker commission for this order (floored at 0)
}

export interface DonationResult {
  donation_gbp:  number   // Floored to nearest penny
  is_win:        boolean
  is_capped:     boolean  // True only if the £50k cap clamped the amount
  raw_amount:    number   // Pre-rounding amount (for audit log)
  inputs:        DonationInput
}

export function calculateDonation(input: DonationInput): DonationResult {
  const { pnl_gbp } = input
  const commission_gbp = Math.max(0, input.commission_gbp) // floor at 0 (edge 2.3)

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
    // Loss or break-even (edge case 2.1): donate on commission only.
    raw_amount = commission_gbp * DONATION_RATE
  }

  // Floor to the nearest penny — always in the user's favour (edge case 2.4).
  //
  // The + 1e-7 absorbs IEEE-754 floating-point dust before flooring. Without
  // it, 0.05 * 1.40 === 0.06999999999999999, which would floor to £0.06 rather
  // than the correct £0.07. The dust on these products is ~1e-9 at most; 1e-7
  // of a penny clears it with ~100x margin yet is far too small to push a
  // genuine sub-penny amount across a penny boundary. (See donation_test.ts:
  // "floors to penny — IEEE-754 boundary cases".)
  const donation_gbp = Math.floor(raw_amount * 100 + 1e-7) / 100

  return {
    donation_gbp,
    is_win,
    is_capped,
    raw_amount,
    inputs: { pnl_gbp, commission_gbp },
  }
}