-- Contract discount: `price` stays the price actually charged (everything
-- downstream — schedule, clauses, payments — keeps using it). When the
-- admin gives a discount, list_price keeps the price before it and
-- discount_label an optional reason ("عرض الافتتاح"), so the contract can
-- show: list price struck through, the discount, the price after it.

alter table public.subscription_contracts
  add column if not exists list_price numeric(12,2) check (list_price is null or list_price >= 0),
  add column if not exists discount_label text;
