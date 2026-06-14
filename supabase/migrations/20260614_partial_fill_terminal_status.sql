-- supabase/migrations/20260614_partial_fill_terminal_status.sql
-- Phase 4 — partial-fill handling.
--
-- The webhook now acts on TERMINAL events (fill / canceled / expired) using the
-- cumulative filled_qty on the order. A partial-then-cancel fills some shares
-- then terminates, so the order's final status must be 'partially_filled_cancelled'
-- rather than 'filled'. Both fill RPCs take a p_final_status parameter to carry
-- that, and their idempotency guard now treats any terminal status as "done".
--
-- Adding a parameter changes each function's signature, so the old versions are
-- dropped first (CREATE OR REPLACE only replaces an identical signature; without
-- the DROP we'd be left with two overloads).

-- ── record_buy_fill ──────────────────────────────────────────────────────────
drop function if exists record_buy_fill(uuid, uuid, uuid, numeric, numeric, numeric, timestamptz);

create or replace function record_buy_fill(
  p_order_id       uuid,
  p_account_id     uuid,
  p_product_id     uuid,
  p_fill_price     numeric,
  p_qty            numeric,
  p_commission_gbp numeric,
  p_filled_at      timestamptz,
  p_final_status   text default 'filled'
)
returns void
language plpgsql
security definer
as $$
begin
  -- Idempotency: skip if the order is already in a terminal state.
  if exists (
    select 1 from orders
    where order_id = p_order_id
      and status in ('filled', 'partially_filled_cancelled')
  ) then
    return;
  end if;

  update orders
     set status         = p_final_status,
         fill_price     = p_fill_price,
         commission_gbp = p_commission_gbp,
         notional_gbp   = p_fill_price * p_qty,  -- actual executed value
         filled_at      = p_filled_at
   where order_id = p_order_id;

  -- Create or update the position with a weighted-average cost basis.
  -- Commission is intentionally EXCLUDED from avg_cost_gbp to stay symmetric
  -- with the sell-side P&L formula: (fill_price - avg_cost) * qty.
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

-- ── record_fill_and_donation ─────────────────────────────────────────────────
drop function if exists record_fill_and_donation(
  uuid, uuid, uuid, numeric, numeric, numeric, timestamptz, numeric, numeric, boolean, boolean, numeric);

create or replace function record_fill_and_donation(
  p_order_id       uuid,
  p_account_id     uuid,
  p_position_id    uuid,
  p_fill_price_gbp numeric,
  p_qty            numeric,
  p_pnl_gbp        numeric,
  p_filled_at      timestamptz,
  p_commission_gbp numeric,
  p_donation_gbp   numeric,
  p_is_win         boolean,
  p_is_capped      boolean,
  p_raw_donation   numeric,
  p_final_status   text default 'filled'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_existing_qty  numeric;
  v_existing_cost numeric;
  v_donation_id   uuid;
begin
  if not exists (
    select 1 from orders
    where order_id   = p_order_id
      and account_id = p_account_id
  ) then
    raise exception 'Order % not found for account %', p_order_id, p_account_id;
  end if;

  -- Idempotency: skip if the order is already in a terminal state.
  if exists (
    select 1 from orders
    where order_id = p_order_id
      and status in ('filled', 'partially_filled_cancelled')
  ) then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_terminal');
  end if;

  update orders set
    fill_price     = p_fill_price_gbp,
    commission_gbp = p_commission_gbp,
    pnl_gbp        = p_pnl_gbp,
    status         = p_final_status,
    filled_at      = p_filled_at
  where order_id = p_order_id;

  select quantity, avg_cost_gbp
    into v_existing_qty, v_existing_cost
    from positions
   where position_id = p_position_id
   for update;
  if not found then
    raise exception 'Position % not found', p_position_id;
  end if;

  if p_qty > v_existing_qty then
    raise exception
      'Sell quantity (%) exceeds held position quantity (%) for position %',
      p_qty, v_existing_qty, p_position_id;
  end if;

  update positions set
    quantity          = v_existing_qty - p_qty,
    current_value_gbp = (v_existing_qty - p_qty) * p_fill_price_gbp,
    updated_at        = now()
  where position_id = p_position_id;

  insert into donations (
    order_id,
    account_id,
    campaign_id,
    trigger,
    basis_amount_gbp,
    match_pct,
    donation_amount_gbp,
    status,
    created_at
  ) values (
    p_order_id,
    p_account_id,
    null,
    case when p_is_win then 'win' else 'loss' end,
    case when p_is_win then p_pnl_gbp else p_commission_gbp end,
    5,
    p_donation_gbp,
    'pending',
    now()
  )
  returning donation_id into v_donation_id;

  return jsonb_build_object(
    'ok',           true,
    'donation_id',  v_donation_id,
    'donation_gbp', p_donation_gbp,
    'is_win',       p_is_win,
    'is_capped',    p_is_capped
  );
end;
$$;
