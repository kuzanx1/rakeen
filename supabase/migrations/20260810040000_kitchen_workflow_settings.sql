-- Kitchen workflow policy — owner-configurable from the dashboard, applies
-- to every order on the kitchen board regardless of channel:
--   'manual' (default): a real person taps "تم التجهيز" per order.
--   'auto': no button — each order clears itself off the board once
--   kitchen_auto_ready_minutes have elapsed since it was placed, same as a
--   kitchen timer nobody has to watch.
-- Also gains a real (owner-visible, cashier-configured) new-order sound
-- toggle for the kitchen screen specifically, separate from the existing
-- notify_sound_enabled (that one governs the POS's own delivery-timer
-- alerts, a different audience/purpose).
alter table businesses add column kitchen_ready_mode text not null default 'manual'
  check (kitchen_ready_mode in ('manual','auto'));
alter table businesses add column kitchen_auto_ready_minutes int not null default 15;
alter table businesses add column kitchen_new_order_sound_enabled boolean not null default true;
