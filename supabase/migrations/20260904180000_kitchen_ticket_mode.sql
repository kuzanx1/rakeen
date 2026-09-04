-- What the kitchen's copy looks like.
--
-- Two habits, both common, and the system only supported one:
--
--   brief  the ticket the kitchen actually needs — items, quantities and
--          notes, no prices, no VAT, no QR. Nothing on it a cook does not
--          act on. This is what prints today.
--   copy   the same receipt the customer gets, printed twice. Plenty of
--          places run this way: the second copy goes on the bag or the
--          pass, and staff read the order off the same document the
--          customer is holding, so there is never a question of which of
--          two differently-shaped papers is authoritative.
--
-- A business-wide choice, not a per-device one: it decides what the
-- kitchen's paperwork IS. Which printer it comes out of stays per-device,
-- because that is about hardware in a room.
alter table businesses
  add column if not exists kitchen_ticket_mode text not null default 'brief';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_kitchen_ticket_mode_check') then
    alter table businesses
      add constraint businesses_kitchen_ticket_mode_check
      check (kitchen_ticket_mode in ('brief', 'copy'));
  end if;
end $$;

comment on column businesses.kitchen_ticket_mode is
  'brief = items, quantities and notes only. copy = a second identical print of the customer receipt. Whether a kitchen ticket prints at all, and on which printer, stays a per-device setting.';
