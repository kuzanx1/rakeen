-- حارسٌ يمنع إغراق بطاقةٍ واحدة بالإشعارات.
--
-- iOS يخنق البطاقة التي تنهال عليها الدفعات الصامتة: يبقى APNs يردّ
-- 200 على كل دفعة، والجهاز لا يسحب البطاقة أبداً -- بلا رسالةٍ ولا
-- سجلّ، ولا سبيل إلى فكّه إلا بحذف البطاقة وإعادة إضافتها. وحدودُه
-- غير منشورة، فلا يُعرف متى يقع إلا بعد وقوعه.
--
-- وقد وقع فعلاً: خللٌ في مكنسة الدفع أعاد البطاقة نفسها إلى الطابور
-- كل دقيقتين ساعاتٍ طويلة. أُصلح الخلل، وهذا سياجٌ حوله: أرضيةُ دقيقة
-- بين دفعتين للزبون الواحد.
--
-- ودقيقةٌ لا تُؤخّر شيئاً حقيقياً: شراءان لزبونٍ واحد في دقيقة نادر،
-- والثاني يلحق في الدورة التالية على كل حال.
create or replace function wallet_push_pending(p_limit int default 200)
returns table (customer_id bigint, push_token text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select distinct on (r.push_token, c.id) c.id, r.push_token, c.wallet_pass_updated_at
  from customers c
  join wallet_pass_registrations r on r.customer_id = c.id
  where (c.wallet_pass_pushed_at is null
         or c.wallet_pass_updated_at > c.wallet_pass_pushed_at)
    and (c.wallet_pass_pushed_at is null
         or c.wallet_pass_pushed_at < now() - interval '60 seconds')
  order by r.push_token, c.id, c.wallet_pass_updated_at desc
  limit p_limit;
$$;
revoke all on function wallet_push_pending(int) from public, anon, authenticated;

create or replace function wallet_push_pending_business(p_business_id bigint, p_limit int default 200)
returns table (customer_id bigint, push_token text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select distinct on (r.push_token, c.id) c.id, r.push_token, c.wallet_pass_updated_at
  from customers c
  join wallet_pass_registrations r on r.customer_id = c.id
  where c.business_id = p_business_id
    and (c.wallet_pass_pushed_at is null
         or c.wallet_pass_updated_at > c.wallet_pass_pushed_at)
    and (c.wallet_pass_pushed_at is null
         or c.wallet_pass_pushed_at < now() - interval '60 seconds')
  order by r.push_token, c.id, c.wallet_pass_updated_at desc
  limit p_limit;
$$;
revoke all on function wallet_push_pending_business(bigint, int) from public, anon, authenticated;
