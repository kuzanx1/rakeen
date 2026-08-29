-- verify_pos_manager_pin() checks a 4-digit PIN (10,000 possibilities) with
-- no rate limit at all. It's gated behind has_permission('pos:register'), so
-- this isn't reachable by a fully anonymous caller — but it IS an insider
-- threat: any logged-in cashier could script repeated RPC calls and brute
-- force the manager-approval PIN in well under the 10,000-guess space,
-- self-granting the "manager present" gate the POS uses in front of
-- sensitive actions (shift close, discount overrides, etc. — see
-- public/pos/rakeen-pos.js openPinModal call sites). Same fix shape as
-- every other rate-limited RPC in this system: check_rate_limit() keyed per
-- caller (auth.uid()), so one cashier being throttled doesn't affect anyone
-- else's device.

create or replace function public.verify_pos_manager_pin(p_pin text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if not check_rate_limit('verify_manager_pin:' || auth.uid(), 10, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  select pos_manager_pin_hash into v_hash from businesses where id = current_business_id();
  if v_hash is null then
    return null;
  end if;
  return v_hash = extensions.crypt(p_pin, v_hash);
end;
$function$;
