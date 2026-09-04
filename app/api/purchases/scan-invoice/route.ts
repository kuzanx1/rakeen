import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkDbRateLimit } from "@/lib/dbRateLimit";

// Reads a purchase invoice with Gemini (free tier — Flash model, no card
// required) and returns the itemized line items, supplier, and total as
// structured JSON. The ZATCA QR scan (client-side, no AI) already covers
// the invoice-level total reliably; this covers what the QR code physically
// cannot — the actual product list.
//
// Two tiers share this one route, chosen by which form field the caller
// sends: `ocrText` (Step 6, cheap — no image, no image tokens, the escalation
// target when the client's local OCR+parser can't self-validate an invoice)
// or `image` (the original, most expensive tier — full vision call, reserved
// for when even the text-only pass can't produce trustworthy items, e.g. a
// handwritten order slip with no usable OCR text at all).
//
// Model choice: gemini-flash-lite-latest (currently resolves to Gemini 3.5
// Flash-Lite, $0.30/$2.50 per 1M input/output tokens) — chosen over
// gemini-flash-latest (Gemini 3.6 Flash, $1.50/$7.50, ~4x more expensive)
// after direct side-by-side testing against two real invoices with known-
// correct answers (including the exact case that was previously wrong: a
// "2 PCs × 5kg" rice line that a worse prompt/model combo once computed as
// 60kg instead of 10kg) — Flash-Lite got both exactly right, cleanly, with
// no JSON corruption. gemini-2.5-flash and gemini-2.5-flash-lite were also
// tried and are NOT usable on this project (404 "no longer available to
// new users") — don't reintroduce them without checking availability
// first. Keep GEMINI_USD_PER_1M_INPUT_TOKENS/OUTPUT_TOKENS in
// rakeen-dashboard.js in sync with whatever model this resolves to if it
// ever changes — that constant is the ONLY other place this pricing is
// duplicated, and drifting the two apart is exactly the bug that silently
// under-reported real cost by ~15x before this fix.
const GEMINI_MODEL_ID = "gemini-flash-lite-latest";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING", nullable: true },
    invoiceDate: { type: "STRING", nullable: true },
    invoiceNumber: { type: "STRING", nullable: true },
    invoiceType: { type: "STRING", nullable: true },
    grandTotal: { type: "NUMBER", nullable: true },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          baseIngredient: { type: "STRING" },
          packageQty: { type: "NUMBER", nullable: true },
          unitsPerPackage: { type: "NUMBER", nullable: true },
          contentPerUnit: { type: "NUMBER", nullable: true },
          unit: { type: "STRING", nullable: true },
          lineTotal: { type: "NUMBER", nullable: true },
        },
        required: ["name", "baseIngredient"],
      },
    },
  },
  required: ["items"],
};

// Shared extraction rules — kept in one place so PROMPT_VISION and
// PROMPT_TEXT (the text-only fallback, Step 6) never drift apart on the
// package-math logic, which took several rounds of real-invoice testing to
// get right and must behave identically regardless of which tier reads it.
const EXTRACTION_RULES = `- supplierName: اسم المورد أو المتجر البائع
- invoiceDate: تاريخ الفاتورة إن وجد (صيغة YYYY-MM-DD)
- invoiceNumber: رقم الفاتورة المطبوع (رقم تسلسلي/مرجعي للفاتورة نفسها، وليس رقم صنف أو باركود) إن وجد
- invoiceType: صنّف الفاتورة لأحد ثلاث قيم فقط بناءً على شكلها الظاهري: "tax_invoice" إن ظهر اسم/رقم ضريبي للمشتري بالإضافة لبيانات البائع الضريبية كاملة، "simplified_tax_invoice" إن ظهر رمز QR أو رقم ضريبي للبائع فقط بدون بيانات مشترٍ (الحالة الأشيع بفواتير المحلات)، "non_tax_invoice" إن ما ظهر أي رقم ضريبي أو تفصيل ضريبة إطلاقًا. اتركه فارغ (null) لو غير واضح
- grandTotal: إجمالي الفاتورة شامل الضريبة (آخر رقم إجمالي بأسفل الفاتورة)
- items: قائمة بكل صنف مشترى في الفاتورة، كل صنف يحتوي:
  - name: النص الكامل للصنف كما هو مكتوب حرفيًا بالفاتورة (بالعلامة التجارية وحجم العبوة إن وجدت) — **بدون** رقم الباركود أو كود الصنف (الأرقام الطويلة المطبوعة بعمود منفصل مثل "غرقم الصنف/Item Code"، أو أرقام متسلسلة طويلة (10+ رقم) ملاصقة للاسم) — هذي أرقام تعريف داخلية للمتجر، مو جزء من اسم المنتج، ولا تفيد بشي هنا
  - baseIngredient: اسم المكوّن الأساسي فقط، بدون اسم العلامة التجارية أو حجم العبوة أو أي رقم باركود/كود صنف — لكن **حافظ على الفرق لو المنتج نوع مختلف فعليًا وليس مجرد علامة تجارية مختلفة لنفس الشيء**. مثال: "دجاج ساديا 2 كيلو" → baseIngredient: "دجاج" (ساديا مجرد علامة تجارية لنفس المكوّن). لكن "طماطم مقشرة معلبة" ≠ "طماطم طازجة" — هذان مكوّنان مختلفان فعليًا (مختلفان بالسعر والاستخدام وطريقة التخزين)، فلا تدمجهما، اكتب baseIngredient الصحيح لكل منهما منفصل مثل "طماطم مقشرة معلبة" و"طماطم طازجة". نفس المبدأ ينطبق على النوع/المنطقة لو كانت فعليًا تميّز صنف مختلف بالسعر أو الاستخدام (مثال: "بيبار هندي" و"بيبار قصيد" بنفس الفاتورة هما نوعان مختلفان فعليًا لهما سعر مختلف — لا تدمجهما بصيغة عامة "بيبار"، حافظ على الكلمة المميزة بكل واحد منفصل)
  - unit: وحدة القياس الأساسية الفعلية للمكوّن (كجم، جرام، لتر، حبة فقط) — أبدًا لا تكتب اسم العبوة نفسها (تنك/كرتون/علبة ليست وحدة قياس)
  - **حساب الكمية الحقيقية — هذا أهم جزء وأكثر جزء تحدث فيه أخطاء، اتبع هذا بدقة تامة:**
    فواتير المشتريات عادة فيها ٣ مستويات: (تنقرأ من عمود "الكمية"، وعمود "عبوة" إن وجد، وحجم الوحدة الواحدة المكتوب باسم الصنف نفسه)
    1. packageQty: الرقم في عمود "الكمية" — كم عبوة/كرتون/تنك تم شراؤه (مثال: 1)
    2. unitsPerPackage: الرقم في عمود "عبوة" إن وجد — كم وحدة فرعية (علبة/كيس/قطعة) داخل كل عبوة مشتراة (مثال: كرتون فيه 24 علبة → 24). إذا ماكو عمود "عبوة" أو الصنف يُشترى مباشرة بدون تعبئة فرعية (مثل خضار توزن بالكيلو مباشرة)، اجعلها 1
    3. contentPerUnit: حجم الوحدة الفرعية الواحدة **بوحدة القياس الأساسية نفسها** (كجم أو جرام أو لتر أو حبة فقط — الأربعة المذكورة بأعلى)، وعادة مكتوب داخل اسم الصنف نفسه. إذا الصنف يُشترى مباشرة بدون تعبئة (خضار موزونة بالكيلو مباشرة، الكمية نفسها بالكيلو) اجعلها 1
    **تحويل الوحدات الفرعية إجباري — لا تنسخ الرقم كما هو لو وحدته مختلفة عن الأربعة الأساسية:**
    إذا كان حجم الوحدة مكتوب بمليلتر (ملل/مل)، حوّله للتر بالقسمة على 1000 قبل ما تكتب contentPerUnit (مثال: "340 ملل" → contentPerUnit=0.34 وليس 340، والوحدة unit="liter"). نفس الشي لو مكتوب بالمليجرام (مجم) حوّله للجرام بالقسمة على 1000. ولو مكتوب بالطن حوّله للكيلوجرام بالضرب في 1000. **لا يجوز أبدًا أن يكون contentPerUnit برقم كبير غير منطقي زي 340 أو 500 مع unit="liter" أو "kg" — هذا معناه نسيت التحويل.**
    أمثلة كاملة محلولة:
    * "طماطم مقشرة علب 400 جم" — الكمية=1 كرتون، عبوة=24 (24 علبة بالكرتون)، كل علبة 400 جم (وحدة أساسية مسبقًا) → packageQty=1, unitsPerPackage=24, contentPerUnit=400, unit="g"
    * "صدور دجاج طرية ساديا 2 كيلو" — الكمية=1 كرتون، عبوة=5 (5 أكياس بالكرتون)، كل كيس 2 كيلو → packageQty=1, unitsPerPackage=5, contentPerUnit=2, unit="kg"
    * "زيت العربي تنك 17 لتر" — الكمية=1 تنك، ماكو عبوة فرعية (التنك نفسه هو الوحدة)، حجمه 17 لتر → packageQty=1, unitsPerPackage=1, contentPerUnit=17, unit="liter"
    * "دبس رمان لادورا 24×340 ملل" — الكمية=1 كرتون، عبوة=24 (24 عبوة بالكرتون)، كل عبوة 340 **ملل** — هذي مليلتر فلازم تتحول للتر أولاً: 340÷1000=0.34 → packageQty=1, unitsPerPackage=24, contentPerUnit=0.34, unit="liter" (النتيجة النهائية 1×24×0.34=8.16 لتر، مو 8160)
    * "بصل ابيض" موزون بالكيلو مباشرة بدون عبوة، الكمية=.585 كجم → packageQty=0.585, unitsPerPackage=1, contentPerUnit=1, unit="kg"
    **قاعدة حاسمة لمنع مضاعفة الكمية بالخطأ: عمود "الوحدة" (Unit) المطبوع بالفاتورة نفسه يخبرك عن طبيعة كل رقم بعمود "الكمية" — اعتمد عليه دائمًا قبل ما تستخدم أي رقم إضافي من اسم الصنف:**
    - إذا كانت الوحدة المطبوعة بالفاتورة وحدة فردية نهائية جاهزة للاستهلاك (قطعة/كيس/حبة/PC/PCS/EA) — فهذا يعني كل رقم بعمود "الكمية" هو عدد الوحدات الفردية الفعلي المُشترى مباشرة، فـ unitsPerPackage=1 **دائمًا** بغض النظر عن أي رقم آخر مكتوب باسم الصنف، وcontentPerUnit = حجم الوحدة الفردية الواحدة فقط (وليس أي رقم أكبر يصف كرتون الجملة الكامل بمستودع المورد).
    - فقط إذا كانت الوحدة المطبوعة بالفاتورة كرتون/صندوق/تنك (عبوة جملة تحتوي عدة وحدات فرعية) — عندها استخدم رقم العبوات الفرعية المكتوب باسم الصنف كـ unitsPerPackage.
    - مثال محلول (خطأ حقيقي حدث فعلًا يجب تجنبه): فاتورة تظهر الصنف "أرز صنوايت (6*5kg)" بعمود الكمية=2 وعمود الوحدة="PCs". بما أن الوحدة PCs (قطعة فردية وليست كرتون)، فكل قطعة = كيس واحد سعة 5 كجم فقط — رقم "6" باسم الصنف يصف حجم كرتون الجملة الكامل بمستودع المورد وليس له علاقة بهذا الشراء. الصح: packageQty=2, unitsPerPackage=1, contentPerUnit=5, unit="kg" (الإجمالي 10 كجم). **الخطأ الشائع** اللي لازم تتجنبه: packageQty=2 × unitsPerPackage=6 × contentPerUnit=5 = 60 كجم — هذا غلط لأنه ضرب برقم "6" رغم إن عمود الوحدة نفسه يقول PCs مو كرتون. تأكيد إضافي مفيد: سعر الوحدة الظاهر بالفاتورة (35 ريال) يتناسب منطقيًا مع سعر كيس مفرد 5 كجم أرز، وليس كرتون كامل فيه 6 أكياس (لو كانت كرتون كاملة لكان السعر أعلى بكثير من 35 ريال) — استخدم هذا كفحص منطقي إضافي عند الشك.
  - lineTotal: **السعر الإجمالي النهائي لهذا الصنف شامل الضريبة** — إذا كان بالفاتورة أكثر من عمود سعر (مثل "سعر الوحدة" و"الضريبة" و"القيمة")، خذ عمود "القيمة" أو "الإجمالي" النهائي (آخر عمود رقمي بالصف)، وليس سعر الوحدة المفرد. لا تترك هذا الحقل فارغًا إذا كان أي رقم إجمالي ظاهر بالصف — احسبه بنفسك من (السعر × الكمية) لو احتجت`;

const PROMPT_VISION = `اقرأ صورة فاتورة المشتريات هذه بعناية واستخرج البيانات التالية بصيغة JSON فقط، بدون أي نص إضافي:
${EXTRACTION_RULES}

لا تخترع بيانات غير موجودة بالصورة — إذا حقل غير واضح فعلاً اتركه فارغ (null).`;

// Text-only fallback (Step 6): reads OCR output instead of the raw image —
// no inline_data means no image tokens, which is the entire cost win of
// this tier over PROMPT_VISION. The OCR text comes from the client's local
// Tesseract pass (already reading-order-corrected from word bounding
// boxes — see rakeen-dashboard.js), so this is a second attempt at the
// same invoice using an LLM's language understanding to resolve the
// ambiguity the deterministic parser couldn't, before ever paying for a
// vision call.
const PROMPT_TEXT = `هذا نص مستخرج آليًا (OCR) من صورة فاتورة مشتريات — وليس صورة، فما عندك وصول للتخطيط البصري أو الألوان. النص قد يحتوي أخطاء قراءة حرفية شائعة في هذا النوع من الفواتير (أرقام مقروءة خطأ، فاصلة عشرية ساقطة مثل "1150" بدل "11.50"، تشابه حروف عربية متجاورة) — استخدم السياق والمنطق الحسابي المعتاد للفواتير (مجموع الأصناف = الإجمالي، إلخ) لتصحيح أخطاء واضحة، لكن لا تخترع بيانات غير موجودة أصلاً بالنص. استخرج البيانات التالية بصيغة JSON فقط، بدون أي نص إضافي:
${EXTRACTION_RULES}

إذا حقل غير واضح فعلاً من النص اتركه فارغ (null) بدل التخمين.

نص الفاتورة (OCR):
`;

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "الخادم غير مهيأ" }, { status: 500 });
  }
  if (!geminiKey) {
    return NextResponse.json({ error: "ميزة القراءة بالذكاء الاصطناعي غير مفعّلة على هذا الخادم" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller) return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin.from("profiles").select("id, business_id, user_type").eq("id", caller.id).single();
  if (!profile) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 403 });

  if (!["owner", "manager"].includes(profile.user_type)) {
    // Purchases is now its own screen (mobile UX redesign) — accept either
    // key so nobody who already had accounting-level access loses invoice
    // scanning, while an employee freshly granted just screen:purchases
    // (no accounting) can use it too.
    const { data: perms } = await admin
      .from("user_permissions").select("permission_key").eq("user_id", profile.id).in("permission_key", ["screen:accounting", "screen:purchases"]);
    if (!perms || perms.length === 0) return NextResponse.json({ error: "ما عندك صلاحية على شاشة المشتريات" }, { status: 403 });
  }

  // Protects real Gemini API spend — this route bills per call regardless
  // of outcome, so an unbounded loop here is a direct cost-exhaustion vector,
  // not just a nuisance.
  if (!(await checkRateLimit(request, "RL_UPLOAD", String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }
  if (!(await checkDbRateLimit(admin, request, "RL_UPLOAD", 15, 60, String(profile.business_id)))) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  // See the identical comment in app/api/admin/businesses/[id]/branding/route.ts
  // — @types/node vs lib.dom FormData typing ambiguity, not a runtime issue.
  const formData = (await request.formData()) as { get(name: string): string | File | null };
  const file = formData.get("image");
  const ocrText = formData.get("ocrText");

  // Text-only tier (Step 6) takes priority when present: it's the cheap
  // escalation target the local parser falls back to before ever paying
  // for a vision call, so if the caller sent OCR text, skip the image
  // entirely — no inline_data means no image tokens billed.
  let contents: unknown;
  if (typeof ocrText === "string" && ocrText.trim()) {
    contents = [{ parts: [{ text: PROMPT_TEXT + ocrText }] }];
  } else {
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "الصورة أو نص الفاتورة ناقص" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم الصورة كبير جدًا (الحد الأقصى 8 ميجا)" }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";
    contents = [{ parts: [{ text: PROMPT_VISION }, { inline_data: { mime_type: mimeType, data: base64 } }] }];
  }

  try {
    // The free tier's per-minute rate limit is the single biggest reason
    // this pipeline was failing to save cost in production: telemetry
    // showed the cheap text-only tier repeatedly hitting a transient 429
    // and giving up immediately, forcing every one of those scans to
    // escalate straight to the far more expensive vision tier instead of
    // just waiting a couple seconds and trying the cheap tier again. One
    // retry after a short delay directly serves the cost-minimization
    // goal this whole pipeline exists for.
    const callGemini = () =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          // maxOutputTokens is a real safety net, not just a cost cap: tested
          // against genuinely ambiguous OCR text (dropped decimals, garbled
          // Arabic) and observed the model spiral into repetitive, degenerate
          // output — one real response hit 43k+ output tokens and produced
          // nonsense values like unitsPerPackage: 1e+84. The downstream
          // arithmetic-validation gate (Step 4) would reject a value like
          // that anyway, but there's no reason to pay for — or wait on — a
          // 40k-token response to find that out.
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 4096 },
        }),
      });

    let geminiResp = await callGemini();
    if (geminiResp.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      geminiResp = await callGemini();
    }
    if (!geminiResp.ok) {
      console.error("gemini error", geminiResp.status, await geminiResp.text().catch(() => ""));
      const rateLimited = geminiResp.status === 429;
      return NextResponse.json(
        {
          error: rateLimited ? "تجاوزت الحد المجاني المسموح لهذا اليوم، حاول لاحقًا" : "تعذرت قراءة الفاتورة",
          code: rateLimited ? "rate_limited" : "gemini_http_error",
        },
        { status: 502 }
      );
    }
    const geminiData = await geminiResp.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return NextResponse.json({ error: "ما قدرنا نقرأ محتوى واضح من الفاتورة", code: "no_content" }, { status: 422 });
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "تعذرت قراءة استجابة الذكاء الاصطناعي", code: "invalid_json" }, { status: 502 });
    }
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return NextResponse.json({ error: "ما قدرنا نميّز أي أصناف بالفاتورة", code: "no_items" }, { status: 422 });
    }
    // Invoices are usually 3 levels deep (packages bought × sub-units per
    // package × size of one sub-unit) — Gemini reports the raw breakdown,
    // the actual recipe-unit quantity is computed here, once, server-side,
    // so the client just ever sees a single correct `qty`.
    interface ScannedItem {
      packageQty?: number | null;
      unitsPerPackage?: number | null;
      contentPerUnit?: number | null;
      [key: string]: unknown;
    }
    parsed.items = (parsed.items as ScannedItem[]).map((item) => {
      const packageQty = item.packageQty;
      const unitsPerPackage = item.unitsPerPackage ?? 1;
      const contentPerUnit = item.contentPerUnit ?? 1;
      const qty = packageQty != null ? packageQty * unitsPerPackage * contentPerUnit : null;
      return { ...item, qty };
    });
    // exposed so the client can log real token counts to invoice_scan_events
    // instead of guessing — powers the AI-usage/cost metrics panel
    const usage = geminiData?.usageMetadata;
    parsed.usage = usage
      ? { promptTokens: usage.promptTokenCount, candidatesTokens: usage.candidatesTokenCount, totalTokens: usage.totalTokenCount }
      : null;
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "تعذرت قراءة الفاتورة، حاول مرة أخرى", code: "network_error" }, { status: 502 });
  }
}
