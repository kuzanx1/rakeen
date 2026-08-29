-- Owner-editable line printed near the bottom of the customer receipt
-- (below the QR, replacing the hardcoded "شكراً لزيارتكم" when set) — e.g.
-- a thank-you note, a WiFi password, a social-media handle, whatever the
-- owner wants every customer to see. businesses.logo_url already exists
-- (used elsewhere for reports/dashboard branding) so no new column needed
-- for the receipt logo itself — printing it is just a POS-side toggle.
alter table businesses add column receipt_custom_message text;
