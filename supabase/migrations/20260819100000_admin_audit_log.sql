-- M5 (security hardening phase 2) — audit trail for platform-admin actions.
-- No admin action anywhere (owner credential reset, business approval,
-- branding changes, deletion) left any record of who did it or when before
-- this. Service-role only — no anon/authenticated policy, matching
-- pos_login_attempts and rate_limit_hits (only server routes touch this,
-- via app/api/admin/audit-log for reads and lib/adminAuth.ts's
-- logAdminAction() for writes). Never store secrets/tokens/passwords in
-- `metadata` — every call site is reviewed for that.
create table admin_audit_log (
  id bigint generated always as identity primary key,
  actor_email text not null,
  action text not null,
  target text,
  result text not null check (result in ('success', 'failure')),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_at_idx on admin_audit_log(created_at desc);
alter table admin_audit_log enable row level security;
