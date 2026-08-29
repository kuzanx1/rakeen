-- Table reservations — separate from restaurant_tables.status (which is
-- "what's true right now"), a reservation is a future booking against a
-- table that can coexist with the table being occupied today: a table can
-- be seated now *and* have a 8pm booking queued for later in the same
-- night. Status here tracks the reservation's own lifecycle, independent
-- of whatever the table's live status happens to be at any given moment.
create table table_reservations (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  table_id bigint not null references restaurant_tables(id),
  customer_name text not null,
  customer_phone text,
  party_size int not null default 2 check (party_size > 0),
  reserved_for timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','seated','no_show','cancelled')),
  order_id bigint references orders(id),
  created_at timestamptz not null default now()
);
create index table_reservations_business_id_idx on table_reservations(business_id);
create index table_reservations_table_id_idx on table_reservations(table_id, status);
create index table_reservations_reserved_for_idx on table_reservations(branch_id, reserved_for);

alter table table_reservations enable row level security;
create policy table_reservations_all on table_reservations for all
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')))
  with check (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')));

-- Owner-configurable from the dashboard, all off by default — a business
-- that doesn't take reservations shouldn't see any of this in their POS.
-- The deposit fields are stored/displayed as guidance for staff to collect
-- manually (Rakeen has no online payment-collection integration yet) — not
-- an automated charge.
alter table businesses add column tables_reservations_enabled boolean not null default false;
alter table businesses add column tables_reservation_deposit_enabled boolean not null default false;
alter table businesses add column tables_reservation_deposit_percent int not null default 20 check (tables_reservation_deposit_percent between 0 and 100);
alter table businesses add column tables_turn_time_enabled boolean not null default false;
alter table businesses add column tables_turn_time_minutes int not null default 45 check (tables_turn_time_minutes > 0);
alter table businesses add column tables_reservation_conflict_warning_enabled boolean not null default true;
