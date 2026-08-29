-- Telemetry for the invoice-scan pipeline: one row per scan attempt regardless
-- of which stage resolved it (local OCR, text-only Gemini, vision Gemini, or
-- failed), powering a per-business AI-usage/cost metrics panel. Insertable
-- directly from the client (no server round-trip needed for the local_ocr
-- case, which is the entire point of the cost-reduction pipeline) — same
-- pattern as purchase_invoices/owner_push_subscriptions.
create table invoice_scan_events (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  resolution_stage text not null check (resolution_stage in ('local_ocr','text_gemini','vision_gemini','failed')),
  qr_present boolean not null default false,
  qr_total_match boolean,
  ocr_mean_confidence numeric,
  ocr_line_match_rate numeric,
  line_item_count int,
  estimated_gemini_tokens int,
  estimated_cost_sar numeric(10,4),
  supplier_vat_number text,
  duration_ms int,
  error_message text
);
create index invoice_scan_events_business_id_idx on invoice_scan_events(business_id);
create index invoice_scan_events_created_at_idx on invoice_scan_events(created_at);
create index invoice_scan_events_resolution_stage_idx on invoice_scan_events(resolution_stage);

alter table invoice_scan_events enable row level security;

create policy invoice_scan_events_all on invoice_scan_events for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));
