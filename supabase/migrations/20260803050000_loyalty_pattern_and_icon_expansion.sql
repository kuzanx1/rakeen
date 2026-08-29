-- Two real gaps found while polishing the loyalty card design:
-- 1) loyalty_icon_style's check constraint only ever allowed the original 6
--    icons — car/pet/salon/gym/retail were already offered in the picker UI
--    (icons.ts / rakeen-dashboard.js) but saving one would have been silently
--    rejected by this constraint. Never actually hit in production since this
--    is the same deploy that introduces those icons in the UI.
-- 2) Expanding the decorative middle-band pattern gallery beyond dots/
--    diagonal/waves per owner request ("زخارف جاهزة" — more ready-made
--    options, not just a banner upload): grid, chevron, and icons (tiles the
--    business's own chosen loyalty icon as a subtle background texture).

alter table businesses drop constraint if exists businesses_loyalty_icon_style_check;
alter table businesses add constraint businesses_loyalty_icon_style_check
  check (loyalty_icon_style in ('generic','coffee','burger','pizza','pastry','dessert','car','pet','salon','gym','retail'));

alter table businesses drop constraint if exists businesses_loyalty_pattern_style_check;
alter table businesses add constraint businesses_loyalty_pattern_style_check
  check (loyalty_pattern_style in ('none','dots','diagonal','waves','grid','chevron','icons'));
