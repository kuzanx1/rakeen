-- VAT rate was hardcoded at 15% (KSA_STANDARD_VAT_RATE) inside the invoice-
-- scan arithmetic validation — if Saudi VAT ever changes, every invoice
-- would start failing local/text-tier reconciliation and get needlessly
-- escalated to the most expensive vision tier. Moved to a per-business
-- setting so it can be corrected without a code deploy.
alter table businesses add column vat_rate numeric not null default 0.15;
