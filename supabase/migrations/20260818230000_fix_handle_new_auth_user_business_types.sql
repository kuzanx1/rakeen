-- Bug fix: handle_new_auth_user() keeps its own internal whitelist of valid
-- business_type values (defensive validation before insert, separate from
-- the column's check constraint) — 20260818220000 widened the check
-- constraint but this whitelist was missed, so quick_service/cafe/
-- cloud_kitchen/car_wash/ladies_salon were all silently falling back to
-- 'restaurant' at signup. Caught by a live round-trip test before this ever
-- reached a real signup.
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
  new_business_type text := coalesce(meta->>'business_type', 'restaurant');
begin
  if new_business_type not in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash',
    'clinic', 'retail', 'other'
  ) then
    new_business_type := 'restaurant';
  end if;

  if target_business_id is null then
    insert into businesses (name, verification_status, business_type)
    values (coalesce(meta->>'business_name', 'مشروعي'), 'pending', new_business_type)
    returning id into new_business_id;

    update businesses set online_ordering_enabled = true, online_menu_slug = 'store-' || new_business_id
      where id = new_business_id;

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
