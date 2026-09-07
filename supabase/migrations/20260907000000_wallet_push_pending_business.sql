-- ما ينتظر الدفع في منشأةٍ بعينها.
--
-- المكنسة تأخذ الطابور كلَّه لأنها تمرّ على الجميع. وحفظُ التصميم يدفع
-- الآن فوراً -- ولا يحقّ له أن يرى بطاقات غير منشأته، ولا أن يعلّمها
-- مدفوعةً وهي لم تُدفع.
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
  order by r.push_token, c.id, c.wallet_pass_updated_at desc
  limit p_limit;
$$;

revoke all on function wallet_push_pending_business(bigint, int) from public, anon, authenticated;
