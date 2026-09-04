-- Dine-in modes, and pager (call-buzzer) numbers.
--
-- محلي and سفري are not primarily about table service. The difference the
-- kitchen acts on is how the order is plated: ceramic for dine-in, bags for
-- takeaway. A café where you order at the till, take a buzzer, sit
-- anywhere and collect your own tray is still dine-in — the chef plates it
-- on a dish — and it has no tables to manage at all.
--
-- Until now "dine-in enabled" could only mean the full table system, so
-- that café had to either run table management it does not use, or mark
-- every order as takeaway and have the kitchen bag food meant for a plate.

alter table businesses
  add column if not exists dine_in_mode text not null default 'simple';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_dine_in_mode_check') then
    alter table businesses
      add constraint businesses_dine_in_mode_check
      check (dine_in_mode in ('simple', 'tables'));
  end if;
end $$;

-- 'simple' is the right default for a NEW business, but it is the wrong
-- thing to hand an existing one: a restaurant already running tables would
-- silently lose its table workflow on deploy. Anyone who has registered a
-- table is left on 'tables', which is exactly what they have today.
update businesses b
  set dine_in_mode = 'tables'
  where exists (select 1 from restaurant_tables t where t.business_id = b.id);

comment on column businesses.dine_in_mode is
  'simple = order at the till and sit anywhere, no table management. tables = full table service with numbers and reservations. Only meaningful while dine_in_enabled is true.';

-- ---------------------------------------------------------------- pagers
-- The buzzer base station is NOT connected to this system, and is not
-- meant to be: it sits beside the till and a staff member types the number
-- into it by hand. All this column does is remember which buzzer went out
-- with which order, so the number can be shown to whoever presses "ready".
alter table businesses
  add column if not exists pos_pager_enabled boolean not null default false;

alter table orders
  add column if not exists pager_number smallint;

comment on column businesses.pos_pager_enabled is
  'Hand a numbered call-buzzer to the customer on till orders. Off by default; the buzzer hardware is standalone and is only recorded here, never driven.';

comment on column orders.pager_number is
  'The call-buzzer handed to this customer. Null when none was used. Freed for reuse once delivered_at is set.';

-- The one real correctness rule in the whole feature: a number is reused
-- all day, so two OPEN orders must never hold the same one. Buzzing 20
-- when two customers hold 20 calls the wrong person to the counter, and
-- nothing downstream could detect that it happened.
--
-- delivered_at is what frees it — that is the moment the customer came and
-- collected, and handed the buzzer back.
create unique index if not exists orders_open_pager_unique
  on orders (branch_id, pager_number)
  where pager_number is not null and delivered_at is null;

-- Recording the buzzer is its own function rather than another parameter on
-- complete_pos_order. That RPC already carries a stack of overloads, and
-- widening its signature again would add one more to disambiguate for the
-- sake of a field that is optional, set after the sale is already final,
-- and irrelevant to how the money was taken.
--
-- orders has no UPDATE policy at all — every write to it goes through a
-- definer function — so this is also the only way the till can set it.
create or replace function set_order_pager(p_order_id bigint, p_pager_number smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  update orders set pager_number = p_pager_number
  where id = p_order_id
    and business_id = v_business_id
    and delivered_at is null;

  if not found then
    raise exception 'الطلب غير متاح لتسجيل جهاز نداء';
  end if;
end;
$$;

comment on function set_order_pager(bigint, smallint) is
  'Attach a call-buzzer number to an order after checkout. The partial unique index on (branch_id, pager_number) where delivered_at is null is what actually prevents two open orders sharing a buzzer.';
