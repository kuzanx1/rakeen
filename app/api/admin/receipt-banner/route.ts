import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";

/**
 * الشريطُ الوطنيّ على الفواتير: تشغيلٌ وإطفاءٌ لكلِّ المطاعم دفعةً واحدة.
 *
 * وقيمةٌ واحدةٌ في platform_settings، لا عمودٌ في كلِّ منشأة: المناسبةُ
 * واحدةٌ للجميع، وإطفاؤها يجب أن يكون ضغطةً لا تحديثاً على ألفِ صفّ.
 *
 * ولا يصل الأجهزةَ ببناءٍ ولا بنشر: الكاشيران يقرآنه مع هويّة الفاتورة
 * (rk_receipt_banner)، فيختفي من الورقة التالية بعد تحديثِ الهويّة عندهما.
 */
const KINDS = ["none", "shield", "plain", "invert"] as const;
type Kind = (typeof KINDS)[number];

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

async function gate(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { err: NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 }) };
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { err: NextResponse.json({ error: "غير مصرّح" }, { status: 401 }) };

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await asCaller.auth.getUser(token);
  if (error || !user || !isAdminEmail(user.email)) {
    return { err: NextResponse.json({ error: "غير مصرّح" }, { status: 403 }) };
  }
  if (requiresStepUp(token)) {
    return { err: NextResponse.json({ error: "يلزم التحقق بخطوتين (MFA) لهذا الحساب" }, { status: 401 }) };
  }
  return { admin: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }), email: user.email };
}

export async function GET(request: NextRequest) {
  const g = await gate(request);
  if (g.err) return g.err;
  const { data, error } = await g.admin!
    .from("platform_settings").select("value, updated_at, updated_by").eq("key", "receipt_banner").maybeSingle();
  if (error) {
    const missing = /relation .*platform_settings.* does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json(
      { error: missing ? "شغّل الترحيل 20261125140000 أولاً" : error.message, kind: "none" },
      { status: missing ? 409 : 500 },
    );
  }
  const raw = (data?.value as { kind?: string } | null)?.kind;
  const kind: Kind = (KINDS as readonly string[]).includes(raw || "") ? (raw as Kind) : "none";
  return NextResponse.json({ kind, updatedAt: data?.updated_at ?? null, updatedBy: data?.updated_by ?? null });
}

export async function POST(request: NextRequest) {
  const g = await gate(request);
  if (g.err) return g.err;

  let kind = "";
  try {
    const b = (await request.json()) as { kind?: string };
    kind = typeof b?.kind === "string" ? b.kind : "";
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "تصميم غير معروف" }, { status: 400 });
  }

  const { error } = await g.admin!.from("platform_settings").upsert(
    { key: "receipt_banner", value: { kind }, updated_at: new Date().toISOString(), updated_by: g.email || "admin" },
    { onConflict: "key" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // تُقرأ القيمةُ المستقرّة لا التي أُرسلت: «تم الحفظ» على مجرّد عدم
  // رمي خطأٍ أبقى هبية على قالبٍ لم يختره أحد أياماً (انظر لوحة التحكّم).
  const { data } = await g.admin!.from("platform_settings").select("value").eq("key", "receipt_banner").maybeSingle();
  const stored = (data?.value as { kind?: string } | null)?.kind || "none";
  if (stored !== kind) return NextResponse.json({ error: "لم تُحفظ القيمة", kind: stored }, { status: 500 });
  return NextResponse.json({ ok: true, kind: stored });
}
