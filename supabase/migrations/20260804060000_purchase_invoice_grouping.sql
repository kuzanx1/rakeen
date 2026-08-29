-- Lets the "add invoice" form record several purchased items (different stock
-- items, different qty/cost each) under one single invoice event, instead of
-- forcing a separate modal round-trip per item. Each purchase_invoices row is
-- still one stock item purchased (keeps the existing atomic stock-bump trigger
-- and every read path untouched) — invoice_group_id just ties rows entered
-- together in the same form session back to one invoice, purely for display
-- grouping. Existing rows each get their own default group id (unaffected).
alter table purchase_invoices add column invoice_group_id uuid not null default gen_random_uuid();
create index purchase_invoices_invoice_group_id_idx on purchase_invoices(invoice_group_id);
