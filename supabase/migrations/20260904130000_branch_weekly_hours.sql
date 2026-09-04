-- Different opening hours per weekday.
--
-- branches.opening_time / closing_time are a single pair for the whole
-- week, which does not fit a real place: a restaurant that opens later on
-- Friday, or closes earlier on Thursday, has no way to say so.
--
-- Deliberately an ADDITIVE table rather than fourteen more columns on
-- branches:
--
--   * Most branches keep one set of hours. They add no rows and nothing
--     about their setup changes — which is the point of keeping this out
--     of the branches row and out of the default dashboard view.
--   * A branch that needs it adds only the days that DIFFER. Any weekday
--     with no row falls back to branches.opening_time/closing_time, so the
--     override list stays short and readable instead of restating the
--     same hours seven times.
--   * A closed day is a row with is_closed = true, which is a different
--     statement from "no row" (= use the default). Without that
--     distinction there is no way to say "shut on Friday".
--
-- weekday follows Postgres extract(dow): 0 = Sunday .. 6 = Saturday.
create table if not exists branch_weekly_hours (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opening_time time,
  closing_time time,
  is_closed boolean not null default false,
  -- One row per weekday per branch: two rows for the same day would make
  -- "which hours apply?" unanswerable.
  unique (branch_id, weekday),
  -- An open day needs both ends. A closed one needs neither, and storing
  -- times against it would be a contradiction waiting to be read wrong.
  check (
    (is_closed and opening_time is null and closing_time is null)
    or (not is_closed and opening_time is not null and closing_time is not null)
  )
);

create index if not exists branch_weekly_hours_branch_idx
  on branch_weekly_hours (branch_id);

alter table branch_weekly_hours enable row level security;

-- Read: the same audience as the branch itself, since the POS needs it to
-- work out whether a shift has outlived its trading day.
create policy branch_weekly_hours_select on branch_weekly_hours for select
  using (business_id = current_business_id());

-- Write: whoever administers branches from the dashboard.
create policy branch_weekly_hours_write on branch_weekly_hours for all
  using (business_id = current_business_id() and has_permission('screen:settings'))
  with check (business_id = current_business_id() and has_permission('screen:settings'));

comment on table branch_weekly_hours is
  'Per-weekday opening hours overrides. A weekday with no row uses branches.opening_time/closing_time; is_closed=true means shut that day. Optional — most branches need none.';
