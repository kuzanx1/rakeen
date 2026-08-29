-- Production observability requirement: "top suppliers causing escalations"
-- needs a supplier identifier on every scan event, not just when a ZATCA QR
-- happened to be present (supplier_vat_number). This captures whatever
-- supplier name is on screen at log time (QR-derived, Gemini-derived, or
-- manually typed by the owner) so the metric works across the whole
-- invoice population, not just the QR-having subset.
alter table invoice_scan_events
  add column supplier_name text;
