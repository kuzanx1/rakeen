-- قناةٌ يسمعها الكاشير حين يُمسح الباركود.
--
-- الباركود يُعرض على شاشة العميل، ونافذةُ نجاح الطلب باقيةٌ أمام
-- الكاشير حتى يغلقها. فإذا مسحه العميل فقد انتهى الطلب كله -- الفاتورة
-- طُبعت، والبطاقة أُضيفت -- ولا معنى لبقاء النافذة تنتظر ضغطة.
--
-- والخادم يعرف اللحظة: هو الذي يصرف الرمز. فيبقى أن يجد قناةً يخبر
-- بها الكاشير.
--
-- ولا تكون قناةَ الشاشة: سرُّها لا يُسلَّم للمتصفح، ومن ملكه استمع إلى
-- كل باركود يمرّ عليها. فمعرّفٌ عابر يُولد مع الرمز، يُعطى للكاشير
-- وحده، ويموت بموت الرمز -- يسمع به نتيجةَ عرضه هو، لا شيئاً سواها.
alter table wallet_add_tokens
  add column if not exists pos_session uuid not null default gen_random_uuid();

comment on column wallet_add_tokens.pos_session is
  'قناة يستمع إليها الكاشير الذي عرض هذا الباركود، ليُغلق نافذته حين يُمسح.';

-- يُرجَع مع الرمز ليعطيه المسار للكاشير.
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
  if v_business_id is null or not has_permission('pos:register') then
    return null;
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return null;
  end if;

  -- رموز هذا الزبون السابقة تموت: العميل يطلبها ثانيةً لأن الأولى لم
  -- تنفع، فبقاؤها حيّةً يترك على الشاشة ما لم يعد يُقصد.
  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '2 minutes')
  returning token, pos_session into v_token, v_session;

  return jsonb_build_object('token', v_token, 'posSession', v_session);
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;

-- ويُرجَع عند الصرف ليُبثّ إليه.
create or replace function consume_wallet_add_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_public uuid;
  v_display bigint;
  v_session uuid;
begin
  update wallet_add_tokens t
  set consumed_at = now()
  from customers c
  where t.token = p_token
    and t.customer_id = c.id
    and t.consumed_at is null
    and t.expires_at > now()
  returning c.public_token, t.display_device_id, t.pos_session
  into v_public, v_display, v_session;

  if v_public is null then
    return null;  -- مصروف، أو منتهٍ، أو لا وجود له.
  end if;

  return jsonb_build_object(
    'publicToken', v_public,
    'displayDeviceId', v_display,
    'posSession', v_session
  );
end;
$use$;

revoke all on function consume_wallet_add_token(uuid) from public, anon;
