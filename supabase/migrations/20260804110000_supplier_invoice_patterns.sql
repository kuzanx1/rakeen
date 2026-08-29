-- Learning cache: what successfully parsed a given supplier's invoice last
-- time (decimal style, unit vocabulary, which of a small fixed set of
-- labelled parser strategies worked), keyed by VAT number when the ZATCA QR
-- gave us one (fully reliable per-supplier key), falling back to normalized
-- supplier name for invoices without a scannable QR. Biases/retries the
-- deterministic parser for repeat suppliers so the local-accept rate rises
-- over time without any AI involvement. Schema-only in this migration — no
-- read/write logic wired yet.
alter table suppliers add column vat_number text;

create table supplier_invoice_patterns (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  supplier_vat_number text,
  supplier_name_normalized text,
  decimal_separator text not null default '.',
  common_units text[] not null default '{}',
  successful_line_pattern text,
  sample_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index supplier_invoice_patterns_vat_uidx
  on supplier_invoice_patterns(business_id, supplier_vat_number) where supplier_vat_number is not null;
create unique index supplier_invoice_patterns_name_uidx
  on supplier_invoice_patterns(business_id, supplier_name_normalized) where supplier_vat_number is null;

alter table supplier_invoice_patterns enable row level security;

create policy supplier_invoice_patterns_all on supplier_invoice_patterns for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));
