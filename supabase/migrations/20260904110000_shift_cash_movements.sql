-- Cash that enters or leaves the drawer without being a sale.
--
-- Paying a supplier out of the till, taking float from the safe, dropping
-- excess cash to the office. These happen in every real shop, and until now
-- they had nowhere to go: the expected figure only ever counted the opening
-- float plus cash sales, so every legitimate movement surfaced at closing
-- as an unexplained variance. That is the single most common reason a
-- drawer "doesn't balance" once the arithmetic itself is correct -- and it
-- trains everyone to shrug at variances, which defeats the whole count.
--
-- Recorded as a movement, the money is accounted for and the variance goes
-- back to meaning what it should: cash that is genuinely unaccounted for.
create table if not exists shift_cash_movements (
  id bigint generated always as identity primary key,
  shift_id bigint not null references shifts(id),
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  -- 'in'  = money added to the drawer (float from the safe, a correction)
  -- 'out' = money removed (supplier paid from the till, a cash drop)
  direction text not null check (direction in ('in', 'out')),
  -- Always POSITIVE. The direction column carries the sign, so a stray
  -- negative cannot silently flip a payout into a top-up.
  amount numeric not null check (amount > 0),
  -- Required, and deliberately so: an unexplained movement is just a
  -- variance that has been given a hiding place.
  reason text not null check (length(btrim(reason)) > 0),
  staff_member_id bigint references staff_members(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists shift_cash_movements_shift_id_idx
  on shift_cash_movements (shift_id);

alter table shift_cash_movements enable row level security;

-- Read: anyone who can work the till or see the staff screen, same as
-- shifts_select, since this is part of the same reconciliation picture.
create policy shift_cash_movements_select on shift_cash_movements for select
  using (
    business_id = current_business_id()
    and (has_permission('pos:register') or has_permission('screen:staff'))
  );

-- Write: the cashier on the till. INSERT only -- no update, no delete.
-- A recorded movement is part of the audit trail behind a signed-off
-- closing balance; correcting one means recording the opposite movement,
-- exactly as a ledger works, not editing history.
create policy shift_cash_movements_insert on shift_cash_movements for insert
  with check (
    business_id = current_business_id()
    and has_permission('pos:register')
    and created_by = auth.uid()
  );

comment on table shift_cash_movements is
  'Cash into/out of the drawer that is not a sale (supplier paid from the till, float from the safe, cash drop). Insert-only; correct by recording the opposite movement.';
