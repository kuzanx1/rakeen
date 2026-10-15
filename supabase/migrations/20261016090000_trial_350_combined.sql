-- الفترة التجريبية: 350 طلب من الكاشير والمتجر الإلكتروني مع بعض.
--
-- قبلها كانت التجربة على المتجر الإلكتروني وحده: online_order_free_count
-- يزيد مع كل طلب إلكتروني حقيقي، والمتجر يقفل عند الحد، والكاشير مجاني بلا
-- حد. الحين نفس العدّاد يعدّ طلبات الكاشير أيضًا (طلب كاشير + طلب إلكتروني
-- = طلبين)، وما تغيّر اسمه عشان كل ما يقرأه (لوحة الأدمن، لوحة المطعم،
-- المتجر، webhook جيديا) يبقى شغال.
--
-- لما يوصل الحد: trial_limit_reached_at = وقت الوصول، وبعده مهلة 24 ساعة
-- (عشان ما يوقف المطعم فجأة وقت الزحمة)، وبعدها البيع كله ينقفل: الكاشير
-- (trigger على orders) والمتجر (submit_online_order). اللوحة والتقارير
-- والبيانات تبقى مفتوحة. الاشتراك (online_subscribed = true) يفك كل شي.
--
-- طلب انعمل بدون إنترنت قبل القفل ووصل بعده: الخادم يرفضه، والكاشير يحفظه في
-- طابور المزامنة (ما ينحذف أبدًا)، ويتسجّل لحاله أول ما يشترك المطعم.
--
-- العدّ يبدأ من تشغيل هالملف: طلبات الكاشير القديمة ما تنحسب.

set lock_timeout = '4s';
alter table businesses add column if not exists trial_limit_reached_at timestamptz;
grant select (trial_limit_reached_at) on businesses to anon;


-- ============================================================
-- 1) المشتركين الحاليين ما يتأثرون
-- ============================================================
-- أي مطعم على باقة أو عنده عقد موقّع = مشترك، حتى لو ما انضغط له زر
-- «مشترك» في لوحة الأدمن. بدون هذا كان بيدخل التجربة ويقفل بعد 350 طلب.
do $$
declare v_n int;
begin
  update businesses b set online_subscribed = true
   where b.online_subscribed = false
     and (b.plan_tier is not null
          or exists (select 1 from subscription_contracts c where c.business_id = b.id and c.status = 'signed'));
  get diagnostics v_n = row_count;
  raise notice 'marked subscribed (plan or signed contract): %', v_n;
end $$;


-- ============================================================
-- 2) وقت الوصول للحد
-- ============================================================
-- يشتغل بعد rk_businesses_guard (الترتيب أبجدي)، يعني بعد ما يرجّع أعمدة
-- الأدمن لو حاول المالك يعدّلها، فالمالك ما يقدر يلمس هالوقت.
create or replace function rk_trial_mark()
returns trigger
language plpgsql
as $fn$
begin
  -- المالك ما يقدر يصفّر الوقت بنفسه ويبدأ مهلة جديدة كل مرة
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.trial_limit_reached_at := old.trial_limit_reached_at;
  end if;
  if new.online_subscribed
     or coalesce(new.online_order_free_count, 0) < coalesce(new.online_order_free_limit, 350) then
    -- اشترك، أو الأدمن رفع الحد: ترجع التجربة مفتوحة
    new.trial_limit_reached_at := null;
  elsif new.trial_limit_reached_at is null then
    new.trial_limit_reached_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists rk_trial_mark on businesses;
create trigger rk_trial_mark
  before insert or update on businesses
  for each row execute function rk_trial_mark();

-- مطاعم وصلت الحد من قبل (المتجر عندها مقفول أصلاً): مهلتها تبدأ من الحين
update businesses set trial_limit_reached_at = now()
 where not online_subscribed
   and online_order_free_count >= coalesce(online_order_free_limit, 350)
   and trial_limit_reached_at is null;


-- ============================================================
-- 3) هل البيع مقفول؟
-- ============================================================
create or replace function rk_trial_locked(p_business_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((
    select not b.online_subscribed
       and b.trial_limit_reached_at is not null
       and now() >= b.trial_limit_reached_at + interval '24 hours'
      from businesses b where b.id = p_business_id
  ), false);
$fn$;
revoke execute on function rk_trial_locked(bigint) from public, anon;
grant execute on function rk_trial_locked(bigint) to authenticated, service_role;


-- ============================================================
-- 4) الكاشير: يقفل بعد المهلة، ويعدّ كل طلب
-- ============================================================
-- الطلبات الإلكترونية (source = 'online') ما تنعدّ هنا: submit_online_order
-- وwebhook جيديا يعدّونها أصلاً (الكاش عند الإرسال، والبطاقة بعد الدفع).
create or replace function rk_trial_pos_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.source = 'online' then
    return new;
  end if;
  if tg_op = 'INSERT' and tg_when = 'BEFORE' then
    if rk_trial_locked(new.business_id) then
      raise exception 'trial_ended' using hint = 'انتهت الفترة التجريبية، اشترك عشان تكمل البيع';
    end if;
    return new;
  end if;
  update businesses
     set online_order_free_count = online_order_free_count + 1
   where id = new.business_id and not online_subscribed;
  return new;
end;
$fn$;

drop trigger if exists rk_trial_pos_gate on orders;
create trigger rk_trial_pos_gate
  before insert on orders
  for each row execute function rk_trial_pos_order();

drop trigger if exists rk_trial_pos_count on orders;
create trigger rk_trial_pos_count
  after insert on orders
  for each row execute function rk_trial_pos_order();


-- ============================================================
-- 5) المتجر: نفس المهلة
-- ============================================================
-- كان يقفل لحظة الوصول للحد. الحين يقفل مع الكاشير بعد المهلة.
do $$
declare
  f record;
  v_def text;
  v_old text := 'v_business.online_order_free_count >= coalesce(v_business.online_order_free_limit, 350)';
  v_done int := 0;
begin
  for f in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_online_order' loop
    v_def := pg_get_functiondef(f.oid);
    if position(v_old in v_def) = 0 then
      continue;
    end if;
    execute replace(v_def, v_old, 'public.rk_trial_locked(v_business.id)');
    v_done := v_done + 1;
  end loop;
  if v_done = 0 then
    raise exception 'submit_online_order: free-limit gate not found, nothing changed';
  end if;
  raise notice 'submit_online_order patched: % definition(s)', v_done;
end $$;


-- ============================================================
-- 6) حالة التجربة للوحة والكاشير (الويب والتطبيق ينادونها نفسها)
-- ============================================================
create or replace function get_trial_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'subscribed', b.online_subscribed,
    'used', b.online_order_free_count,
    'limit', coalesce(b.online_order_free_limit, 350),
    'remaining', greatest(0, coalesce(b.online_order_free_limit, 350) - b.online_order_free_count),
    'reached_at', b.trial_limit_reached_at,
    'locks_at', b.trial_limit_reached_at + interval '24 hours',
    'locked', rk_trial_locked(b.id),
    'now', now()
  )
  from businesses b
  where b.id = current_business_id();
$fn$;
revoke execute on function get_trial_status() from public, anon;
grant execute on function get_trial_status() to authenticated;


-- ============================================================
-- 7) مدة الخصم في العقود
-- ============================================================
-- عدد الفترات (أشهر للشهري، سنوات للسنوي) اللي يسري عليها الخصم، وبعدها
-- السعر الأساسي (list_price). null = عقد قديم ما حدد المدة.
alter table subscription_contracts
  add column if not exists discount_periods int check (discount_periods is null or discount_periods between 1 and 60);
