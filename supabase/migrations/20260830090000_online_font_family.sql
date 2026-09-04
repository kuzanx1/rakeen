-- The online storefront's typeface is now a merchant-facing choice (design
-- panel in the dashboard's new "المنيو الإلكتروني" screen), not hardcoded —
-- but deliberately only two options exist (see rakeen-order.css), not an
-- open font picker.
alter table businesses add column if not exists online_font_family text not null default 'rakeen';

alter table businesses
  add constraint businesses_online_font_family_check
  check (online_font_family in ('rakeen', 'thmanyah'));

grant select (online_font_family) on businesses to anon;
