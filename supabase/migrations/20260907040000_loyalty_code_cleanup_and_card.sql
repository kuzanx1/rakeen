-- (١) الرمز يُمحى من البطاقة بمجرّد استعماله.
--
-- كان يبقى مكتوباً عليها بعد الصرف -- رمزٌ مستهلَك معروضٌ على وجه
-- بطاقة، يقرؤه صاحبها فيظنّه صالحاً، ويقرؤه غيرُه فيجرّبه. وهو لا
-- يُقبل مرّتين، لكن بقاءه يُربك ويوهم.
--
-- ولا يُدفع فوراً بعد المحو: دفعتان لبطاقةٍ واحدة في دقيقة هو النمط
-- الذي يخنقها عند iOS. فيُحرَّك ختمُ التحديث وحده، وتمرّ عليه المكنسة
-- خلال دقيقتين -- والرمز ينتهي في دقيقتين أصلاً.
create or replace function verify_loyalty_redemption_code(p_request_id bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $vf$
declare
  v_business_id bigint;
  v_ok boolean;
  v_left int;
  v_customer bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update loyalty_redemption_requests
  set attempts = attempts + 1
  where id = p_request_id and business_id = v_business_id
    and status = 'pending' and expires_at > now() and attempts < 5
  returning (5 - attempts) into v_left;

  if v_left is null then
    return jsonb_build_object('ok', false, 'error', 'expired_or_locked');
  end if;

  update loyalty_redemption_requests
  set status = 'confirmed', responded_at = now()
  where id = p_request_id and business_id = v_business_id
    and status = 'pending' and code = btrim(p_code)
  returning customer_id into v_customer;

  if v_customer is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_code', 'triesLeft', v_left);
  end if;

  update customers
  set wallet_message = null, wallet_message_at = null, wallet_pass_updated_at = now()
  where id = v_customer;

  return jsonb_build_object('ok', true, 'requestId', p_request_id);
end;
$vf$;
revoke all on function verify_loyalty_redemption_code(bigint, text) from public, anon;
grant execute on function verify_loyalty_redemption_code(bigint, text) to authenticated;

-- (٢) وطريقٌ ثالث للتأكيد: مسحُ باركود بطاقته.
--
-- الرمز يشترط أن يصل جهازَ العميل -- ويشترط الوصولُ شبكةً عنده. ومن
-- دخل مقهىً في قبوٍ بلا تغطية لا يصله شيء، فيقف هو والكاشير أمام
-- بابٍ لا يُفتح.
--
-- وبطاقتُه في محفظته بلا شبكة: باركودُها مرسومٌ فيها، يُمسح فيثبت أنه
-- يحملها. وهذا إثباتُ حيازةٍ كإثبات الرمز تماماً -- بل أقوى: الرمز
-- يُقال بالصوت ويُسمع، والباركود يُمسح من يده.
--
-- والرمز يبقى للحالة التي لا بطاقة فيها أصلاً (بطاقةٌ لم تُضف)، فلكل
-- حالةٍ بابها.
create or replace function confirm_loyalty_request_by_card(p_request_id bigint, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cc$
declare
  v_business_id bigint;
  v_customer bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- الطلبُ والبطاقةُ لعميلٍ واحد: مسحُ بطاقةِ زبونٍ آخر لا يؤكّد هذا.
  update loyalty_redemption_requests r
  set status = 'confirmed', responded_at = now()
  from customers c
  where r.id = p_request_id
    and r.business_id = v_business_id
    and r.status = 'pending'
    and r.expires_at > now()
    and c.id = r.customer_id
    and c.public_token = p_token
  returning r.customer_id into v_customer;

  if v_customer is null then
    return jsonb_build_object('ok', false, 'error', 'card_mismatch');
  end if;

  update customers
  set wallet_message = null, wallet_message_at = null, wallet_pass_updated_at = now()
  where id = v_customer;

  return jsonb_build_object('ok', true, 'requestId', p_request_id);
end;
$cc$;
revoke all on function confirm_loyalty_request_by_card(bigint, uuid) from public, anon;
grant execute on function confirm_loyalty_request_by_card(bigint, uuid) to authenticated;
