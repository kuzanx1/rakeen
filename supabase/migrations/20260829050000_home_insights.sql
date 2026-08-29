-- Replaces the hardcoded placeholder lines in the dashboard's welcome card
-- ("مخزون الدجاج يكفي 6 ساعات", "ذروة الزحمة الساعة 8 مساءً", "أنت بالمسار
-- الصحيح لهدفك") with real per-business numbers. No parameter — scoped to
-- current_business_id() like menu_item_costs(), so RLS/permission checks
-- don't need to trust a client-supplied business_id.
create or replace function home_insights()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_business_id bigint := current_business_id();
  v_peak_hour int;
  v_peak_sample_size int;
  v_low_stock_name text;
  v_low_stock_pct numeric;
  v_sales_target numeric;
  v_open_time time;
  v_close_time time;
begin
  if v_business_id is null then
    return jsonb_build_object();
  end if;

  -- Peak hour: only surfaced with a decent sample so 2 lucky orders at 3am
  -- don't get reported as "your predicted rush hour".
  select count(*) into v_peak_sample_size
  from orders
  where business_id = v_business_id and status = 'completed' and created_at > now() - interval '30 days';

  if v_peak_sample_size >= 10 then
    select extract(hour from created_at at time zone 'Asia/Riyadh')::int into v_peak_hour
    from orders
    where business_id = v_business_id and status = 'completed' and created_at > now() - interval '30 days'
    group by 1
    order by count(*) desc
    limit 1;
  end if;

  -- Lowest stock item relative to its own par level — only flagged once it
  -- has fallen under half of normal, and only for items with a par level set
  -- at all (an unconfigured par_level of 0 would divide by zero / mean nothing).
  select si.name, round((si.qty_on_hand / si.par_level) * 100)
  into v_low_stock_name, v_low_stock_pct
  from stock_items si
  where si.business_id = v_business_id and si.par_level > 0
  order by (si.qty_on_hand / si.par_level) asc
  limit 1;

  if v_low_stock_pct is not null and v_low_stock_pct >= 50 then
    v_low_stock_name := null;
    v_low_stock_pct := null;
  end if;

  select notify_sales_target_amount into v_sales_target from businesses where id = v_business_id;
  if coalesce(v_sales_target, 0) <= 0 then
    v_sales_target := null;
  end if;

  select min(opening_time), max(closing_time) into v_open_time, v_close_time
  from branches
  where business_id = v_business_id and opening_time is not null and closing_time is not null and closing_time > opening_time;

  return jsonb_build_object(
    'peakHour', v_peak_hour,
    'lowStockItem', case when v_low_stock_name is not null
      then jsonb_build_object('name', v_low_stock_name, 'pct', v_low_stock_pct)
      else null end,
    'salesTarget', v_sales_target,
    'businessOpenTime', v_open_time,
    'businessCloseTime', v_close_time
  );
end;
$$;

revoke all on function home_insights() from public, anon;
grant execute on function home_insights() to authenticated;
