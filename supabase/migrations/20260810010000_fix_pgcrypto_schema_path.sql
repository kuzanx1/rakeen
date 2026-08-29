-- Supabase installs pgcrypto into the `extensions` schema, not `public` —
-- the two manager-PIN functions had `set search_path = public`, so
-- crypt()/gen_salt() weren't found ("function gen_salt(unknown) does not
-- exist"). Fully-qualify the calls and widen the search_path as a safety
-- net so this doesn't matter which schema pgcrypto actually landed in.
create extension if not exists pgcrypto with schema extensions;

create or replace function set_pos_manager_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not has_permission('screen:settings') then
    raise exception 'not authorized';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid pin format';
  end if;
  update businesses set pos_manager_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
    where id = current_business_id();
end;
$$;

create or replace function verify_pos_manager_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
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
  return v_hash = extensions.crypt(p_pin, v_hash);
end;
$$;
