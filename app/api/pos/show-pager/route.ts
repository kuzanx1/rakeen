import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";
import { displayTargets } from "@/lib/display-targets";
import { pagerUrl } from "@/lib/pager";

/**
 * بيجر ركين على شاشة العميل (شاشة ركين على تابلت أو تلفزيون).
 *
 * الكاشيرُ يناديه بعد إتمام الطلب، فيظهر «بيجر طلبك» بباركوده على شاشات
 * هذا الفرع ونقطة البيع -- نفسُ ترشيح باركود الولاء (lib/display-targets).
 * ولو كان باركودُ الولاء ظاهراً ظهرا جنباً إلى جنب.
 *
 * وhide: يُنادى حين يبدأ الكاشيرُ الطلبَ التالي، لمن اختار «لين يبدأ
 * الطلب اللي بعده».
 *
 * وشاشةُ سنمي المدمجة لا تمرّ من هنا: التطبيقُ يرسمها محلّياً بلا شبكة.
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let uuid = "";
  let number = "";
  let branchId: number | null = null;
  let posDeviceId: string | null = null;
  let secs = 60;
  let hide = false;
  try {
    const b = (await request.json()) as {
      uuid?: string; number?: string | number; branchId?: number; posDeviceId?: string; secs?: number; hide?: boolean;
    };
    uuid = typeof b?.uuid === "string" ? b.uuid : "";
    number = String(b?.number ?? "").slice(0, 12);
    branchId = Number(b?.branchId) || null;
    posDeviceId = typeof b?.posDeviceId === "string" ? b.posDeviceId : null;
    secs = Math.max(0, Math.min(300, Math.round(Number(b?.secs ?? 60))));
    hide = b?.hide === true;
  } catch { /* جسمٌ ناقص */ }

  const url = hide ? null : pagerUrl(uuid);
  if (!hide && !url) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });

  const asCashier = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await asCashier.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  // display_devices تحت RLS المنشأة: لا يرى كاشيرٌ شاشاتِ غيره.
  const targets = await displayTargets(asCashier, branchId, posDeviceId);
  if (!targets.length) return NextResponse.json({ ok: true, shown: 0 });

  const event = hide ? "hide_pager" : "show_pager";
  const payload = hide ? {} : { url, number, secs };
  await Promise.all(targets.map(d =>
    admin.channel(`display-secret:${d.device_secret}`)
      .send({ type: "broadcast", event, payload })
      .catch(err => console.error(`display ${d.id} pager broadcast failed`, err)),
  ));
  return NextResponse.json({ ok: true, shown: targets.length });
}
