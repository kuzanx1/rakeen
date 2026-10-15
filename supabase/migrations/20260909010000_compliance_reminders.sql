-- HR compliance, phase 2: real expiry reminders (Web Push to the owner's
-- installed dashboard) + two-way link between an employee's iqama fields and
-- their iqama compliance document. Still purely internal — expiry dates are
-- typed by the merchant, never a live GOSI/Muqeem lookup.

-- Per-document opt-in for the expiry push. Default on so existing rows keep
-- behaving as the owner expects once the feature ships.
alter table compliance_items add column if not exists reminder_enabled boolean not null default true;

-- Which status the daily cron last pushed a notification for. Lets it notify
-- once per transition (valid -> expiring_soon -> expired) instead of every day.
-- Reset to null by check_compliance_expiries() below whenever an item is renewed
-- back to 'valid', so a future expiry re-arms the reminder.
alter table compliance_items add column if not exists reminder_sent_status text;

-- Hard guarantee behind the "this employee already has an iqama registered"
-- check in the dashboard: at most one iqama document per employee. Other
-- document types (contract, health_cert, ...) can still repeat freely.
create unique index if not exists compliance_items_one_iqama_per_employee
  on compliance_items (employee_id) where document_type = 'iqama';

-- Business-wide master switch for the document-expiry push, alongside the
-- existing notify_new_order / notify_low_stock / ... flags on businesses.
alter table businesses add column if not exists notify_document_expiry boolean not null default true;

-- Recompute statuses (unchanged logic) AND clear reminder_sent_status on any
-- row that is back to 'valid', so renewing a document re-arms its reminder.
create or replace function check_compliance_expiries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update compliance_items
  set
    status = case
      when expiry_date < current_date then 'expired'
      when expiry_date <= current_date + (reminder_days_before || ' days')::interval then 'expiring_soon'
      else 'valid'
    end,
    reminder_sent_status = case
      when expiry_date >= current_date + (reminder_days_before || ' days')::interval then null
      else reminder_sent_status
    end
  where status is distinct from (case
    when expiry_date < current_date then 'expired'
    when expiry_date <= current_date + (reminder_days_before || ' days')::interval then 'expiring_soon'
    else 'valid'
  end)
  or (reminder_sent_status is not null
      and expiry_date >= current_date + (reminder_days_before || ' days')::interval);
end;
$$;
