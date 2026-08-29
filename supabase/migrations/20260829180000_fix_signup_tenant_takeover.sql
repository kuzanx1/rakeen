-- CRITICAL FIX: handle_new_auth_user() (the AFTER INSERT trigger on
-- auth.users) took `business_id`, `user_type`, `created_by`, and `branch_id`
-- straight out of raw_user_meta_data and, when business_id was present,
-- inserted a `profiles` row binding the new auth user to that EXISTING
-- business with whatever user_type was given — including 'owner' — with
-- zero verification that the caller had any right to that business.
--
-- This was safe ONLY under the assumption that raw_user_meta_data always
-- came from Rakeen's own trusted server routes (create-team-member,
-- provision-branch), which do check permissions before calling
-- admin.createUser(). But this project's Supabase Auth has public signup
-- enabled (disable_signup=false, confirmed live), and Supabase's own
-- POST /auth/v1/signup endpoint — reachable by anyone with just the public
-- anon key already embedded in every page of this site — lets the caller
-- set arbitrary user_metadata. The trigger fires identically either way; it
-- has no way to tell a trusted server-issued metadata blob from one an
-- anonymous visitor typed into a raw signup call. Net effect: anyone could
-- self-register with `data: { business_id: 1, user_type: 'owner' }` and
-- instantly become a full owner of business_id=1 (the live "عنوب | Anoob"
-- account) — or any other business — with zero invitation, zero
-- verification, full read/write access to that business's orders,
-- customers, staff, financials and settings. This is the worst possible
-- class of multi-tenant bug for this system.
--
-- Fix: the trigger no longer trusts client-suppliable business_id/user_type/
-- created_by/branch_id at all for joining an EXISTING business. Instead, a
-- new `staff_invite_tokens` table holds short-lived, single-use, server-
-- issued invites — written only by the trusted server routes (via the
-- service-role client, which bypasses RLS as intended for backend code) and
-- consumed exactly once by this trigger. If a signup carries no valid,
-- unexpired, unused invite_token, it ALWAYS takes the "brand-new business"
-- branch — exactly what today's real self-serve signup route
-- (app/api/auth/signup) already does, since it never sent business_id
-- anyway. This closes the hole without changing any legitimate flow's
-- behavior.

create table staff_invite_tokens (
  token uuid primary key default gen_random_uuid(),
  business_id bigint not null references businesses(id) on delete cascade,
  user_type text not null check (user_type in ('manager', 'employee')),
  created_by uuid not null,
  branch_id bigint,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_invite_tokens_created_idx on staff_invite_tokens(created_at);

-- Same lesson as rate_limit_hits (20260829170000): a fresh table in the
-- public schema picks up Supabase's default anon/authenticated grants
-- automatically. This table must never be reachable directly by any client
-- role — only by this SECURITY DEFINER trigger (runs as table owner
-- regardless of grants) and by server routes using the service-role key
-- (which also bypasses RLS/grants by design). Revoke explicitly and enable
-- RLS with zero policies as a second, independent layer.
revoke all on staff_invite_tokens from anon, authenticated;
alter table staff_invite_tokens enable row level security;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invite_token uuid;
  v_invite record;
  new_business_id bigint;
  new_branch_id bigint;
  new_business_type text := coalesce(meta->>'business_type', 'restaurant');
begin
  if new_business_type not in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash', 'mobile_car_wash',
    'clinic', 'tailoring', 'hotel', 'retail', 'other'
  ) then
    new_business_type := 'restaurant';
  end if;

  -- Deliberately wrapped so a garbage (non-UUID) invite_token value raises a
  -- clean, catchable error rather than a raw cast exception leaking detail.
  begin
    v_invite_token := nullif(meta->>'invite_token', '')::uuid;
  exception when others then
    raise exception 'invalid signup metadata';
  end;

  if v_invite_token is not null then
    select * into v_invite from staff_invite_tokens
      where token = v_invite_token
        and used_at is null
        and created_at > now() - interval '10 minutes'
      for update;
    if v_invite.token is null then
      raise exception 'invite expired or already used';
    end if;

    update staff_invite_tokens set used_at = now() where token = v_invite_token;

    insert into profiles (id, business_id, full_name, user_type, created_by, branch_id)
    values (
      new.id,
      v_invite.business_id,
      coalesce(meta->>'full_name', new.email),
      v_invite.user_type,
      v_invite.created_by,
      v_invite.branch_id
    );
    return new;
  end if;

  -- No valid invite — always a brand-new business. Client-supplied
  -- business_id/user_type/created_by/branch_id are NEVER honored here
  -- anymore, regardless of what a caller puts in signup metadata.
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

  return new;
end;
$$;
