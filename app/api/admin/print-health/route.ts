import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";

/**
 * صحّةُ الطباعة عبر كلِّ المطاعم -- للوحة ركين.
 *
 * الغرضُ سطرٌ واحد: «طابعةُ فلانٍ تمشي ٤٨ ك.ب/ث، وطابعةُ فلانٍ انقطع
 * عليها الإرسالُ ثلاثَ مرّاتٍ أمس». وذلك يُغني عن مكالمةٍ وصورةِ شاشة.
 *
 * والمعدّلُ يُحسب هنا من المجاميع لا يُقرأ: المعدّلُ لا يُجمَع، فحفظُه
 * في الصفِّ كان سيُفسده عند كلِّ دفعة.
 *
 * ونفسُ بوّابةِ /api/admin/usage: قائمةُ البريد المسموح + تحقّقٌ
 * بخطوتين، وتحقّقٌ مستقلٌّ في الخادم لا يعتمد على الواجهة.
 */
function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

type Row = {
  business_id: number;
  branch_id: number | null;
  day: string;
  device_label: string;
  printer_key: string;
  transport_kind: string;
  app_version: string;
  client: string;
  jobs_ok: number;
  jobs_failed: number;
  truncations: number;
  paced: boolean;
  transport_ms_sum: number;
  transport_ms_max: number;
  bytes_sum: number;
  last_error: string | null;
  last_at: string;
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller || !isAdminEmail(caller.email)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  if (requiresStepUp(token)) {
    return NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 });
  }

  const days = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("print_health_daily")
    .select("business_id, branch_id, day, device_label, printer_key, transport_kind, app_version, client, jobs_ok, jobs_failed, truncations, paced, transport_ms_sum, transport_ms_max, bytes_sum, last_error, last_at")
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(2000);

  if (error) {
    // الجدولُ غير موجودٍ بعد (الترحيلُ لم يُشغَّل): يُقال صريحاً بدل
    // لوحةٍ فارغةٍ تُقرأ كأنّ كلَّ الطابعات بخير.
    const missing = /relation .*print_health_daily.* does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json(
      { error: missing ? "جدول print_health_daily غير موجود — شغّل الترحيل 20261125090000" : error.message, rows: [] },
      { status: missing ? 409 : 500 },
    );
  }

  const rows = (data || []) as Row[];
  const businessIds = [...new Set(rows.map((r) => r.business_id))];
  const names = new Map<number, string>();
  if (businessIds.length) {
    const { data: bs } = await admin.from("businesses").select("id, name").in("id", businessIds);
    for (const b of (bs || []) as Array<{ id: number; name: string | null }>) {
      names.set(b.id, b.name || `#${b.id}`);
    }
  }

  const out = rows.map((r) => {
    const jobs = r.jobs_ok + r.jobs_failed;
    // بايتاتٌ على زمنٍ = سرعةُ الكابل فعلاً. وهذا هو الرقمُ الذي كان
    // ينقصنا، وبسببِ غيابه خُمّنت التهدئةُ ثلاثَ مرّاتٍ خطأً.
    const kbPerSecond = r.transport_ms_sum > 0 ? (r.bytes_sum / 1024) / (r.transport_ms_sum / 1000) : null;
    return {
      day: r.day,
      business: names.get(r.business_id) || `#${r.business_id}`,
      businessId: r.business_id,
      branchId: r.branch_id,
      device: r.device_label,
      printer: r.printer_key,
      transportKind: r.transport_kind,
      client: r.client,
      appVersion: r.app_version,
      jobs,
      jobsFailed: r.jobs_failed,
      truncations: r.truncations,
      paced: r.paced,
      kbPerSecond: kbPerSecond == null ? null : Math.round(kbPerSecond * 10) / 10,
      avgMs: jobs > 0 && r.jobs_ok > 0 ? Math.round(r.transport_ms_sum / r.jobs_ok) : null,
      maxMs: r.transport_ms_max,
      lastError: r.last_error,
      lastAt: r.last_at,
      // ما يستحقّ نظرةً: انقطاعٌ، أو إخفاقٌ، أو طابعةٌ هدّأت نفسَها.
      trouble: r.truncations > 0 || r.paced || r.jobs_failed > 0,
    };
  });

  // المتعبةُ أوّلاً، ثم الأحدث: اللوحةُ تُقرأ من فوق، وما يهمّ أعلاها.
  out.sort((a, b) => (Number(b.trouble) - Number(a.trouble)) || b.day.localeCompare(a.day));

  return NextResponse.json({ rows: out, days });
}
