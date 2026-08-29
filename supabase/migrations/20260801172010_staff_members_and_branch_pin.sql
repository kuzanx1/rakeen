-- Revised cashier model: ONE shared PIN-authenticated Supabase Auth account
-- per branch (not one per cashier — that was the wrong model, corrected here
-- before any real cashier account existed). Individual staff are just name
-- labels the manager adds, picked after the branch PIN unlocks the device,
-- used purely to attribute orders/shifts to a person for performance
-- tracking — not a separate login each.

drop index if exists profiles_branch_pos_username_idx;
alter table profiles drop column if exists pos_username;

-- Re-point the signup trigger at the new shape (no more pos_username).
-- branch_id in metadata is still how the branch-level POS account gets
-- linked to its branch; there's at most one user_type='employee' profile
-- with a given branch_id — that row IS the branch's shared POS identity.
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
    insert into profiles (id, business_id, full_name, user_type, created_by, branch_id)
    values (
      new.id,
      target_business_id,
      coalesce(meta->>'full_name', new.email),
      coalesce(meta->>'user_type', 'employee'),
      nullif(meta->>'created_by', '')::uuid,
      (meta->>'branch_id')::bigint
    );
  end if;

  return new;
end;
$$;

create table staff_members (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index staff_members_branch_id_idx on staff_members(branch_id);

alter table orders add column staff_member_id bigint references staff_members(id);
alter table shifts add column staff_member_id bigint references staff_members(id);

alter table staff_members enable row level security;
create policy staff_members_select on staff_members for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:staff')));
create policy staff_members_write on staff_members for insert with check (business_id = current_business_id() and has_permission('screen:staff'));
create policy staff_members_update on staff_members for update
  using (business_id = current_business_id() and has_permission('screen:staff')) with check (business_id = current_business_id() and has_permission('screen:staff'));
create policy staff_members_delete on staff_members for delete using (business_id = current_business_id() and has_permission('screen:staff'));
