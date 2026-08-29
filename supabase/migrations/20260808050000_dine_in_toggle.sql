-- Cloud/delivery-only kitchens (no physical dining room) don't need the
-- "dine in" order channel or the Tables screen cluttering the POS — this
-- lets an owner turn that whole surface off per business instead of it
-- being permanently assumed for every restaurant.
alter table businesses add column dine_in_enabled boolean not null default true;
