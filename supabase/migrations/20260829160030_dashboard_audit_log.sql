-- Overnight QA finding: logDashboardAudit() in rakeen-dashboard.js has been
-- writing every settings/staff/menu change ("عدّل إعدادات المطبخ", "حدّث
-- كلمة سر مدير الكاشير", etc.) into a plain in-memory JS array
-- (DASHBOARD_AUDIT_LOG), rendered behind a button literally labelled "سجل
-- التدقيق الكامل" (the FULL audit log). It is not full and it is not a log
-- — a page reload (or just closing the tab) wipes it completely, so an
-- owner who suspects a manager tampered with VAT settings or the manager
-- PIN has zero record the moment the session ends. This gives the feature
-- a real, durable, per-business backing table so "من غيّر كذا؟" has an
-- actual answer.
--
-- Insert-only via a security-definer RPC (never direct table access) so a
-- business can't spoof another business's log or forge a different user's
-- name onto an entry. Readable by owner/manager only, same bar as
-- staff_members management — cashiers don't need to see this.
-- Made idempotent 2026-09-03 while finally applying this migration: the
-- table/policy/functions below were already live in production (created out
-- of band at some point, never recorded in schema_migrations because this
-- file collided on filename timestamp with another migration -- see repo
-- history around this date). IF NOT EXISTS / DROP-then-CREATE throughout so
-- this is safe to run against a database that already has some or all of it.
create table if not exists dashboard_audit_log (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  user_name text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists dashboard_audit_log_business_created_idx on dashboard_audit_log(business_id, created_at desc);

alter table dashboard_audit_log enable row level security;
drop policy if exists dashboard_audit_log_select on dashboard_audit_log;
create policy dashboard_audit_log_select on dashboard_audit_log for select
  using (
    business_id = current_business_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.user_type in ('owner','manager'))
  );
-- No insert/update/delete policy for authenticated/anon — writes only
-- through log_dashboard_audit() below (security definer, bypasses RLS).

drop function if exists log_dashboard_audit(text);
create or replace function log_dashboard_audit(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_name text;
begin
  if v_business_id is null then
    raise exception 'not authorized';
  end if;
  select coalesce(full_name, '') into v_name from profiles where id = auth.uid();
  insert into dashboard_audit_log (business_id, user_id, user_name, action)
  values (v_business_id, auth.uid(), nullif(v_name, ''), p_action);
end;
$$;

drop function if exists get_dashboard_audit_log(int);
create or replace function get_dashboard_audit_log(p_limit int default 50)
returns table(user_name text, action text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select l.user_name, l.action, l.created_at
  from dashboard_audit_log l
  where l.business_id = current_business_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.user_type in ('owner','manager'))
  order by l.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;
