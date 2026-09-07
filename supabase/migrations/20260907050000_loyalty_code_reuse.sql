-- الرمز الحيّ يُعاد، ولا يُولَّد غيرُه.
--
-- كانت كل ضغطةٍ تُبطل ما قبلها وتُنشئ رمزاً جديداً وتدفعه. وذلك يبدو
-- صحيحاً وهو أسوأ ما يمكن: iOS يخنق البطاقة التي تنهال عليها الدفعات،
-- فيصل الرمزُ الأول ويُبتلع ما بعده -- وتتجمّد البطاقة على رمزٍ صار
-- مُبطَلاً. فيقرؤه العميل ويكتبه الكاشير ويقول الخادم "خطأ"، وكلاهما
-- محقّ، والعطل بينهما.
--
-- والكاشير حين يضغط ثانيةً لا يريد رمزاً آخر -- يريد أن يصل الأول.
-- فيُعاد هو بعينه ما دام حيّاً، ولا تُدفع دفعةٌ ثانية: هي التي تخنق.
create or replace function create_loyalty_redemption_code(p_customer_id bigint, p_business_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint := p_business_id;
  v_code text;
  v_id bigint;
begin
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  -- حيٌّ ولم تُستنفد محاولاته؟ فهو الرمز، ولا يُدفع من جديد.
  select id, code into v_id, v_code
  from loyalty_redemption_requests
  where customer_id = p_customer_id and business_id = v_business_id
    and status = 'pending' and expires_at > now() and attempts < 5
  order by created_at desc
  limit 1;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'requestId', v_id, 'code', v_code, 'reused', true);
  end if;

  update loyalty_redemption_requests
  set status = 'expired'
  where customer_id = p_customer_id and status = 'pending';

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into loyalty_redemption_requests (customer_id, business_id, status, expires_at, code)
  values (p_customer_id, v_business_id, 'pending', now() + interval '2 minutes', v_code)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'requestId', v_id, 'code', v_code, 'reused', false);
end;
$mk$;
revoke all on function create_loyalty_redemption_code(bigint, bigint) from public, anon, authenticated;
