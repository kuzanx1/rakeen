-- مكافأةٌ خُصمت ولم تُصرف تعود إلى صاحبها.
--
-- الخصمُ يقع لحظة التأكيد -- قبل أن يختار الكاشير الصنف. وذلك صواب:
-- إثباتُ العميل تمّ، ولا ينبغي أن يُطلب منه مرّتين لو غيّر رأيه في
-- الصنف.
--
-- لكن بينهما فجوة: يُفرغ الكاشير السلة، أو يبدأ طلباً جديداً، أو
-- ينصرف الزبون -- والمكافأة انخصمت ولم تخرج بضاعةٌ مقابلها. فيخسرها
-- العميل بلا أن يأخذ شيئاً، ولا أحد يعرف.
--
-- فتُعاد. والحدّ: طلبُ تأكيدٍ صُرف فعلاً ولم يمضِ عليه أكثر من ساعة --
-- فلا تُستعمل هذه لزيادة أرصدةٍ بلا سبب.
create or replace function return_unused_free_reward(p_customer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rt$
declare
  v_business_id bigint;
  v_req bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- طلبٌ أُكِّد وصُرف في الساعة الماضية ولم يُعلَّم مُعاداً بعد.
  update loyalty_redemption_requests
  set status = 'returned'
  where id = (
    select r.id from loyalty_redemption_requests r
    where r.customer_id = p_customer_id
      and r.business_id = v_business_id
      and r.status = 'confirmed'
      and r.consumed_at is not null
      and r.consumed_at > now() - interval '1 hour'
    order by r.consumed_at desc
    limit 1
  )
  returning id into v_req;

  if v_req is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_return');
  end if;

  update customers
  set loyalty_free_rewards = loyalty_free_rewards + 1
  where id = p_customer_id and business_id = v_business_id;

  return jsonb_build_object('ok', true, 'requestId', v_req);
end;
$rt$;
revoke all on function return_unused_free_reward(bigint) from public, anon;
grant execute on function return_unused_free_reward(bigint) to authenticated;

-- والحالة الجديدة تُقبل في القيد.
alter table loyalty_redemption_requests drop constraint if exists loyalty_redemption_requests_status_check;
alter table loyalty_redemption_requests add constraint loyalty_redemption_requests_status_check
  check (status in ('pending','confirmed','declined','expired','returned'));
