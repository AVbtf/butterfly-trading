-- supabase/migrations/20260613_record_buy_fill.sql
-- Phase 4 — Buy fill handling
--
-- Adds:
--   1. Unique constraint on positions(account_id, product_id) so buy fills
--      can upsert exactly one position row per (account, product).
--   2. record_buy_fill() — atomic order-close + weighted-average position update,
--      mirroring the sell-side record_fill_and_donation pattern.

-- ── 1. Unique constraint (guarded so the migration is re-runnable) ──
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_account_product_unique'
  ) then
    alter table positions
      add constraint positions_account_product_unique unique (account_id, product_id);
  end if;
end $$;

-- ── 2. Atomic buy-fill handler ──
create or replace function record_buy_fill(
  p_order_id       uuid,
  p_account_id     uuid,
  p_product_id     uuid,
  p_fill_price     numeric,
  p_qty            numeric,
  p_commission_gbp numeric,
  p_filled_at      timestamptz
)
returns void
language plpgsql
security definer
as $$
begin
  -- Idempotency guard (belt-and-braces with the webhook's processed_events
  -- dedup): if this order is already filled, do nothing.
  if exists (select 1 from orders where order_id = p_order_id and status = 'filled') then
    return;
  end if;

  -- Close out the order row.
  update orders
     set status         = 'filled',
         fill_price     = p_fill_price,
         commission_gbp = p_commission_gbp,
         notional_gbp   = p_fill_price * p_qty,  -- actual executed value (overwrites the indicative estimate)
         filled_at      = p_filled_at
   where order_id = p_order_id;

  -- Create or update the position with a weighted-average cost basis.
  -- NOTE: commission is intentionally EXCLUDED from avg_cost_gbp to stay
  -- symmetric with the sell-side P&L formula: (fill_price - avg_cost) * qty.
  -- If you want a commission-inclusive cost basis, add it into the values/
  -- excluded terms here AND mirror it on the sell side.
  insert into positions (position_id, account_id, product_id, quantity, avg_cost_gbp, updated_at)
  values (gen_random_uuid(), p_account_id, p_product_id, p_qty, p_fill_price, now())
  on conflict (account_id, product_id) do update
     set avg_cost_gbp = ((positions.quantity * positions.avg_cost_gbp)
                          + (excluded.quantity * excluded.avg_cost_gbp))
                        / (positions.quantity + excluded.quantity),
         quantity     = positions.quantity + excluded.quantity,
         updated_at   = now();
end;
$$;
