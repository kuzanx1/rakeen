-- رابطُ الشاشة: هويّتها في العنوان، لا في ذاكرةٍ تُمحى.
--
-- الاقتران اليوم سرٌّ يُحفظ في localStorage. وذاك يُمحى ولا يستأذن:
-- متصفّح كشكٍ ينظّف عند كل إغلاق، وسفاري تمسح ما تكتبه النصوص بعد
-- سبعة أيام بلا لمس -- وشاشةُ العميل لا يلمسها أحد بطبيعتها. فتصبح
-- الشاشة تطلب رمزاً كل بضعة أيام، وصاحب المطعم يولّد ويكتب ويعيد.
--
-- وأُضيفت كعكةٌ من الخادم مرساةً ثانية، فسقطت معها على أجهزةٍ تمسح
-- الكعكات كذلك. والعلّة في الفكرة لا في تنفيذها: أيُّ حلٍّ يعتمد على
-- ما يحفظه المتصفّح سيسقط على جهازٍ يمسح ما يحفظه المتصفّح.
--
-- فالهوية تنتقل إلى العنوان: يفتح صاحب المطعم رابطاً يحمل السرّ، ويحفظه
-- صفحةً رئيسية للكشك. يُمحى التخزين كلّه فلا يضرّ -- الرابط يعيد
-- الاقتران في كل فتحة، بلا رمزٍ ولا خطوة.
--
-- والسرّ يُسلَّم للمالك وحده (settings:edit) وفي هذا المسار وحده: هو
-- الذي يجهّز شاشاته، ولا يُعرض في أي قائمةٍ ولا يُرسل إلى الكاشير.
create or replace function get_display_device_link(p_device_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint;
  v_secret text;
  v_slug text;
  v_label text;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select d.device_secret, b.online_menu_slug, d.label
  into v_secret, v_slug, v_label
  from display_devices d
  join businesses b on b.id = d.business_id
  where d.id = p_device_id and d.business_id = v_business_id;

  if v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'secret', v_secret, 'slug', v_slug, 'label', v_label);
end;
$$;
revoke all on function get_display_device_link(bigint) from public, anon;
grant execute on function get_display_device_link(bigint) to authenticated;
