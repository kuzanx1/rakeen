-- Automatic end-of-day report: a Cron Trigger computes and stores one
-- immutable snapshot per business per calendar day (Asia/Riyadh, no manual
-- action needed), so the owner always has "what happened yesterday,
-- financially" waiting for them without running a report themselves. The
-- snapshot is stored as jsonb (not recomputed live) on purpose — matches
-- this app's own "PDF = a frozen moment" philosophy elsewhere: if a menu
-- item's cost or a delivery platform's commission changes next week, last
-- Monday's report must still show last Monday's real numbers, not a
-- retroactively different one.
create table daily_reports (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  report_date date not null,
  generated_at timestamptz not null default now(),
  data jsonb not null,
  unique (business_id, report_date)
);
create index daily_reports_business_id_idx on daily_reports(business_id, report_date desc);

alter table daily_reports enable row level security;
-- Written only by the cron route's service-role client (bypasses RLS
-- entirely), so the only policy needed here is read access for the dashboard.
create policy daily_reports_select on daily_reports for select
  using (business_id = current_business_id() and has_permission('screen:accounting'));

-- Per-business choice of which sections land in the auto-generated report —
-- one boolean per section, matching this table's existing notify_* /
-- kitchen_* toggle convention rather than a jsonb blob.
alter table businesses add column daily_report_sales boolean not null default true;
alter table businesses add column daily_report_products boolean not null default true;
alter table businesses add column daily_report_payments boolean not null default true;
alter table businesses add column daily_report_financial boolean not null default true;
alter table businesses add column daily_report_tax boolean not null default true;
alter table businesses add column daily_report_delivery boolean not null default true;
