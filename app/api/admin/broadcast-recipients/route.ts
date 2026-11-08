import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requiresStepUp } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// «رسائل واتساب» في لوحة الأدمن: قائمة المشتركين وأرقامهم. الإرسال نفسه ما
// يمرّ من هنا أبداً -- الأدمن يضغط «إرسال» وينفتح واتساب ويب عنده والرسالة
// جاهزة، ويرسلها بيده. لا API ولا برنامج يرسل باسم الرقم (ميتا تحظر الرقم
// لو أرسل جماعياً ببرنامج من واتساب ويب)، ولا كلفة على الرسالة.
//
// الرقم من أوثق مصدر عندنا:
//   1) whatsapp_link_phone -- رقم المالك اللي ربطه وأكّده بكود (الأوثق)
//   2) رقم الجوال اللي كتبه المالك وقت التسجيل (user_metadata.phone)
//   3) واتساب التواصل المكتوب في المتجر الإلكتروني (online_contact_whatsapp)

function isAdminEmail(email: string | undefined | null): boolean {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

/** رقم سعودي (أو دولي) بصيغة واتساب: أرقام فقط بمفتاح الدولة، 9665XXXXXXXX. */
function waNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (!d) return null;
  if (/^05\d{8}$/.test(d)) return "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "966" + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^009665\d{8}$/.test(d)) return d.slice(2);
  if (/^00\d{9,14}$/.test(d)) return d.slice(2);
  if (/^[1-9]\d{9,14}$/.test(d) && !d.startsWith("0")) return d;
  return null;
}

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
  if (!(await checkRateLimit(request, "RL_ADMIN_GENERAL", caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!(await checkDbRateLimit(admin, request, "RL_ADMIN_GENERAL", 60, 60, caller.email || undefined))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const { data: businesses, error } = await admin
    .from("businesses")
    .select("id, name, plan_tier, is_active, created_at, whatsapp_link_phone, whatsapp_link_verified, online_contact_whatsapp")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("broadcast recipients: query failed", error);
    return NextResponse.json({ error: "تعذر التحميل" }, { status: 500 });
  }

  const { data: owners } = await admin.from("profiles").select("id, business_id, full_name").eq("user_type", "owner");
  const ownerByBiz = new Map<number, { id: string; full_name: string | null }>();
  (owners || []).forEach((o) => { if (!ownerByBiz.has(o.business_id)) ownerByBiz.set(o.business_id, o); });

  // جوال التسجيل محفوظ في بيانات حساب المالك، لا في جدول.
  const signupPhone = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error: uErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (uErr || !data?.users?.length) break;
    data.users.forEach((u) => {
      const p = (u.user_metadata as { phone?: string } | null)?.phone;
      if (p) signupPhone.set(u.id, p);
    });
    if (data.users.length < 200) break;
  }

  const recipients = (businesses || []).map((b) => {
    const owner = ownerByBiz.get(b.id);
    const candidates: [string | null, string][] = [
      [b.whatsapp_link_verified ? waNumber(b.whatsapp_link_phone) : null, "واتساب المالك المؤكّد"],
      [owner ? waNumber(signupPhone.get(owner.id)) : null, "جوال التسجيل"],
      [waNumber(b.online_contact_whatsapp), "واتساب المتجر"],
    ];
    const hit = candidates.find(([n]) => n);
    return {
      id: b.id,
      name: b.name,
      owner: owner?.full_name || null,
      plan: b.plan_tier || null,
      active: b.is_active !== false,
      phone: hit ? hit[0] : null,
      source: hit ? hit[1] : null,
    };
  });

  return NextResponse.json({ recipients });
}
