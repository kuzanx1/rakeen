"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// «عرض خاص»: رسالة واتساب وتصميم باسم المحل اللي نكلمه (عماد أو صرح).
// التصميم خلفية جاهزة (public/dashboard/offers/offer-*.jpg، 2160x2700) فيها
// مكان فاضي للاسم، والاسم ينرسم هنا على canvas بنفس خط البوستر.
// المولّد: scratchpad mk/make.cjs، ومكان الاسم يطلع منه (SLOT).

type OfferPlan = "emad" | "sarh";
const SCALE = 2;
const SLOT = { x: 60, y: 160, w: 960, h: 132 }; // بإحداثيات 1080x1350، بدون الحشوة السفلية
const FONT = "RkOfferDisplay";
const SIGNUP = "https://rakeenapp.com/signup";
const CONTACT = "055 701 5282";

const PLAN_INFO: Record<OfferPlan, { name: string; monthly: string; annual: string; points: string[] }> = {
  emad: {
    name: "عماد",
    monthly: "179",
    annual: "1,790",
    points: [
      "📦 المخزون: ينبهك قبل ما يخلص، وينقص لحاله مع كل بيعة",
      "💰 الأرباح: تكلفة كل صنف وصافي ربحك قدامك كل يوم",
      "❤️ الولاء: الزبون ياخذ بطاقة في محفظة جواله ويرجع لك",
      "🛵 التوصيل: تشوف كم أخذت كل منصة من كل طلب",
      "🔔 بيجر ركين: جوال الزبون يرن لما يجهز طلبه، بدل أجهزة النداء",
      "👥 الموظفين: صلاحيات ووثائق وتنبيه قبل انتهاء الإقامة",
      "🧾 فاتورة ضريبية برمز QR متوافقة مع هيئة الزكاة والضريبة (المرحلة الأولى)، والعمل بدون نت، وتقارير كاملة",
    ],
  },
  sarh: {
    name: "صرح",
    monthly: "279",
    annual: "2,790",
    points: [
      "🛍️ متجرك الإلكتروني: الزبون يطلب منك مباشرة، بدون عمولة",
      "📱 المنيو الأونلاين: على تابلت الكاشير وبجوال الزبون من باركود الطاولة",
      "🏪 الفروع: كل فروعك وتقاريرها من لوحة وحدة",
      "📦 المخزون: ينبهك قبل ما يخلص، وينقص لحاله مع كل بيعة",
      "💰 الأرباح: تكلفة كل صنف وصافي ربحك قدامك كل يوم",
      "🔔 بيجر ركين: جوال الزبون يرن لما يجهز طلبه، بدل أجهزة النداء",
      "👥 الموظفين: صلاحيات ووثائق وتنبيه قبل انتهاء الإقامة",
      "❤️ الولاء: الزبون ياخذ بطاقة في محفظة جواله ويرجع لك",
      "🧾 فاتورة ضريبية برمز QR متوافقة مع هيئة الزكاة والضريبة (المرحلة الأولى)، والعمل بدون نت، وتقارير كاملة",
    ],
  },
};

function buildMessage(plan: OfferPlan, shop: string, person: string): string {
  const p = PLAN_INFO[plan];
  const hi = person.trim() ? `السلام عليكم يا ${person.trim()} 👋` : "السلام عليكم 👋";
  return [
    hi,
    "",
    `جهّزنا لـ«${shop.trim() || "محلكم"}» عرض خاص من ركين ✨`,
    "",
    "✅ ميزات أكثر  ✅ سعر أقل  ✅ جودة أعلى",
    "",
    "بدل ما يكون عندك نظام للكاشير، ونظام للولاء، ونظام للمحاسبة، ونظام للمخزون، وكل واحد باشتراك وحوسة… ركين يجمعها كلها في نظام واحد وبسعر طيب.",
    "",
    `غيرنا على نفس هالميزات يوصل لأكثر من 1,200 ريال بالشهر.`,
    `ركين: كاشير ولوحة تحكم كاملة بـ ${p.monthly} ريال بالشهر فقط (باقة ${p.name})، أو ${p.annual} بالسنة وشهرين مجاناً.`,
    "",
    "وش يحل لك:",
    ...p.points,
    "",
    "وهذي بعضها بس 👆 الباقة فيها أكثر من 25 ميزة.",
    "",
    "📱 يشتغل على كل الأجهزة: آيفون وآيباد، وأندرويد، وأجهزة SUNMI، والكمبيوتر.",
    "",
    "والأهم: ابدأ تجربتك المجانية اليوم 🎁",
    "تجهز خلال 5 دقايق، وأول 350 طلب بكل المزايا مجاناً. بدون بطاقة وما تدفع ولا ريال. جرّب وتطمّن، وبعدها قرّر.",
    "",
    `ابدأ من هنا: ${SIGNUP}`,
    `ولو مهتم وتبي نشرح لك، كلّمنا: ${CONTACT}`,
    "",
    "إحنا شركاء نجاح معك، مو مجرد نظام 🤝",
  ].join("\n");
}

function waNumber(raw: string): string | null {
  const d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (/^05\d{8}$/.test(d)) return "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "966" + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^00\d{9,14}$/.test(d)) return d.slice(2);
  return null;
}

let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  if (!fontReady) {
    const face = new FontFace(FONT, "url(/fonts/thmanyah-serif-display/thmanyahserifdisplay-Black.woff2)");
    fontReady = face.load().then((f) => { document.fonts.add(f); });
  }
  return fontReady;
}
const bgCache: Partial<Record<OfferPlan, Promise<ImageBitmap>>> = {};
function loadBg(plan: OfferPlan): Promise<ImageBitmap> {
  return (bgCache[plan] ??= fetch(`/dashboard/offers/offer-${plan}.jpg`).then((r) => r.blob()).then((b) => createImageBitmap(b)));
}

async function drawPoster(canvas: HTMLCanvasElement, plan: OfferPlan, shop: string) {
  const [bg] = await Promise.all([loadBg(plan), loadFont()]);
  canvas.width = bg.width;
  canvas.height = bg.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bg, 0, 0);
  const name = shop.trim();
  if (!name) return;
  const maxW = SLOT.w * SCALE * 0.94;
  let size = 96 * SCALE;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#171717";
  for (; size > 40 * SCALE; size -= 4) {
    ctx.font = `${size}px ${FONT}`;
    if (ctx.measureText(name).width <= maxW) break;
  }
  ctx.fillText(name, (SLOT.x + SLOT.w / 2) * SCALE, (SLOT.y + SLOT.h / 2) * SCALE);
}

const S = {
  card: { background: "var(--card, #fff)", border: "1px solid rgba(17,17,17,.1)", borderRadius: "14px", padding: "16px", marginBottom: "14px" } as React.CSSProperties,
  label: { fontSize: "13px", fontWeight: 800, marginBottom: "6px", display: "block" } as React.CSSProperties,
  input: { width: "100%", border: "1px solid rgba(17,17,17,.18)", borderRadius: "10px", padding: "10px 12px", fontSize: "14px", fontFamily: "inherit", background: "transparent", color: "inherit", boxSizing: "border-box" } as React.CSSProperties,
  muted: { fontSize: "12px", color: "#6B6B6B", fontWeight: 600 } as React.CSSProperties,
  chip: { border: "1px solid rgba(17,17,17,.18)", background: "transparent", borderRadius: "999px", padding: "7px 16px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "inherit" } as React.CSSProperties,
  chipOn: { background: "#111", color: "#C4FF2B", borderColor: "#111" } as React.CSSProperties,
  btn: { background: "#111", color: "#C4FF2B", border: 0, borderRadius: "10px", padding: "10px 16px", fontSize: "13px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" } as React.CSSProperties,
  ghost: { background: "transparent", color: "inherit", border: "1px solid rgba(17,17,17,.2)", borderRadius: "10px", padding: "9px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" } as React.CSSProperties,
};

export default function OfferPanel() {
  const [plan, setPlan] = useState<OfferPlan>("emad");
  const [shop, setShop] = useState("");
  const [person, setPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [edited, setEdited] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [drawErr, setDrawErr] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const auto = useMemo(() => buildMessage(plan, shop, person), [plan, shop, person]);
  useEffect(() => { if (!edited) setMsg(auto); }, [auto, edited]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let live = true;
    const t = setTimeout(() => {
      drawPoster(c, plan, shop).then(() => live && setDrawErr(false), () => live && setDrawErr(true));
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [plan, shop]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 2500); };
  const pngBlob = () => new Promise<Blob>((ok, no) => canvasRef.current!.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));

  const copyText = async () => {
    try { await navigator.clipboard.writeText(msg); flash("نسخت الرسالة"); } catch { flash("ما قدرت أنسخ، انسخها يدوي"); }
  };
  // التصميم ينسخ أول وبعدين ينفتح واتساب: لو انفتح التبويب قبل، الصفحة تفقد
  // التركيز والمتصفح يرفض الكتابة للحافظة.
  const copyImage = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob() })]); flash("نسخت التصميم، الصقه في واتساب بـ Ctrl+V"); return true; }
    catch { flash("المتصفح رفض نسخ الصورة، نزّلها بدلها"); return false; }
  };
  const download = () => {
    canvasRef.current!.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `ركين-عرض-${(shop.trim() || "خاص").replace(/[\\/:*?"<>|]+/g, "")}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/jpeg", 0.92);
  };
  const wa = waNumber(phone);
  const openWa = async () => {
    if (!wa) return;
    await copyImage();
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: "17px", fontWeight: 900, marginBottom: "4px" }}>عرض خاص باسم المحل</div>
        <div style={S.muted}>اكتب اسم المقهى أو المطعم اللي بتكلمه، ويطلع لك تصميم باسمه ورسالة جاهزة للواتساب.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px", alignItems: "start" }}>
        <div style={S.card}>
          <span style={S.label}>الباقة</span>
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            {(["emad", "sarh"] as OfferPlan[]).map((p) => (
              <button key={p} type="button" style={{ ...S.chip, ...(plan === p ? S.chipOn : {}) }} onClick={() => setPlan(p)}>
                {PLAN_INFO[p].name} · {PLAN_INFO[p].monthly} ر.س بالشهر
              </button>
            ))}
          </div>
          <label style={S.label} htmlFor="of-shop">اسم المقهى أو المطعم</label>
          <input id="of-shop" style={{ ...S.input, marginBottom: "12px" }} value={shop} onChange={(e) => setShop(e.target.value)} placeholder="مثلاً: قهوة الحي" maxLength={40} />
          <label style={S.label} htmlFor="of-person">اسم صاحبه (اختياري)</label>
          <input id="of-person" style={{ ...S.input, marginBottom: "12px" }} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="مثلاً: أبو فيصل" maxLength={30} />
          <label style={S.label} htmlFor="of-phone">رقم الواتساب (اختياري)</label>
          <input id="of-phone" style={{ ...S.input, marginBottom: "14px", direction: "ltr", textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" inputMode="tel" />

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
            <span style={S.label}>الرسالة</span>
            {edited && <button type="button" style={{ ...S.ghost, padding: "4px 10px", fontSize: "12px" }} onClick={() => setEdited(false)}>رجّع النص الأصلي</button>}
          </div>
          <textarea style={{ ...S.input, minHeight: "300px", lineHeight: 1.7, resize: "vertical" }} value={msg} onChange={(e) => { setEdited(true); setMsg(e.target.value); }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
            <button type="button" style={S.btn} onClick={copyText}>انسخ الرسالة</button>
            <button type="button" style={S.ghost} onClick={copyImage} disabled={!shop.trim()}>انسخ التصميم</button>
            <button type="button" style={S.ghost} onClick={download} disabled={!shop.trim()}>نزّل التصميم</button>
            {wa && <button type="button" style={S.btn} onClick={openWa} disabled={!shop.trim()}>انسخ التصميم وافتح واتساب</button>}
          </div>
          {note && <div style={{ ...S.muted, marginTop: "10px", color: "#4C7A00" }}>{note}</div>}
          <div style={{ ...S.muted, marginTop: "10px" }}>واتساب يفتح والرسالة جاهزة. الصق التصميم بـ Ctrl+V، وبعدها اضغط إرسال.</div>
        </div>

        <div style={S.card}>
          <span style={S.label}>التصميم</span>
          {!shop.trim() && <div style={{ ...S.muted, marginBottom: "8px" }}>اكتب اسم المحل ويطلع مكانه في التصميم.</div>}
          {drawErr && <div style={{ ...S.muted, color: "#C0392B", marginBottom: "8px" }}>ما قدرت أحمّل التصميم، حدّث الصفحة.</div>}
          <canvas ref={canvasRef} style={{ width: "100%", maxWidth: "460px", height: "auto", aspectRatio: "4 / 5", borderRadius: "14px", boxShadow: "0 10px 30px rgba(17,17,17,.18)", display: "block", background: "#F6F4EC" }} />
        </div>
      </div>
    </div>
  );
}
