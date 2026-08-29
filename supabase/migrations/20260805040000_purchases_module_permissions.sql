-- Mobile UX redesign: Purchases becomes a first-class daily-operations module,
-- separate from Accounting (which now covers financial reporting/tax/
-- reconciliation only). A new screen:purchases permission key lets an owner
-- grant e.g. a warehouse/inventory employee purchase-invoice access without
-- also handing them the accounting screen's financial figures.
--
-- RLS policies for the tables the Purchases screen actually touches
-- (suppliers, purchase_invoices, invoice_scan_events,
-- supplier_invoice_patterns) now accept EITHER screen:accounting or
-- screen:purchases — never narrower than what already worked, since
-- fixed_costs/expense_categories/general_expenses (still Accounting-only
-- content) keep requiring screen:accounting alone.
drop policy suppliers_all on suppliers;
create policy suppliers_all on suppliers for all
  using (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')))
  with check (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')));

drop policy purchase_invoices_all on purchase_invoices;
create policy purchase_invoices_all on purchase_invoices for all
  using (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')))
  with check (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')));

drop policy invoice_scan_events_all on invoice_scan_events;
create policy invoice_scan_events_all on invoice_scan_events for all
  using (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')))
  with check (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')));

drop policy supplier_invoice_patterns_all on supplier_invoice_patterns;
create policy supplier_invoice_patterns_all on supplier_invoice_patterns for all
  using (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')))
  with check (business_id = current_business_id() and (has_permission('screen:accounting') or has_permission('screen:purchases')));

-- Backfill: every employee already granted screen:accounting keeps exactly
-- the access they had before this split (purchase invoices were reachable
-- through the old combined "المصروفات والمشتريات" tab) — nobody should lose
-- access silently just because the screen moved in the nav.
insert into user_permissions (user_id, permission_key, granted_by)
select user_id, 'screen:purchases', granted_by
from user_permissions
where permission_key = 'screen:accounting'
on conflict do nothing;
