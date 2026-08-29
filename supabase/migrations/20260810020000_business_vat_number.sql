-- The business's own ZATCA VAT registration number — needed to print a
-- compliant Simplified Tax Invoice QR code on POS receipts. businesses.vat_rate
-- (added earlier) is just the tax percentage; this is the actual 15-digit
-- registration number, set once by the owner in dashboard Settings.
alter table businesses add column vat_number text;
