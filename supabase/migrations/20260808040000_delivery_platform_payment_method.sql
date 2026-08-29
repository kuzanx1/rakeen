-- Delivery orders are already paid by the customer inside the delivery
-- platform's own app — forcing the cashier to pick cash/card at the
-- register was both pointless friction and an accounting bug: whatever
-- they picked got folded into the shift's real cash/card drawer totals,
-- even though no money was actually collected at the register.
alter table orders drop constraint orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'card', 'split', 'delivery_platform'));
