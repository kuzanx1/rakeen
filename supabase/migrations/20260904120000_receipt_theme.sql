-- Receipt theme.
--
-- A thermal printer gives one ink colour, one paper width, and a roll that
-- costs money — so a receipt "theme" here is a set of decisions about
-- density and hierarchy, not a palette:
--
--   classic  balanced, with logo and section rules. The default.
--   compact  paper-saving: no logo, tighter leading, smaller type and a
--            smaller (still scannable) QR. Around a third shorter, which
--            is real money at a few hundred receipts a day.
--   elegant  presentation: the business name letter-spaced between two
--            rules, a hairline under every item so the list reads as a
--            table, and the total in its own box.
--
-- Every theme prints the full ZATCA Phase 1 simplified tax invoice: the
-- heading, the seller's VAT number, the timestamp, the total including
-- VAT, the VAT amount, and the TLV QR. The check constraint keeps an
-- unknown value out; the app also falls back to 'classic' on anything it
-- does not recognise, so neither layer can produce an unprintable receipt.
alter table businesses
  add column if not exists receipt_theme text not null default 'classic';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_receipt_theme_check'
  ) then
    alter table businesses
      add constraint businesses_receipt_theme_check
      check (receipt_theme in ('classic', 'compact', 'elegant'));
  end if;
end $$;

comment on column businesses.receipt_theme is
  'POS receipt layout: classic | compact (paper-saving) | elegant. All three print the full ZATCA Phase 1 simplified tax invoice.';
