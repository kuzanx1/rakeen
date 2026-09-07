-- مهلة رمز الإضافة: خمس دقائق لا دقيقتان.
--
-- دقيقتان تكفيان من يمسح فوراً، ولا تكفيان من يخرج جوّاله من جيبه ثم
-- يفتح الكاميرا ثم يقرأ الرسالة ثم يضغط "إضافة". والزبون واقفٌ عند
-- الكاشير، ومن حوله طابور، فيتعجّل ويخطئ ويعيد.
--
-- والأمان لا يُشترى بضيق المهلة: الرمز يُصرف مرةً واحدة -- من مسحه
-- أخذه، ومن صوّر الشاشة بعده لم يجد شيئاً. والمهلة احتياطٌ لمن لم
-- يمسح أصلاً، لا حاجزٌ أمام من يمسح.
create or replace function create_wallet_add_token(
  p_customer_id bigint,
  p_display_device_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_token uuid;
  v_session uuid;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('error', 'no_business');
  end if;
  if not has_permission('pos:register') then
    return jsonb_build_object('error', 'no_permission');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return jsonb_build_object('error', 'customer_not_found');
  end if;

  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '5 minutes')
  returning token, pos_session into v_token, v_session;

  return jsonb_build_object('token', v_token, 'posSession', v_session);
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;
