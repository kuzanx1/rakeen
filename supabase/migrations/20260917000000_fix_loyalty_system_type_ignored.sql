-- الولاء: الكاشير يمنح نقاطًا ولو كان النظام زيارات أو أكواب.
--
-- ▓ العطل، وهو من صنعي:
--   award_loyalty_for_order هي التي تعرف نوع نظام الولاء -- تقرأ
--   loyalty_system_type وتفرّق بين 'points' و'visits' و'products'،
--   وتعرف الحدّ الأدنى للزيارة، وتعرف أن سطر المكافأة المجانية لا
--   يُحتسب. وقد وُصلت بـcomplete_pos_order في 20260907070000، وفي
--   ملفها تعليقٌ يقول: «السطر الذي سقط مرتين. صار نداءً واحداً لا
--   كتلة تُنسخ».
--
--   ثم جاء 20260916000000 (سبب الخصم) فأعاد تعريف complete_pos_order
--   ناسخًا جسمها من 20260901040000 -- وهو أقدمُ من ذلك الإصلاح، وفيه
--   كتلةُ نقاطٍ مكتوبةٌ في المكان لا تفحص نوع النظام إطلاقًا. فسقط
--   السطر ثالثةً، وحملها 20260916030000 بعده.
--
--   فالنتيجة التي رآها صاحب المطعم بالضبط: يحوّل النظام إلى زيارات أو
--   أكواب، ويبقى الكاشير يزيد النقاط ولا يزيد زيارةً واحدة.
--
-- ▓ الإصلاح:
--   الكتلة تُستبدَل بنداءٍ واحد، والجسم يبقى حرفًا بحرف كما هو منشور
--   الآن (سجلّ الحركات، سبب الخصم، كل شيء) -- استُخرج من الملف المنشور
--   واستُبدلت فيه الكتلة وحدها، فلا تُعاد كتابة سطرٍ بيد.
--
--   ولا يتغيّر التوقيع: لا drop، ولا إعادة revoke.
--
-- ▓ ما لا يصلحه هذا الملف (مذكورٌ كي لا يُنسى):
--   pay_dine_in_order لا تمنح ولاءً إطلاقًا -- في أي من تعريفاتها
--   الثلاثة. فطلبُ طاولةٍ يُسجَّل ثم يُدفع لاحقًا لا يكسب صاحبُه شيئًا،
--   في أي نظام. وهذا عطلٌ سابقٌ لي ومستقلّ عن هذا، ويحتاج قرارًا:
--   أيُمنح عند التسجيل أم عند الدفع؟ فتُرك هنا عمدًا.

create or replace function complete_pos_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_discount_amount numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_amount numeric,
  p_items jsonb,
  p_channel text default 'dine_in',
  p_delivery_platform_id bigint default null,
  p_table_id bigint default null,
  p_staff_member_id bigint default null,
  p_platform_invoice_last4 text default null,
  p_customer_id bigint default null,
  p_discount_reason text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $cpo$
declare
  v_order_id bigint;
  v_order_item_id bigint;
  v_business_id bigint := current_business_id();
  v_business record;
  v_vat numeric;
  v_total numeric;
  v_auto_ready boolean;
  v_resolved_customer_id bigint;
  v_menu_item_id bigint;
  v_qty numeric;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
  v_points_divisor numeric;
  v_points_earned numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  select * into v_business from businesses where id = v_business_id;

  v_resolved_customer_id := p_customer_id;
  if v_resolved_customer_id is null and p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_resolved_customer_id from customers
      where business_id = v_business_id and phone = p_customer_phone;
    if v_resolved_customer_id is null then
      insert into customers (business_id, name, phone)
      values (v_business_id, coalesce(nullif(trim(p_customer_name), ''), p_customer_phone), p_customer_phone)
      returning id into v_resolved_customer_id;
    elsif p_customer_name is not null and length(trim(p_customer_name)) > 0 then
      update customers set name = p_customer_name where id = v_resolved_customer_id;
    end if;
  end if;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      p_subtotal - p_discount_amount,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  v_auto_ready := case p_channel
    when 'dine_in' then v_business.auto_ready_dine_in
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_platform
    else false
  end;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
    subtotal, discount_pct, discount_amount, discount_reason, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4,
    ready_at, prep_duration_seconds, delivered_at)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_resolved_customer_id,
    p_subtotal, p_discount_pct, p_discount_amount, nullif(trim(p_discount_reason), ''), v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4,
    case when v_auto_ready then now() else null end,
    case when v_auto_ready then 0 else null end,
    case when v_auto_ready and p_channel = 'delivery' then now() else null end)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
    v_is_points_redemption := coalesce((item->>'is_points_redemption')::boolean, false);
    v_points_cost := coalesce((item->>'points_cost')::numeric, 0);
    if v_is_points_redemption and v_points_cost > 0 then
      v_total_points_cost := v_total_points_cost + v_points_cost;
    end if;

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale, is_points_redemption, points_spent)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end,
      v_is_points_redemption, v_points_cost
    )
    returning id into v_order_item_id;

    -- كل خصمٍ يُكتب سطره، ومعه السطر الذي سبّبه -- به وحده يستطيع
    -- الاسترجاع أن يعكس ما وقع بدل أن يعيد حسابه.
    if v_menu_item_id is not null then
      for dec_row in select * from resolve_menu_item_recipe_decrements(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'recipe', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_box_selection_decrements(v_menu_item_id, v_qty, item->'box_selections') loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'box', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_finished_good_decrement(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'finished_good', v_order_id, v_order_item_id);
      end loop;
    end if;

    -- خيارات مرتبطة بالمخزون. هذي بالذات كانت تُخصم ولا تُسجَّل، فلا
    -- يجد الاسترجاع لها أثرًا -- وهي الستّون غرامًا الضائعة.
    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      perform rk_stock_move(v_business_id, (dec->>'stock_item_id')::bigint, -(dec->>'qty')::numeric,
                            'sale', 'modifier', v_order_id, v_order_item_id);
    end loop;
  end loop;

  if v_total_points_cost > 0 then
    if v_resolved_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = v_resolved_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  -- السطر الذي سقط ثلاث مرّات. صار نداءً واحدًا لا كتلةً تُنسخ:
  -- award_loyalty_for_order وحدها تعرف نوع النظام (نقاط/زيارات/أكواب)،
  -- وتعرف الحدّ الأدنى للزيارة، وتعرف أن سطر المكافأة المجانية لا يُعدّ.
  perform award_loyalty_for_order(v_business_id, v_resolved_customer_id, v_total, v_order_id);

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$cpo$;
