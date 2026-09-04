-- POS shift-close controls.
--
-- pos_require_manager_pin_for_close
--   Closing a shift is manager-approved by default, and that default is
--   deliberate: the closing count is the one number nobody else checks, so
--   a second person signing it off is the control that makes it worth
--   anything. A single-operator business (one owner who is also the
--   cashier) has nobody to approve it and only ends up typing their own
--   PIN at themselves, so they can switch it off.
--
--   DEFAULT true, and the app treats an unreadable answer as true as well:
--   a failed settings read must never be the thing that removes a control
--   on the cash drawer.
alter table businesses
  add column if not exists pos_require_manager_pin_for_close boolean not null default true;

comment on column businesses.pos_require_manager_pin_for_close is
  'POS: require the manager PIN to close a shift. On by default; off suits a single-operator business.';
