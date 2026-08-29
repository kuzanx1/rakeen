-- General restaurant identity logo (separate from loyalty_logo_url, which is
-- specifically for the customer-facing loyalty card) — used as the letterhead
-- logo on exported PDF/Excel reports, and shown in Settings.
alter table businesses add column logo_url text;

insert into storage.buckets (id, name, public)
values ('business-branding', 'business-branding', true)
on conflict (id) do nothing;

create policy "business branding public read" on storage.objects for select
  using (bucket_id = 'business-branding');
create policy "business branding owner insert" on storage.objects for insert
  with check (bucket_id = 'business-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:settings'));
create policy "business branding owner update" on storage.objects for update
  using (bucket_id = 'business-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:settings'))
  with check (bucket_id = 'business-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:settings'));
create policy "business branding owner delete" on storage.objects for delete
  using (bucket_id = 'business-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:settings'));

-- Report export history: records that a report was exported (who/what/when),
-- never the file itself — PDFs/Excel files are generated client-side and not
-- retained anywhere server-side. Lets the dashboard show "last 10 reports"
-- without us storing customer financial documents.
create table report_exports (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  report_type text not null check (report_type in ('sales','products','payments','financial')),
  format text not null check (format in ('pdf','excel')),
  exported_by uuid not null references profiles(id),
  exported_at timestamptz not null default now()
);
create index report_exports_business_id_idx on report_exports(business_id, exported_at desc);
alter table report_exports enable row level security;

create policy "report exports read own business" on report_exports for select
  using (business_id = current_business_id() and has_permission('screen:reports'));
create policy "report exports insert own business" on report_exports for insert
  with check (business_id = current_business_id() and has_permission('screen:reports') and exported_by = auth.uid());
