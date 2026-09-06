import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/wallet-service";

/**
 * "اعرض باركود الولاء على شاشة العميل."
 *
 * يناديه الكاشير بعد إتمام الطلب. والمسار يفعل ثلاثة: ينشئ رمزاً
 * يُصرف مرة، ويجد شاشة هذا الفرع، ويبثّ إليها ما تعرضه.
 *
 * والصلاحية تُفحص بجلسة الكاشير نفسها لا بمفتاح خدمة: create_wallet_add_token
 * تشترط pos:register وتقرأ المنشأة من الجلسة، فلا يُنشئ أحدٌ رمزاً
 * لزبون منشأةٍ أخرى ولو عرف رقمه.
 *
 * والبثّ بمفتاح الخدمة: القناة مشتقّة من سرّ الشاشة، وذلك السرّ لا
 * يُسلَّم للمتصفح -- ولو سُلّم لصار كل كاشير قادراً على العرض على أي
 * شاشة في أي فرع.
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  let customerId: number | null = null;
  let branchId: number | null = null;
  try {
    const body = (await request.json()) as { customerId?: number; branchId?: number };
    customerId = Number(body?.customerId) || null;
    branchId = Number(body?.branchId) || null;
  } catch { /* جسمٌ ناقص */ }
  if (!customerId) return NextResponse.json({ error: "لا يوجد عميل" }, { status: 400 });

  // بجلسة الكاشير: هي التي تحمل منشأته وصلاحيته.
  const asCashier = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  // الشاشة أولاً: لا يُنشأ رمزٌ لن يُعرض على شيء.
  let q = asCashier.from("display_devices").select("id, device_secret, branch_id");
  if (branchId) q = q.eq("branch_id", branchId);
  const { data: displays } = await q.limit(1);
  const display = displays?.[0];
  if (!display) {
    return NextResponse.json(
      { error: "ما فيه شاشة عميل مقترنة بهذا الفرع. اقترنها أولاً من لوحة التحكم." },
      { status: 409 },
    );
  }

  const { data: addToken, error: mkErr } = await asCashier.rpc("create_wallet_add_token", {
    p_customer_id: customerId,
    p_display_device_id: display.id,
  });
  if (mkErr || !addToken) {
    return NextResponse.json({ error: "تعذر إنشاء الباركود" }, { status: 403 });
  }

  const { data: biz } = await asCashier
    .from("businesses")
    .select("display_barcode_message")
    .limit(1)
    .maybeSingle();

  const origin = new URL(request.url).origin;
  await admin
    .channel(`display-secret:${display.device_secret}`)
    .send({
      type: "broadcast",
      event: "show_barcode",
      payload: {
        url: `${origin}/api/wallet/add/${addToken}`,
        message: biz?.display_barcode_message || undefined,
      },
    });

  // الرمز لا يُردّ إلى المتصفح: من ملكه ملك البطاقة، والكاشير لا يحتاجه
  // -- هو يعرضه لا يستعمله.
  return NextResponse.json({ ok: true });
}
