-- Phase 1 of multi-vertical expansion (salon MVP) — see the approved plan.
-- `services` is the salon/clinic equivalent of `menu_items`: a flat
-- price+duration offering (a haircut, a color, a treatment), not a recipe.
-- Deliberately reuses `menu_categories` as-is (it's already generic —
-- id/business_id/name/sort_order, no restaurant semantics) rather than
-- adding a parallel categories table.
create table services (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  category_id bigint references menu_categories(id),
  name text not null,
  price numeric not null check (price >= 0),
  duration_minutes int not null check (duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business_id_idx on services(business_id);

alter table services enable row level security;
create policy services_all on services for all
  using (business_id = current_business_id() and has_permission('screen:menu'))
  with check (business_id = current_business_id() and has_permission('screen:menu'));
