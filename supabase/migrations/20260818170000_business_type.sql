-- Signup now asks what kind of establishment the owner is registering — only
-- 'restaurant' has real features built (POS, kitchen, delivery reconciliation,
-- etc.); the others are lead-capture only for now, per the plan of not
-- building a vertical until a real customer signs up for it. Existing
-- businesses (all restaurants today) default to 'restaurant'.
alter table businesses add column business_type text not null default 'restaurant'
  check (business_type in ('restaurant', 'salon', 'clinic', 'retail', 'other'));

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
  if new_business_type not in ('restaurant', 'salon', 'clinic', 'retail', 'other') then
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
