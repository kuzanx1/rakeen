-- Branches (pulled forward from the dashboard phase's deferred multi-branch
-- item — cashier accounts need to be scoped per branch) + cashier auth fields.

create table branches (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  cashier_limit int not null default 3,
  created_at timestamptz not null default now()
);
create index branches_business_id_idx on branches(business_id);

alter table profiles add column branch_id bigint references branches(id);
alter table profiles add column pos_username text;
create unique index profiles_branch_pos_username_idx on profiles(branch_id, pos_username) where pos_username is not null;

-- Extend the existing signup trigger: a fresh owner signup also gets one
-- default branch. Employees/managers created via the admin route (which
-- stamps business_id/user_type/branch_id/pos_username into user_metadata)
-- are unaffected — this only fires the "new business" path.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  target_business_id bigint := (meta->>'business_id')::bigint;
  new_business_id bigint;
  new_branch_id bigint;
begin
  if target_business_id is null then
    insert into businesses (name)
    values (coalesce(meta->>'business_name', 'مشروعي'))
    returning id into new_business_id;

    insert into branches (business_id, name)
    values (new_business_id, 'الفرع الرئيسي')
    returning id into new_branch_id;

    insert into profiles (id, business_id, full_name, user_type, created_by)
    values (new.id, new_business_id, coalesce(meta->>'full_name', new.email), 'owner', null);
  else
    insert into profiles (id, business_id, full_name, user_type, created_by, branch_id, pos_username)
    values (
      new.id,
      target_business_id,
      coalesce(meta->>'full_name', new.email),
      coalesce(meta->>'user_type', 'employee'),
      nullif(meta->>'created_by', '')::uuid,
      (meta->>'branch_id')::bigint,
      meta->>'pos_username'
    );
  end if;

  return new;
end;
$$;

-- 'pos:register' is a distinct read-access pass for the POS's own tables
-- below (orders/order_items/shifts) plus an OR-branch on the dashboard's
-- existing menu/inventory read policies (added in the RLS section of the
-- next migration) — a cashier never gets screen:* access, so this is the
-- only way for their fetch of menu/stock data (needed to render the POS
-- and compute stock decrements) to pass RLS at all.
