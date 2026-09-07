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
  let posDeviceId: string | null = null;
  try {
    const body = (await request.json()) as {
      customerId?: number; branchId?: number; posDeviceId?: string;
    };
    customerId = Number(body?.customerId) || null;
    branchId = Number(body?.branchId) || null;
    posDeviceId = typeof body?.posDeviceId === "string" ? body.posDeviceId : null;
  } catch { /* جسمٌ ناقص */ }
  if (!customerId) return NextResponse.json({ error: "لا يوجد عميل" }, { status: 400 });

  // بجلسة الكاشير: هي التي تحمل منشأته وصلاحيته.
  const asCashier = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: "الخدمة غير متاحة" }, { status: 503 });

  /**
   * الشاشة أولاً: لا يُنشأ رمزٌ لن يُعرض على شيء.
   *
   * وشاشةٌ بلا فرع تخدم الفروع كلها. فالمالك يُنشئ اقترانه من لوحة
   * التحكم بلا أن يُسأل عن فرع -- ومقهىً بفرع واحد لا معنى لسؤاله --
   * فكان الكاشير يُخبَر أن لا شاشة مقترنة وهي مقترنة أمامه.
   *
   * والأولوية لشاشة الفرع حين توجد: فرعان لكلٍّ شاشته لا تُخلط
   * باركوداتهما.
   */
  const { data: displays } = await asCashier
    .from("display_devices")
    .select("id, device_secret, branch_id, pos_device_id");

  /**
   * وكلُّ شاشات الفرع تُعرض عليها، لا أوّلها.
   *
   * كان يُختار واحدٌ ويُبثّ إليه وحده -- فمطعمٌ له شاشتان عند مساري
   * الطلب يعرض الباركود على إحداهما، والزبون واقفٌ عند الأخرى ينتظر
   * ما لا يجيء. والكاشير يرى "تم العرض" فيعيد ويعيد.
   *
   * وحصرُ الفرع يبقى: فرعان لكلٍّ شاشاته، ولا يُخلط باركود هذا بذاك.
   */
  /**
   * الفرعُ أولاً، ثم نقطةُ البيع -- ولا سقوطَ إلى "كلِّ الشاشات".
   *
   * كان الترشيح يسقط، حين لا يُطابق شيء، إلى بثِّ الباركود على كل شاشةٍ
   * في المشروع. وbranch_id لم يكن يُملأ عند الإنشاء أصلاً -- فالسقوطُ
   * هو الحالةُ الدائمة: مقهىً بفرعين يعرض باركود زبونٍ هنا على شاشةٍ
   * هناك، ويقف زبونُ الفرع الآخر أمام باركودٍ ليس له فيمسحه.
   *
   * وليس عرضاً في غير محلّه وحسب: من مسحه أخذ بطاقةَ غيره -- الرمزُ
   * يُصرف مرّةً واحدة، فيضيع على صاحبه.
   *
   * والفرعُ وحده لا يكفي: فرعٌ بثلاث نقاطِ بيعٍ وثلاثِ شاشات يبثّ إلى
   * الثلاث، فيرى ثلاثةُ زبائن باركوداً واحداً.
   *
   * فالترتيب:
   *   ١) شاشاتُ هذا الفرع (وما لم يُنسب لفرعٍ بعد -- شاشاتُ ما قبل
   *      اليوم، لئلا تسكت فجأةً على مطعمٍ يعمل).
   *   ٢) منها: المربوطةُ بنقطة البيع هذي إن وُجدت، وإلا غيرُ المربوطة.
   *      وشاشةٌ مربوطةٌ بنقطةِ بيعٍ أخرى لا تُبثّ إليها أبداً.
   */
  const all = displays || [];
  const inBranch = branchId
    ? all.filter(d => d.branch_id === branchId || d.branch_id == null)
    : all.filter(d => d.branch_id == null);

  const mine = posDeviceId ? inBranch.filter(d => d.pos_device_id === posDeviceId) : [];
  const targets = mine.length
    ? mine
    : inBranch.filter(d => d.pos_device_id == null);

  const display = targets[0];
  if (!display) {
    return NextResponse.json(
      { error: "ما فيه شاشة عميل مقترنة بهذا الفرع. اقترنها أولاً من لوحة التحكم." },
      { status: 409 },
    );
  }

  const { data: made, error: mkErr } = await asCashier.rpc("create_wallet_add_token", {
    p_customer_id: customerId,
    p_display_device_id: display.id,
  });
  const addToken = (made as { token?: string } | null)?.token;
  const posSession = (made as { posSession?: string } | null)?.posSession;
  if (mkErr || !addToken) {
    /**
     * ويُقال أيّ الأسباب الثلاثة.
     *
     * "تعذر إنشاء الباركود" جملةٌ تصف ما حدث ولا تقول شيئاً عمّا يُفعل:
     * الكاشير يعيد الضغط، وصاحب المطعم يتّصل، ولا أحد يعرف أن الجهاز
     * دخل بحساب مالكٍ لا بحساب كاشير -- وهو أشيع الأسباب.
     */
    const reason = (made as { error?: string } | null)?.error;
    const says: Record<string, string> = {
      no_business: "الجهاز مو مربوط بمطعم. أعد إقران الجهاز من لوحة التحكم.",
      no_permission:
        "هذا الحساب ما عنده صلاحية الكاشير. سجّل دخول بحساب كاشير (PIN) مو بحساب المالك.",
      customer_not_found: "هذا العميل مو مسجّل عندك.",
    };
    return NextResponse.json(
      { error: (reason && says[reason]) || "تعذر إنشاء الباركود — راجع اقتران الجهاز." },
      { status: 403 },
    );
  }

  const { data: biz } = await asCashier
    .from("businesses")
    .select("display_barcode_message")
    .limit(1)
    .maybeSingle();

  const origin = new URL(request.url).origin;
  const payload = {
    url: `${origin}/api/wallet/add/${addToken}`,
    message: biz?.display_barcode_message || undefined,
  };
  // ولا تُنتظر واحدةً بعد واحدة: شاشةٌ بطيئة لا تؤخّر التي بجانبها،
  // والكاشير ينتظر الردّ ليكمل طلبه.
  await Promise.all(targets.map(d =>
    admin.channel(`display-secret:${d.device_secret}`)
      .send({ type: "broadcast", event: "show_barcode", payload })
      .catch(err => console.error(`display ${d.id} broadcast failed`, err)),
  ));
  console.log(`show-barcode: عُرض على ${targets.length} شاشة`);

  // الرمز لا يُردّ إلى المتصفح: من ملكه ملك البطاقة، والكاشير لا يحتاجه
  // -- هو يعرضه لا يستعمله. ويُردّ معرّف الجلسة وحده: قناةٌ يسمع بها
  // نتيجة عرضه هو، ولا تُغني عن الرمز ولا تكشفه.
  return NextResponse.json({ ok: true, posSession });
}
