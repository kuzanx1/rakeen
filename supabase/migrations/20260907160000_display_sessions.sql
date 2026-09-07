-- جلساتُ شاشة العميل: من فتح الرابط، ومن أين، ومتى.
--
-- رمزُ الشاشة مفتاحٌ حامل: من قرأه من شريط العنوان أو ورثه من سجلّ
-- تصفّحٍ أو أُرسل إليه، عنده ما عند الشاشة. والتخمينُ بعيد -- ثمانيةٌ
-- من أحدٍ وثلاثين -- لكنّ التسريب ليس تخميناً، وهو الطريق الحقيقيّ.
--
-- ولا يُمنع ما لا يُرى: المالك اليوم لا يعرف كم جهازاً يفتح رابطه ولا
-- من أين. فيُسجَّل كلُّ جهازٍ يفتحه -- بصمتُه وعنوانُه ووصفُ متصفّحه --
-- ويُعرض في لوحته كما تعرض تيليقرام ووتساب أجهزةَ الحساب.
--
-- والرؤيةُ وحدها تكفي لأكثر الحالات: جهازٌ غريبٌ في القائمة يُقرأ فوراً،
-- وعندها يُفكّ الاقتران فيموت الرابط ومعه كلُّ من يحمله.

create table if not exists display_device_sessions (
  id bigserial primary key,
  device_id bigint not null references display_devices(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  /**
   * بصمةٌ يولّدها الجهاز ويحفظها.
   *
   * ولا يُميَّز بالعنوان: مقهىً وراء راوتر واحد يعطي أجهزتَه كلَّها
   * عنواناً واحداً، فتُقرأ ثلاثُ شاشاتٍ جهازاً واحداً. والبصمةُ تفصلها.
   * وهي ليست إثباتاً -- تُنسخ كما يُنسخ الرمز -- إنما تفصل الحالة
   * الغالبة: أجهزةً مختلفة تُستعمل معاً.
   */
  client_id text not null,
  ip text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  /** كم مرّةً فُتحت الصفحة من هذا الجهاز -- تكرارٌ يُقرأ استعمالاً. */
  hits integer not null default 1,
  unique (device_id, client_id)
);

create index if not exists display_sessions_business
  on display_device_sessions(business_id, last_seen_at desc);

alter table display_device_sessions enable row level security;

-- تُقرأ من اللوحة، ولا تُكتب منها: الكتابةُ من الخادم بمفتاح الخدمة،
-- فلا يستطيع من يحمل الرمز أن يمحوَ أثرَه.
drop policy if exists display_sessions_read on display_device_sessions;
create policy display_sessions_read on display_device_sessions
  for select using (business_id = current_business_id());

drop policy if exists display_sessions_owner_delete on display_device_sessions;
create policy display_sessions_owner_delete on display_device_sessions
  for delete using (business_id = current_business_id() and has_permission('settings:edit'));

/**
 * يُسجَّل الفتح -- أو يُحدَّث إن كان الجهازُ معروفاً.
 *
 * security definer ومفتاحُ الخدمة وحده يناديها من نقطة الخدمة: العنوان
 * يُقرأ من ترويسة الطلب هناك، والمتصفّح لا يعرف عنوانَ نفسه ولا يُؤتمن
 * عليه لو عرفه.
 */
create or replace function record_display_session(
  p_secret text,
  p_client_id text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rec$
declare
  v_device_id bigint;
  v_business_id bigint;
  v_known boolean;
begin
  select id, business_id into v_device_id, v_business_id
  from display_devices where device_secret = p_secret;
  if v_device_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_device');
  end if;

  select exists (
    select 1 from display_device_sessions
    where device_id = v_device_id and client_id = p_client_id
  ) into v_known;

  insert into display_device_sessions (device_id, business_id, client_id, ip, user_agent)
  values (v_device_id, v_business_id, p_client_id, left(p_ip, 60), left(p_user_agent, 300))
  on conflict (device_id, client_id) do update
    set last_seen_at = now(),
        hits = display_device_sessions.hits + 1,
        -- ويُحدَّث العنوان: الشبكاتُ المنزلية تُبدّل عناوينها، وعنوانٌ
        -- قديمٌ يُقرأ جهازاً في مكانٍ لم يعد فيه.
        ip = coalesce(left(p_ip, 60), display_device_sessions.ip),
        user_agent = coalesce(left(p_user_agent, 300), display_device_sessions.user_agent);

  -- ويُقال للوحة إن كان جديداً: جهازٌ يُفتح أوّلَ مرّة هو الخبرُ الذي
  -- يستحقّ أن يُرى، لا الذي يُفتح كلَّ صباح منذ شهر.
  return jsonb_build_object('ok', true, 'isNew', not v_known);
end;
$rec$;

revoke all on function record_display_session(text, text, text, text) from public, anon, authenticated;
