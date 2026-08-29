-- The daily-report cron route originally looped over every business from
-- the Cloudflare Worker, issuing ~10 Supabase REST calls per business. Past
-- roughly 20 businesses that hits Cloudflare's "too many subrequests per
-- Worker invocation" ceiling — every business after that point failed
-- outright (confirmed live: 5 succeeded, 22 failed with exactly that error).
-- The fix is architectural, not tuning: do the whole thing in ONE Postgres
-- function call. A single RPC invocation from the Worker counts as one
-- subrequest no matter how much work Postgres does inside it, and looping
-- over businesses in plpgsql never touches that limit at all.
create or replace function generate_daily_reports(p_report_date date, p_day_start timestamptz, p_day_end timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  biz record;
  v_count integer := 0;
  v_net_sales numeric; v_orders_count integer; v_avg_ticket numeric;
  v_revenue numeric; v_discounts numeric; v_vat numeric; v_subtotal numeric;
  v_cogs numeric; v_delivery_cost numeric; v_opex numeric; v_gross_profit numeric; v_net_profit numeric;
  v_expenses_total numeric; v_monthly_fixed numeric; v_days_in_month integer;
  v_sellers jsonb; v_category_perf jsonb; v_channel_perf jsonb; v_payment_breakdown jsonb; v_delivery_by_platform jsonb;
  v_data jsonb;
begin
  for biz in select id, daily_report_sales, daily_report_products, daily_report_payments, daily_report_financial, daily_report_tax, daily_report_delivery from businesses loop

    -- Orders qualifying for the report — same filter as loadSalesRangeData.
    create temporary table if not exists tmp_day_orders on commit drop as
      select * from orders where false;
    truncate tmp_day_orders;
    insert into tmp_day_orders
      select * from orders o
      where o.business_id = biz.id and o.created_at >= p_day_start and o.created_at < p_day_end
        and (o.status = 'completed' or o.status is null) and o.payment_status is distinct from 'unpaid';

    select coalesce(sum(total),0), count(*), coalesce(sum(coalesce(subtotal,0)),0), coalesce(sum(coalesce(discount_amount,0)),0), coalesce(sum(coalesce(vat_amount,0)),0)
      into v_net_sales, v_orders_count, v_revenue, v_discounts, v_vat
      from tmp_day_orders;
    v_avg_ticket := case when v_orders_count > 0 then v_net_sales / v_orders_count else 0 end;
    if v_revenue = 0 then v_revenue := v_net_sales; end if;
    if v_vat = 0 and v_net_sales > 0 then v_vat := v_net_sales - v_net_sales / 1.15; end if;
    v_subtotal := v_net_sales - v_vat;

    -- COGS: same three-mode logic as menu_item_costs()/computeVariableCost —
    -- direct = a flat approved number, recipe = ingredient qty x unit cost
    -- (unit-converted), box = recipe cost + (owner's default mix, falling
    -- back to an average of simple/stock eligible items when no default mix
    -- was set, matching the client's own fallback so a business.'s COGS here
    -- never silently reads as less than what computeVariableCost would show).
    create temporary table if not exists tmp_line_costs (qty numeric, unit_cost numeric, name text, cat text, line_total numeric) on commit drop;
    truncate tmp_line_costs;
    insert into tmp_line_costs
      select oi.qty,
        case m.cost_mode
          when 'direct' then coalesce(m.direct_cost,0)
          when 'recipe' then coalesce((
            select sum((case when rl.unit = si.unit then rl.qty when rl.unit='g' and si.unit='kg' then rl.qty/1000 when rl.unit='kg' and si.unit='g' then rl.qty*1000 else rl.qty end) * si.unit_cost)
            from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id where rl.menu_item_id = m.id
          ),0)
          when 'box' then
            coalesce((
              select sum((case when rl.unit = si.unit then rl.qty when rl.unit='g' and si.unit='kg' then rl.qty/1000 when rl.unit='kg' and si.unit='g' then rl.qty*1000 else rl.qty end) * si.unit_cost)
              from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id where rl.menu_item_id = m.id
            ),0)
            + coalesce((
              select sum(dm.qty * si.unit_cost) from menu_item_box_default_mix dm join stock_items si on si.id = dm.stock_item_id where dm.menu_item_id = m.id
            ), (
              select avg(case when e.cost_mode = 'simple' then coalesce(e.extra_cost,0) else coalesce(si.unit_cost,0) end) * coalesce(m.total_pieces,0)
              from menu_item_box_eligible_items e left join stock_items si on si.id = e.stock_item_id where e.menu_item_id = m.id
            ), 0)
          else 0
        end as unit_cost,
        m.name, coalesce(mc.name, '—') as cat, oi.line_total
      from order_items oi
      join tmp_day_orders o2 on o2.id = oi.order_id
      join menu_items m on m.id = oi.menu_item_id
      left join menu_categories mc on mc.id = m.category_id;
    select coalesce(sum(qty * unit_cost),0) into v_cogs from tmp_line_costs;

    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'cat', cat, 'qty', total_qty, 'revenue', total_revenue)), '[]'::jsonb)
      into v_sellers
      from (select name, cat, sum(qty) as total_qty, sum(line_total) as total_revenue from tmp_line_costs group by name, cat) s;

    select coalesce(jsonb_agg(jsonb_build_object('name', cat, 'revenue', cat_revenue)), '[]'::jsonb)
      into v_category_perf
      from (select cat, sum(line_total) as cat_revenue from tmp_line_costs group by cat having sum(line_total) > 0) c;

    select coalesce(jsonb_agg(jsonb_build_object('name',
        case channel when 'dine_in' then 'داخل المطعم' when 'pickup' then 'سفري' when 'delivery' then 'توصيل' else coalesce(channel,'—') end,
        'orders', orders_count, 'revenue', channel_revenue)), '[]'::jsonb)
      into v_channel_perf
      from (select channel, count(*) as orders_count, sum(total) as channel_revenue from tmp_day_orders group by channel) ch;

    select coalesce(jsonb_agg(jsonb_build_object('name', pname, 'amount', pamount)) filter (where pamount > 0), '[]'::jsonb)
      into v_payment_breakdown
      from (
        select 'كاش' as pname, sum(case when payment_method='cash' then total when payment_method='split' then coalesce(cash_amount,0) else 0 end) as pamount from tmp_day_orders
        union all
        select 'بطاقة', sum(case when payment_method='cash' then 0 when payment_method='split' then total - coalesce(cash_amount,0) when payment_method='delivery_platform' then 0 else total end) from tmp_day_orders
        union all
        select 'توصيل — مدفوع عبر التطبيق', sum(case when payment_method='delivery_platform' then total else 0 end) from tmp_day_orders
      ) pb;

    -- Delivery platform commission/fee/compensation — identical formula to
    -- computeOrderDeliveryPlatformCost() in rakeen-dashboard.js and to the
    -- reconciliation report, so this can never quietly disagree with either.
    create temporary table if not exists tmp_platform_calc (pname text, total numeric, commission numeric, fee numeric, compensation numeric) on commit drop;
    truncate tmp_platform_calc;
    insert into tmp_platform_calc
      select po.pname, po.total,
        (case when po.commission_base = 'subtotal' then po.subtotal else po.total end) * (po.commission_pct/100) as commission,
        (case when po.fee_model = 'tiered' then coalesce((
          select t.fee from delivery_platform_fee_tiers t where t.delivery_platform_id = po.delivery_platform_id and po.total >= t.min_order_value
          order by t.min_order_value desc limit 1
        ), 0) else 0 end + coalesce(po.flat_fee,0)) as fee,
        po.total * (po.compensation_pct/100) as compensation
      from (
        select o.id, o.total, coalesce(o.subtotal,0) as subtotal, o.delivery_platform_id, p.name as pname,
          p.commission_pct, p.commission_base, p.fee_model, p.flat_fee, p.compensation_pct
        from tmp_day_orders o
        join delivery_platforms p on p.id = o.delivery_platform_id
        where o.channel = 'delivery' and o.delivery_platform_id is not null
      ) po;
    select coalesce(sum(commission+fee+compensation),0) into v_delivery_cost from tmp_platform_calc;

    select coalesce(jsonb_agg(jsonb_build_object(
        'name', pname, 'ordersCount', orders_count, 'grossRevenue', gross_revenue,
        'totalCommission', total_commission, 'totalFees', total_fees, 'totalCompensation', total_compensation,
        'netToRestaurant', gross_revenue - total_commission - total_fees - total_compensation
      )), '[]'::jsonb)
      into v_delivery_by_platform
      from (
        select pname, count(*) as orders_count, sum(total) as gross_revenue,
          sum(commission) as total_commission, sum(fee) as total_fees, sum(compensation) as total_compensation
        from tmp_platform_calc group by pname
      ) dp;

    select coalesce(rent,0)+coalesce(salaries,0)+coalesce(utilities,0)+coalesce(other,0) into v_monthly_fixed
      from fixed_costs where business_id = biz.id;
    if v_monthly_fixed is null then v_monthly_fixed := 0; end if;
    v_days_in_month := extract(day from (date_trunc('month', p_report_date) + interval '1 month - 1 day'));
    select coalesce(sum(amount),0) into v_expenses_total from general_expenses
      where business_id = biz.id and spent_at >= p_day_start and spent_at < p_day_end;
    v_opex := v_monthly_fixed / v_days_in_month + v_expenses_total;
    v_gross_profit := v_subtotal - v_cogs - v_delivery_cost;
    v_net_profit := v_gross_profit - v_opex;

    v_data := jsonb_build_object(
      'netSales', v_net_sales, 'ordersCount', v_orders_count, 'avgTicket', v_avg_ticket,
      'revenue', v_revenue, 'discounts', v_discounts, 'vat', v_vat, 'subtotal', v_subtotal,
      'cogs', v_cogs, 'deliveryPlatformCost', v_delivery_cost, 'opex', v_opex,
      'grossProfit', v_gross_profit, 'netProfit', v_net_profit, 'expensesTotal', v_expenses_total,
      'sellers', v_sellers, 'categoryPerf', v_category_perf, 'channelPerf', v_channel_perf,
      'paymentBreakdown', v_payment_breakdown, 'deliveryByPlatform', v_delivery_by_platform,
      'sections', jsonb_build_object(
        'sales', biz.daily_report_sales, 'products', biz.daily_report_products, 'payments', biz.daily_report_payments,
        'financial', biz.daily_report_financial, 'tax', biz.daily_report_tax, 'delivery', biz.daily_report_delivery
      )
    );

    insert into daily_reports (business_id, report_date, data, generated_at)
    values (biz.id, p_report_date, v_data, now())
    on conflict (business_id, report_date) do update set data = excluded.data, generated_at = excluded.generated_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
