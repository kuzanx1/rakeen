-- Branch count is capped per business, same pattern as included_seats for
-- employees — a plan-tier limit Rakeen (the platform) sets per subscriber,
-- not something the business owner can raise themselves. Enforced with a
-- trigger (not just a client-side check) so it holds even if bypassed.
alter table businesses add column branch_limit int not null default 1;

create or replace function enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  select branch_limit into v_limit from businesses where id = new.business_id;
  select count(*) into v_count from branches where business_id = new.business_id;
  if v_count >= v_limit then
    raise exception 'branch_limit_reached';
  end if;
  return new;
end;
$$;

create trigger branches_enforce_limit
  before insert on branches
  for each row execute function enforce_branch_limit();
