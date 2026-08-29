-- current_business_id() now returns null for a deactivated profile. Since
-- every RLS policy in this schema keys off business_id = current_business_id(),
-- this transparently locks a disabled employee/manager out of every table the
-- moment they're deactivated — real server-side enforcement, not just a
-- client-side hide of the dashboard UI.
create or replace function current_business_id()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select business_id from profiles where id = auth.uid() and active;
$$;

-- Manager/employee seat count is capped per business (included_seats), same
-- pattern as branch_limit for branches. Enforced with a trigger (not just the
-- create-team-member API's own check) so it holds even if that's bypassed.
-- The owner is never a counted seat, and neither are branch-level POS PIN
-- accounts (profiles.branch_id is set) — those are infrastructure, not real
-- human team members, and shouldn't eat into the subscriber's people seats.
create or replace function enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  if new.user_type = 'owner' or new.branch_id is not null then
    return new;
  end if;
  select included_seats into v_limit from businesses where id = new.business_id;
  select count(*) into v_count from profiles
    where business_id = new.business_id and user_type in ('manager','employee') and branch_id is null;
  if v_count >= v_limit then
    raise exception 'seat_limit_reached';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_seat_limit
  before insert on profiles
  for each row execute function enforce_seat_limit();
