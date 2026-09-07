-- البطاقة تُدفَع إلى جيب صاحبها.
--
-- كان كلّ شيء مبنيّاً إلا الخيط الأخير: wallet_pass_updated_at يُلمس
-- عند كل تغيّر في رصيد الزبون، والخادم يبني البطاقة المحدَّثة حين
-- تُطلَب، وpushToDevices مكتوبةٌ مختبَرة -- ولا أحد يناديها.
--
-- فالبطاقة لا تتحدّث إلا حين يفتح صاحبها المحفظة ويسحب لأسفل. وهو لا
-- يفعل: يشتري قهوته وينصرف، وتبقى بطاقته تقول "٣ من ٦" وهو قد بلغ
-- الخمسة. وبطاقةٌ تكذب أسوأ من بطاقةٍ لا تُضاف.
--
-- والدفع يُجدوَل ولا يُربط بالشراء: ربطُه بالشراء يجعل إشعارَ آبل في
-- طريق الكاشير -- يبطئ إتمام الطلب، وقد يفشل فيُرى فشلُه في وجهه وهو
-- لا حيلة له فيه. والمكنسة كل دقيقتين تصل قبل أن يخرج الزبون من الباب.
alter table customers
  add column if not exists wallet_pass_pushed_at timestamptz;

comment on column customers.wallet_pass_pushed_at is
  'آخر مرة أُشعر جهاز صاحب البطاقة. ما تخلّف عن wallet_pass_updated_at ينتظر الدفع.';

create index if not exists customers_wallet_push_pending
  on customers (business_id)
  where wallet_pass_updated_at is not null;

/**
 * ما ينتظر الدفع: بطاقاتٌ تغيّرت ولم تُشعَر، ولها جهازٌ مسجَّل.
 *
 * والقيد الأخير هو الذي يجعلها رخيصة: أكثر الزبائن لا يضيفون البطاقة
 * أصلاً، فلا شيء يُدفع إليهم. والانضمام إلى التسجيلات يحصرها فيمن
 * أضافها فعلاً.
 */
create or replace function wallet_push_pending(p_limit int default 200)
returns table (customer_id bigint, push_token text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select distinct on (r.push_token, c.id) c.id, r.push_token, c.wallet_pass_updated_at
  from customers c
  join wallet_pass_registrations r on r.customer_id = c.id
  where c.wallet_pass_pushed_at is null
     or c.wallet_pass_updated_at > c.wallet_pass_pushed_at
  order by r.push_token, c.id, c.wallet_pass_updated_at desc
  limit p_limit;
$$;

revoke all on function wallet_push_pending(int) from public, anon, authenticated;

/** يُعلَّم ما دُفع، بالوقت الذي قُرئ به لا بـnow(): تغيّرٌ وقع أثناء
    الدفع يبقى منتظراً بدل أن يُطمس. */
create or replace function wallet_push_mark(p_customer_ids bigint[], p_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update customers set wallet_pass_pushed_at = p_at
  where id = any(p_customer_ids)
    and (wallet_pass_pushed_at is null or wallet_pass_pushed_at < p_at);
$$;

revoke all on function wallet_push_mark(bigint[], timestamptz) from public, anon, authenticated;

/**
 * تصميمٌ تغيّر: كلّ بطاقات المنشأة تحتاج بناءً جديداً.
 *
 * ولا يكفي الدفع وحده: الخادم يردّ 304 ما لم يتغيّر updated_at، فيُوقظ
 * الجهازُ ويُسأل ويُقال له "لا جديد" -- والتصميم جديدٌ كلُّه.
 */
create or replace function bump_business_wallet_passes()
returns int
language plpgsql
security definer
set search_path = public
as $bump$
declare
  v_business_id bigint;
  v_count int;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return 0;
  end if;
  update customers set wallet_pass_updated_at = now()
  where business_id = v_business_id
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = customers.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$bump$;

revoke all on function bump_business_wallet_passes() from public, anon;
grant execute on function bump_business_wallet_passes() to authenticated;
