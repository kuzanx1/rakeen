-- بيجر ركين صار ميزةً في باقتي «عماد» و«صرح» (قرار المالك 2026-11-08).
--
-- ثلاثة أشياء، والملف يُعاد تشغيله بأمان:
--   1) rk_plan_features: «pager» يدخل عماد وصرح (نفس lib/plans.ts --
--      tools/accounting-checks/plans-matrix-sync.cjs يرسب لو اختلفا).
--   2) rk_businesses_guard: سقفٌ جديد -- باقةٌ بلا بيجر تُطفئ pager_enabled،
--      فكاشير التطبيق والويب يقرآنه مطفأً بلا أي تعديل فيهما.
--      (نفس الدالة كما في 20261015120000 حرفياً + سطر البيجر.)
--   3) إعادة حساب allowed_features لكل مطعمٍ عليه باقة.
-- مطعمٌ بلا باقة (plan_tier فارغ) = كل شيء مسموح، ولا يتغيّر.

set lock_timeout = '4s';

create or replace function rk_plan_features(p_plan text)
returns text[]
language sql
immutable
as $fn$
  select case p_plan
    when 'asas' then array['pos','zatca_invoice','offline','shift_close']
    when 'emad' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps','pager']
    when 'sarh' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps','pager',
                           'online_store','booking_page','multi_branch']
  end;
$fn$;

create or replace function rk_businesses_guard()
returns trigger
language plpgsql
as $fn$
declare
  v_allowed text[];
  v_key text;
  v_val jsonb;
begin
  -- 1) admin-only columns: an end user's session can't change them
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.verification_status     := old.verification_status;
    new.is_active               := old.is_active;
    new.online_subscribed       := old.online_subscribed;
    new.online_order_free_limit := old.online_order_free_limit;
    new.online_order_free_count := old.online_order_free_count;
    new.subscription_expires_at := old.subscription_expires_at;
    new.branch_limit            := old.branch_limit;
    new.included_seats          := old.included_seats;
    new.kitchen_display_enabled := old.kitchen_display_enabled;
    new.inventory_enabled       := old.inventory_enabled;
    new.admin_notes             := old.admin_notes;
    new.plan_tier               := old.plan_tier;
    new.feature_overrides       := old.feature_overrides;
  end if;

  -- 2) allowed features = plan + the admin's overrides
  if new.plan_tier is null then
    new.allowed_features := null;
    return new;
  end if;

  v_allowed := rk_plan_features(new.plan_tier);
  for v_key, v_val in select key, value from jsonb_each(coalesce(new.feature_overrides, '{}'::jsonb)) loop
    if v_val = 'true'::jsonb and not (v_key = any(v_allowed)) then
      v_allowed := v_allowed || v_key;
    elsif v_val = 'false'::jsonb then
      v_allowed := array_remove(v_allowed, v_key);
    end if;
  end loop;
  new.allowed_features := v_allowed;

  -- 3) the ceiling
  if not ('kds' = any(v_allowed)) then new.kitchen_display_enabled := false; end if;
  if not ('inventory' = any(v_allowed)) then new.inventory_enabled := false; end if;
  if not ('loyalty' = any(v_allowed)) then new.loyalty_enabled := false; end if;
  if not ('online_store' = any(v_allowed)) then new.online_ordering_enabled := false; end if;
  if not ('booking_page' = any(v_allowed)) then new.online_booking_enabled := false; end if;
  if not ('tables_reservations' = any(v_allowed)) then new.tables_reservations_enabled := false; end if;
  if not ('pager' = any(v_allowed)) then new.pager_enabled := false; end if;

  return new;
end;
$fn$;

-- 3) كل مطعمٍ عليه باقة: الـtrigger يعيد حساب مزاياه بالمصفوفة الجديدة.
set lock_timeout = '4s';
update businesses set plan_tier = plan_tier where plan_tier is not null;
