-- "موظفك في ركين" / مدير الولاء — a thin, op-id-idempotent wrapper around the
-- EXISTING adjust_loyalty_balance() so a guided balance change is safe to
-- replay (network retry, double-tap, reload). The threshold-crossing reward
-- math, the mandatory-reason rule, the negative-balance guard, the
-- loyalty_adjustments audit row, the SECURITY DEFINER permission check
-- (settings:edit) — all of that stays in adjust_loyalty_balance, called
-- verbatim here. This block only adds: a per-business advisory lock + a
-- ledger row keyed by op_id that stores (and on replay, returns) the result.

create table if not exists loyalty_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'loyalty_adjust',
  customer_id bigint references customers(id) on delete set null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table loyalty_guided_ops enable row level security;
-- SECURITY DEFINER function is the only writer → zero policies (deny-all).

create or replace function adjust_loyalty_balance_guided(
  p_op_id text,
  p_customer_id bigint,
  p_kind text,
  p_delta int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_prev jsonb;
  v_res jsonb;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  -- serialize guided loyalty ops per business → op-replay races impossible
  perform pg_advisory_xact_lock(hashtext('rka_loyalty_biz:' || v_bid::text));

  select result into v_prev from loyalty_guided_ops where op_id = p_op_id;
  if v_prev is not null then
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- the real work — unchanged. It re-derives current_business_id() itself and
  -- re-checks has_permission('settings:edit'); it returns {ok:false,error:...}
  -- rather than raising, so we surface that as-is without writing the ledger.
  v_res := adjust_loyalty_balance(p_customer_id, p_kind, p_delta, p_reason);

  if coalesce((v_res->>'ok')::boolean, false) then
    insert into loyalty_guided_ops (op_id, business_id, kind, customer_id, result)
    values (p_op_id, v_bid, 'loyalty_adjust', p_customer_id, v_res);
  end if;

  return v_res;
end;
$$;
revoke all on function adjust_loyalty_balance_guided(text, bigint, text, int, text) from public, anon;
grant execute on function adjust_loyalty_balance_guided(text, bigint, text, int, text) to authenticated;
