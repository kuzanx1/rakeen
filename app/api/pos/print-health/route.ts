import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";

/**
 * صحّةُ الطباعة تصلنا من الجهاز، فلا نطلب من العميل صورةَ شاشة.
 *
 * مسارٌ واحدٌ يناديه العميلان -- تطبيقُ الكاشير وكاشيرُ الويب -- كما
 * يفعل show-loyalty-barcode. فأيُّ إصلاحٍ هنا يصل الاثنين، ولا تفترق
 * أرقامُهما.
 *
 * والجسمُ دفعةٌ مجموعةٌ لا فاتورةٌ واحدة: الجهازُ يجمع عندَه ثمّ يرسل
 * عند حدثٍ (انقطاعٌ، إغلاقُ وردية، كلُّ خمسٍ وعشرين ورقة). لا مؤقّت،
 * ولا صفٌّ لكلِّ فاتورة.
 *
 * ولا يُؤتمن الجهازُ على هويّة منشأته: الرقمُ يُقرأ من ملفِّ المستخدم
 * تحت RLS بجلسته هو، ثمّ يُكتب بمفتاح الخدمة. فكاشيرٌ لا يكتب أرقامَ
 * مطعمٍ آخر ولو أرسل رقمَه.
 *
 * وفشلُ هذا المسار لا يعني شيئاً للكاشير: الورقةُ طُبعت، وهذا قياسٌ
 * بعدها. فيردّ ok دائماً ما لم تكن الجلسةُ نفسُها باطلة.
 */

/** ما نقبله في الدفعة الواحدة. الأعدادُ تُقصّ لا تُرفض: دفعةٌ فيها رقمٌ
 *  سخيفٌ لا تُسقط بقيّةَ الأرقام الصحيحة معها. */
const MAX_PRINTERS = 8;
const clampInt = (v: unknown, hi: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, hi);
};

type Row = {
  printerKey?: string;
  transportKind?: string;
  jobsOk?: number;
  jobsFailed?: number;
  truncations?: number;
  paced?: boolean;
  transportMsSum?: number;
  transportMsMax?: number;
  bytesSum?: number;
  lastError?: string | null;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let branchId: number | null = null;
  let day = "";
  let deviceLabel = "";
  let appVersion = "";
  let client = "";
  let rows: Row[] = [];
  try {
    const b = (await request.json()) as {
      branchId?: number; day?: string; deviceLabel?: string; appVersion?: string;
      client?: string; printers?: Row[];
    };
    branchId = Number(b?.branchId) || null;
    day = typeof b?.day === "string" ? b.day : "";
    deviceLabel = typeof b?.deviceLabel === "string" ? b.deviceLabel.slice(0, 80) : "";
    appVersion = typeof b?.appVersion === "string" ? b.appVersion.slice(0, 20) : "";
    client = b?.client === "web" ? "web" : b?.client === "app" ? "app" : "";
    rows = Array.isArray(b?.printers) ? b.printers.slice(0, MAX_PRINTERS) : [];
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  // يومُ العمل كما أرسله الجهاز، بشكلٍ صحيحٍ أو لا شيء.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  if (!rows.length) return NextResponse.json({ ok: true, written: 0 });

  const asCashier = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await asCashier.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });

  // هويّةُ المنشأة من ملفِّ المستخدم تحت RLS، لا من جسم الطلب.
  const { data: profile } = await asCashier
    .from("profiles").select("business_id").eq("id", user.id).single();
  const businessId = Number(profile?.business_id) || null;
  if (!businessId) return NextResponse.json({ ok: true, written: 0 });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  let written = 0;
  for (const r of rows) {
    const printerKey = typeof r?.printerKey === "string" ? r.printerKey.slice(0, 80) : "";
    const kind = r?.transportKind === "usb" || r?.transportKind === "network" || r?.transportKind === "bluetooth"
      ? r.transportKind : "";
    const { error } = await admin.rpc("record_print_health", {
      p_business_id: businessId,
      p_branch_id: branchId,
      p_day: day,
      p_device_label: deviceLabel,
      p_printer_key: printerKey,
      p_transport_kind: kind,
      p_app_version: appVersion,
      p_client: client,
      p_jobs_ok: clampInt(r?.jobsOk, 5000),
      p_jobs_failed: clampInt(r?.jobsFailed, 5000),
      p_truncations: clampInt(r?.truncations, 5000),
      p_paced: r?.paced === true,
      p_transport_ms_sum: clampInt(r?.transportMsSum, 86_400_000),
      p_transport_ms_max: clampInt(r?.transportMsMax, 600_000),
      p_bytes_sum: clampInt(r?.bytesSum, 2_000_000_000),
      p_last_error: typeof r?.lastError === "string" ? r.lastError.slice(0, 200) : null,
    });
    if (!error) written++;
  }

  return NextResponse.json({ ok: true, written });
}
