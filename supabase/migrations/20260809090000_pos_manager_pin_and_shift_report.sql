-- Real manager-approval PIN for the POS's sensitive actions (closing a
-- shift / cash reconciliation). Previously openPinModal() on the POS side
-- accepted ANY 4 digits and always showed "تمت موافقة المدير" — a fully
-- decorative gate. This makes it real: one PIN per business, set only by
-- the owner from the dashboard (screen:settings), hashed (never stored or
-- returned in plaintext), verified server-side via a security-definer RPC
-- the POS calls directly.
create extension if not exists pgcrypto;

alter table businesses add column pos_manager_pin_hash text;

create or replace function set_pos_manager_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_permission('screen:settings') then
    raise exception 'not authorized';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid pin format';
  end if;
  update businesses set pos_manager_pin_hash = crypt(p_pin, gen_salt('bf'))
    where id = current_business_id();
end;
$$;

-- Returns true (correct), false (wrong pin), or null (no pin set yet for
-- this business) — three distinct outcomes the POS needs to tell apart so
-- it can nudge the owner to set one up instead of just saying "wrong pin".
create or replace function verify_pos_manager_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  select pos_manager_pin_hash into v_hash from businesses where id = current_business_id();
  if v_hash is null then
    return null;
  end if;
  return v_hash = crypt(p_pin, v_hash);
end;
$$;

-- End-of-shift reconciliation report — nothing printed/exported this today
-- at all (the closing wizard only ever showed the numbers in-modal, once,
-- then discarded them). Persists exactly what was shown at close time so it
-- can be printed via the existing ESC/POS receipt pipeline and reprinted
-- later if needed, same reasoning as why orders keep their own snapshot
-- instead of being recomputed from scratch after the fact.
create table shift_closing_reports (
  id bigint generated always as identity primary key,
  shift_id bigint not null references shifts(id),
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  closed_by uuid not null references profiles(id),
  orders_count int not null,
  sales_total numeric not null,
  cash_expected numeric not null,
  cash_counted numeric not null,
  cash_variance numeric not null,
  card_total numeric not null,
  delivery_platform_total numeric not null,
  created_at timestamptz not null default now()
);
create index shift_closing_reports_shift_id_idx on shift_closing_reports(shift_id);
create index shift_closing_reports_branch_id_idx on shift_closing_reports(branch_id, created_at desc);
alter table shift_closing_reports enable row level security;

create policy shift_closing_reports_select on shift_closing_reports for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:reports')));
create policy shift_closing_reports_insert on shift_closing_reports for insert
  with check (business_id = current_business_id() and has_permission('pos:register') and closed_by = auth.uid());
