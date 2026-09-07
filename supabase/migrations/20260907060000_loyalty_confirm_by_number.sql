-- بابٌ ثالث: رقم البطاقة المطبوع تحتها.
--
-- الرمز المؤقّت يشترط شبكةً عند العميل. والمسح يشترط كاميرا تعمل في
-- جهاز الكاشير -- وكثيرٌ من نقاط البيع أجهزةٌ بلا كاميرا أصلاً. فيبقى
-- زبونٌ محقٌّ واقفاً بلا باب.
--
-- وثمانيةُ أحرفٍ مرسومةٌ تحت باركود البطاقة (altText) تُقرأ بالعين بلا
-- شبكةٍ ولا عدسة. وهي صدرُ رمز بطاقته لا كلُّه: لا تُفتح بها بطاقته،
-- إنما تُثبت أنه يحملها.
--
-- وهي ثابتة لا تتغيّر -- فهي أضعف من رمز الدقيقتين: من صوّر بطاقة
-- غيره مرّةً يحملها. ولذلك تبقى الثالثة في الترتيب لا الأولى، ويبقى
-- لكل حالةٍ بابها.
create or replace function confirm_loyalty_request_by_number(p_request_id bigint, p_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cn$
declare
  v_business_id bigint;
  v_customer bigint;
  v_want text := upper(regexp_replace(coalesce(p_number, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if length(v_want) <> 8 then
    return jsonb_build_object('ok', false, 'error', 'bad_number');
  end if;

  update loyalty_redemption_requests r
  set status = 'confirmed', responded_at = now()
  from customers c
  where r.id = p_request_id
    and r.business_id = v_business_id
    and r.status = 'pending'
    and r.expires_at > now()
    and c.id = r.customer_id
    and upper(left(c.public_token::text, 8)) = v_want
  returning r.customer_id into v_customer;

  if v_customer is null then
    return jsonb_build_object('ok', false, 'error', 'number_mismatch');
  end if;

  update customers
  set wallet_message = null, wallet_message_at = null, wallet_pass_updated_at = now()
  where id = v_customer;

  return jsonb_build_object('ok', true, 'requestId', p_request_id);
end;
$cn$;
revoke all on function confirm_loyalty_request_by_number(bigint, text) from public, anon;
grant execute on function confirm_loyalty_request_by_number(bigint, text) to authenticated;
