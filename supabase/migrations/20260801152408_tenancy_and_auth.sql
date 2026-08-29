-- Tenancy, auth hierarchy (owner -> manager -> employee), and per-employee permissions.

create table businesses (
  id bigint generated always as identity primary key,
  name text not null,
  plan text not null default 'starter',
  included_seats int not null default 2,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id bigint not null references businesses(id),
  full_name text not null,
  user_type text not null check (user_type in ('owner','manager','employee')),
  created_by uuid references profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_business_id_idx on profiles(business_id);

-- Fires on every new auth.users row. Two paths, distinguished by whether the
-- signup metadata already carries a business_id:
--   * no business_id in metadata  -> self-service owner signup: create a fresh
--     business, this user becomes its owner.
--   * business_id present         -> this account was created by the "add
--     manager/employee" server route (via the admin API), which stamps the
--     target business_id/user_type/created_by into user_metadata itself.
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
begin
  if target_business_id is null then
    insert into businesses (name)
    values (coalesce(meta->>'business_name', 'مشروعي'))
    returning id into new_business_id;

    insert into profiles (id, business_id, full_name, user_type, created_by)
    values (new.id, new_business_id, coalesce(meta->>'full_name', new.email), 'owner', null);
  else
    insert into profiles (id, business_id, full_name, user_type, created_by)
    values (
      new.id,
      target_business_id,
      coalesce(meta->>'full_name', new.email),
      coalesce(meta->>'user_type', 'employee'),
      nullif(meta->>'created_by', '')::uuid
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

create table user_permissions (
  user_id uuid not null references profiles(id) on delete cascade,
  permission_key text not null,
  granted_by uuid not null references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- Centralizes the "does this person have access to X" check so every RLS
-- policy stays a one-liner. Owners and managers always pass; employees need
-- an explicit user_permissions row.
create or replace function has_permission(key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (
      select 1 from profiles
      where id = auth.uid() and user_type in ('owner','manager')
    )
    or exists (
      select 1 from user_permissions
      where user_id = auth.uid() and permission_key = key
    );
$$;

-- Current business_id for the signed-in user, used throughout RLS policies.
create or replace function current_business_id()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select business_id from profiles where id = auth.uid();
$$;
