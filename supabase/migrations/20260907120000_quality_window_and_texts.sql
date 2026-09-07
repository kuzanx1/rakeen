-- نافذةُ سؤال الجودة تتّسع إلى يومٍ كامل.
--
-- كانت من "بعد المدّة" إلى "ضِعفها" -- ساعةٌ إلى ساعتين حين تُضبط
-- بساعة. والقصدُ كان ألّا يُسأل عن زيارةٍ نسيها، لكنّ الأثر أسوأ:
-- طلبٌ عمره ثلاث ساعات يقع خارج النافذة، فلا يُسأل صاحبُه أبداً --
-- والمكنسة تمرّ عليه وتتجاوزه بصمت.
--
-- والحدُّ الحقيقي ليس النافذة، إنما wallet_quality_asked_at: لا يُسأل
-- عن زيارةٍ مرّتين. فتتّسع النافذة إلى أربعٍ وعشرين ساعة -- ما فات
-- يومَه لا يُسأل عنه، وما دونه يُسأل مرّةً واحدة.
create or replace function wallet_quality_targets()
returns table (customer_id bigint, msg text)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, b.wallet_msg_quality_text
  from customers c
  join businesses b on b.id = c.business_id
  where b.wallet_msg_quality_on = true
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = c.id)
    and exists (
      select 1 from orders o
      where o.customer_id = c.id and o.status = 'completed'
        and o.created_at < now() - make_interval(hours => b.wallet_msg_quality_hours)
        and o.created_at > now() - interval '24 hours'
        and (c.wallet_quality_asked_at is null or c.wallet_quality_asked_at < o.created_at)
    )
  limit 500;
$$;
revoke all on function wallet_quality_targets() from public, anon, authenticated;
