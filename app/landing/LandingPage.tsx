"use client";

/* الصفحة الرئيسية لـ rakeenapp.com.
   الأسعار والمزايا من lib/plans.ts مباشرة (نفس عرض السعر والعقد واللوحة)،
   فأي تعديل على الباقات يطلع هنا بدون ما يُكتب مرتين. */

import { useEffect, useRef, useState } from "react";
import { PLANS, type Plan, type PlanItem } from "@/lib/plans";
import "./rakeen-landing.css";

type Lang = "ar" | "en";
type Period = "monthly" | "annual";

const WA = "966557444227";
const waLink = (text: string) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const num = (n: number) => n.toLocaleString("en-US");

const IMG = "https://media.rakeenapp.com/menu-item-images/1/";
const DEMO = [
  { ar: "بوكس وسط مشكّل", en: "Mixed box M", price: 49, img: IMG + "37-1786203511961.png" },
  { ar: "بوكس كبير مشكّل", en: "Mixed box L", price: 99, img: IMG + "38-1786204226614.jpeg" },
  { ar: "بوكس رول مسخن", en: "Warm roll box", price: 49, img: IMG + "42-1786204272084.jpeg" },
  { ar: "صوص حامض", en: "Sour sauce", price: 2, img: IMG + "57-1786341048546.png" },
];
// Which demo items get "rung up", in order, in the hero's looping cashier.
const RING = [0, 3, 1, 3, 2];

/* ---------------- copy ---------------- */

const T = {
  ar: {
    nav: { features: "المزايا", plans: "الباقات", faq: "الأسئلة", login: "دخول", start: "ابدأ مجانًا" },
    hero: {
      pill: "جرّب ٣٥٠ طلب مجانًا",
      h1a: "لكل مطعم ناجح،",
      h1b: "رُكن",
      h1c: "يستند عليه.",
      sub: "كاشير يكمل بدون نت، ومطبخ، ومخزون، وأرباحك الصافية. كله بمكان واحد.",
      cta: "ابدأ مجانًا",
      cta2: "شوف الباقات",
      note: "بدون بطاقة بنكية · جاهز خلال دقائق",
    },
    pos: { title: "الطلب الحالي", total: "الإجمالي", pay: "ادفع", all: "الكل", empty: "اضغط منتج", cats: ["البوكسات", "الصوصات"] },
    float: { online: "طلب أونلاين #١٠٤٣", kitchen: "انطبع بالمطبخ", profit: "صافي اليوم" },
    strip: ["يكمل بدون إنترنت", "فاتورة ضريبية برمز QR", "آيباد وكمبيوتر وجوال", "دعم بالعربي على واتساب"],
    steps: {
      kicker: "تبدأ اليوم",
      title: "ثلاث خطوات وتبيع.",
      items: [
        { t: "سجّل مطعمك", d: "دقيقة وحدة، بدون بطاقة." },
        { t: "أضف منيوك", d: "الأصناف والأسعار والإضافات، وطابعتك." },
        { t: "ابدأ البيع", d: "من الآيباد أو أي متصفح." },
      ],
    },
    feat: {
      kicker: "المزايا",
      title: "كل اللي يحتاجه مطعمك. ولا شي زايد.",
      cards: {
        pos: { t: "كاشير سريع، ما يوقف", d: "تنقطع الشبكة؟ يكمل البيع ويرسل الطلبات أول ما ترجع." },
        kds: { t: "المطبخ يستلم لحظة الدفع", d: "على شاشة المطبخ أو طابعته." },
        inv: { t: "صوّر فاتورة المورد", d: "وتنحدّث الكميات، وينبّهك قبل ما يخلص صنف." },
        profit: { t: "صافي ربحك، مو تقدير", d: "من تكلفة وصفاتك الفعلية ومصاريفك." },
        loyalty: { t: "عميلك يرجع لك", d: "بطاقة ولاء بجواله، بدون تطبيق." },
        store: { t: "متجرك، بدون عمولة", d: "طلب مباشر بهويتك، ودفع بالبطاقة، وتتبّع." },
        delivery: { t: "تطبيقات التوصيل", d: "سعر كل تطبيق وعمولته بمكانها." },
      },
      offline: "بدون اتصال",
      saved: "انحفظ",
      inv: [
        { n: "دجاج", v: 82 },
        { n: "طماط", v: 64 },
        { n: "بصل", v: 18 },
      ],
      low: "قرب يخلص",
      profitRows: [
        { n: "المبيعات", v: 18240 },
        { n: "تكلفة الطعام", v: -5470 },
        { n: "المصاريف", v: -3760 },
      ],
      net: "صافي الربح",
      points: "نقطة",
      storeName: "متجرك",
      order: "اطلب الآن",
    },
    plans: {
      kicker: "الباقات",
      title: "باقات واضحة. بدون مفاجآت.",
      sub: "ابدأ بالتجربة المجانية، واختر باقتك لما تكون جاهز.",
      monthly: "شهري",
      annual: "سنوي",
      save: "شهرين مجانًا",
      perMonth: "شهريًا",
      perYear: "سنويًا",
      popular: "الأكثر طلبًا",
      branches: (n: number) => (n === 1 ? "فرع واحد" : n === 2 ? "فرعين" : `${n} فروع`),
      extra: (p: string, per: string) => `الفرع الإضافي ${p} ${per}`,
      everything: (name: string) => `كل اللي في ${name}، وفوقها:`,
      choose: "ابدأ تجربتك",
      quote: "اسألنا عن الباقة",
      waMsg: (name: string) => `السلام عليكم، أبي أعرف أكثر عن باقة ${name} في ركين`,
      trialT: "التجربة المجانية",
      trialD: "كل المزايا مفتوحة لين ٣٥٠ طلب من الكاشير والمتجر مع بعض. بعدها تختار باقتك.",
    },
    faq: {
      kicker: "الأسئلة",
      title: "أسئلة تتكرر.",
      items: [
        { q: "وش أحتاج عشان أبدأ؟", a: "آيباد أو كمبيوتر وإنترنت للتسجيل. الطابعة اختيارية: أي طابعة فواتير شبكية (Wi‑Fi أو LAN) تدعم ESC/POS." },
        { q: "لو انقطع النت؟", a: "الكاشير يكمل البيع ويحفظ الطلبات، ويرسلها لحاله أول ما يرجع الاتصال." },
        { q: "كيف التجربة المجانية؟", a: "كل المزايا مفتوحة لين ٣٥٠ طلب، الكاشير والمتجر مع بعض. لما توصل لها عندك يوم كامل تختار فيه باقتك." },
        { q: "أقدر أغيّر باقتي بعدين؟", a: "إيه، ترقّي أي وقت والمزايا تنفتح على طول." },
        { q: "عندي أكثر من فرع؟", a: "الفرع الإضافي بنص سعر الباقة، وباقة صرح فيها فرعين وتقارير لكل فرع." },
      ],
    },
    close: { title: "جاهز تبدأ؟", sub: "٣٥٠ طلب مجانًا. بدون بطاقة، وبدون التزام.", cta: "ابدأ مجانًا", wa: "كلّمنا واتساب" },
    footer: { tag: "نظام تشغيل مطعمك.", privacy: "الخصوصية", terms: "الشروط", rights: "© ٢٠٢٦ ركين" },
  },
  en: {
    nav: { features: "Features", plans: "Plans", faq: "FAQ", login: "Log in", start: "Start free" },
    hero: {
      pill: "Try 350 orders free",
      h1a: "Every great restaurant",
      h1b: "stands",
      h1c: "on something.",
      sub: "A cashier that keeps going offline, your kitchen, stock and real profit. All in one place.",
      cta: "Start free",
      cta2: "See plans",
      note: "No card needed · Ready in minutes",
    },
    pos: { title: "Current order", total: "Total", pay: "Pay", all: "All", empty: "Tap a product", cats: ["Boxes", "Sauces"] },
    float: { online: "Online order #1043", kitchen: "Printed in kitchen", profit: "Today's net" },
    strip: ["Works offline", "Tax invoice with QR", "iPad, computer and phone", "Arabic support on WhatsApp"],
    steps: {
      kicker: "Start today",
      title: "Three steps and you're selling.",
      items: [
        { t: "Sign up", d: "One minute, no card." },
        { t: "Add your menu", d: "Items, prices, add-ons and your printer." },
        { t: "Start selling", d: "From an iPad or any browser." },
      ],
    },
    feat: {
      kicker: "Features",
      title: "Everything your restaurant needs. Nothing it doesn't.",
      cards: {
        pos: { t: "A fast cashier that never stops", d: "Network down? Keep selling; orders sync when it's back." },
        kds: { t: "The kitchen gets it on payment", d: "On a kitchen screen or its printer." },
        inv: { t: "Snap the supplier invoice", d: "Stock updates, with a heads-up before anything runs out." },
        profit: { t: "Real net profit, not a guess", d: "From your actual recipe costs and expenses." },
        loyalty: { t: "Customers come back", d: "A loyalty card in their phone wallet, no app." },
        store: { t: "Your store, zero commission", d: "Direct orders in your brand, card payment, tracking." },
        delivery: { t: "Delivery apps", d: "Each app's price and commission, in place." },
      },
      offline: "Offline",
      saved: "Saved",
      inv: [
        { n: "Chicken", v: 82 },
        { n: "Tomato", v: 64 },
        { n: "Onion", v: 18 },
      ],
      low: "Running low",
      profitRows: [
        { n: "Sales", v: 18240 },
        { n: "Food cost", v: -5470 },
        { n: "Expenses", v: -3760 },
      ],
      net: "Net profit",
      points: "pts",
      storeName: "Your store",
      order: "Order now",
    },
    plans: {
      kicker: "Plans",
      title: "Clear plans. No surprises.",
      sub: "Start with the free trial, pick a plan when you're ready.",
      monthly: "Monthly",
      annual: "Yearly",
      save: "2 months free",
      perMonth: "/ month",
      perYear: "/ year",
      popular: "Most popular",
      branches: (n: number) => (n === 1 ? "1 branch" : `${n} branches`),
      extra: (p: string, per: string) => `Extra branch ${p} ${per}`,
      everything: (name: string) => `Everything in ${name}, plus:`,
      choose: "Start your trial",
      quote: "Ask us about it",
      waMsg: (name: string) => `Hi, I'd like to know more about the Rakeen ${name} plan`,
      trialT: "Free trial",
      trialD: "Every feature is open for 350 orders, cashier and store combined. Then pick your plan.",
    },
    faq: {
      kicker: "FAQ",
      title: "Common questions.",
      items: [
        { q: "What do I need to start?", a: "An iPad or computer and internet to sign up. A printer is optional: any network (Wi‑Fi or LAN) receipt printer that speaks ESC/POS." },
        { q: "What if the internet drops?", a: "The cashier keeps selling, saves the orders and sends them by itself once you're back online." },
        { q: "How does the free trial work?", a: "Every feature is open for 350 orders, cashier and store combined. When you reach it you get a full day to pick a plan." },
        { q: "Can I change plans later?", a: "Yes. Upgrade any time and the features open right away." },
        { q: "More than one branch?", a: "An extra branch is half the plan price; Sarh includes two branches with per-branch reports." },
      ],
    },
    close: { title: "Ready to start?", sub: "350 orders free. No card, no commitment.", cta: "Start free", wa: "WhatsApp us" },
    footer: { tag: "Your restaurant's operating system.", privacy: "Privacy", terms: "Terms", rights: "© 2026 Rakeen" },
  },
};

// English names for the package items (lib/plans.ts is Arabic only). An item
// missing here falls back to its Arabic text rather than disappearing.
const ITEM_EN: Record<string, string> = {
  "الكاشير": "Point of sale",
  "الفاتورة الضريبية": "Tax invoice with QR",
  "العمل بدون إنترنت": "Works offline",
  "إغلاق الوردية": "Shift close",
  "المنيو": "Menu management",
  "الطلبات والاسترجاع": "Orders and refunds",
  "التقرير اليومي": "Daily report",
  "الموظفين": "Staff with PIN",
  "شاشة المطبخ وطباعة المطبخ": "Kitchen screen and kitchen printing",
  "شاشة العميل: يشوف طلبه وباركود الولاء": "Customer display with loyalty barcode",
  "المخزون والوصفات وتنبيهات النقص والاستهلاك التلقائي": "Stock, recipes and low-stock alerts",
  "المشتريات، وقراءة فواتير الموردين بالتصوير": "Purchases and invoice scanning",
  "تكلفة كل منتج، وصافي الربح، والمصاريف والمحاسبة": "Product cost, net profit and accounting",
  "العملاء، وبرنامج الولاء، وبطاقة المحفظة": "Customers, loyalty and wallet card",
  "الطاولات والحجوزات وقائمة الانتظار": "Tables, reservations and waitlist",
  "تطبيقات التوصيل وحساب عمولاتها": "Delivery apps and commissions",
  "صلاحيات الموظفين وسجل العمليات": "Staff permissions and activity log",
  "التقارير الكاملة وتصدير Excel": "Full reports and Excel export",
  "المتجر الإلكتروني: طلب مباشر وتتبّع ودفع بالبطاقة، بدون عمولة": "Online store: direct orders, tracking, card payment, no commission",
  "صفحة حجز المواعيد للعملاء": "Appointment booking page",
  "إدارة الفروع وتقارير لكل فرع": "Multi-branch with per-branch reports",
  "دعم أولوية": "Priority support",
};
const PLAN_EN: Record<string, { name: string; tagline: string }> = {
  asas: { name: "Asas", tagline: "Sell, print and close your day" },
  emad: { name: "Emad", tagline: "Know what you earn, and bring customers back" },
  sarh: { name: "Sarh", tagline: "Direct orders, and room for more branches" },
};
// What each package card lists. أساس shows its short names (the full sentences
// belong in the quote); the others list what they add over the one below.
function planList(plan: Plan): string[] {
  const label = (i: PlanItem) => (plan.key === "asas" ? i.short || i.text : i.text);
  return [...new Set(plan.items.filter((i) => i.short !== "الإعدادات").map(label))];
}

/* ---------------- small pieces ---------------- */

// U+20C1, the official riyal sign. Only the self-hosted saudi_riyal font has
// it (see .riyal in the CSS); anywhere else it's a tofu box.
function Riyal() {
  return <span className="riyal" aria-label="SAR">{"⃁"}</span>;
}

type IconName = "check" | "wifi" | "qr" | "devices" | "chat" | "plus" | "arrow";
function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="ic" aria-hidden>
      {name === "check" && <path {...p} d="M5 12.5l4.5 4.5L19 7" />}
      {name === "wifi" && (
        <g {...p}>
          <path d="M3 4l18 16" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 4.2-2.5M14.8 10.3A10 10 0 0 1 19 12.8M2 9a15 15 0 0 1 5-3M17 6a15 15 0 0 1 5 3" />
        </g>
      )}
      {name === "qr" && (
        <g {...p}>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2" />
        </g>
      )}
      {name === "devices" && (
        <g {...p}>
          <rect x="2.5" y="5" width="13" height="10" rx="1.5" />
          <path d="M6 19h6" />
          <rect x="17" y="8" width="5" height="11" rx="1.2" />
        </g>
      )}
      {name === "chat" && <path {...p} d="M4 18.5l1.2-3.6A7.5 7.5 0 1 1 8.6 18L4 18.5Z" />}
      {name === "plus" && <path {...p} d="M12 5v14M5 12h14" />}
      {name === "arrow" && <path {...p} d="M19 12H5M11 6l-6 6 6 6" />}
    </svg>
  );
}

/* The hero's cashier rings up a few items on a loop, so the page shows the
   product working instead of describing it. */
function HeroCashier({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [lines, setLines] = useState<number[]>([]);
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLines([0, 3, 1]);
      return;
    }
    let step = 0;
    const id = window.setInterval(() => {
      step++;
      if (step <= RING.length) {
        setPaid(false);
        setLines(RING.slice(0, step));
      } else if (step === RING.length + 1) {
        setPaid(true);
      } else if (step >= RING.length + 3) {
        step = 0;
        setPaid(false);
        setLines([]);
      }
    }, 1100);
    return () => window.clearInterval(id);
  }, []);

  const counts = new Map<number, number>();
  lines.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1));
  const total = lines.reduce((s, i) => s + DEMO[i].price, 0);
  const last = lines[lines.length - 1];

  return (
    <div className="device" aria-hidden>
      <div className="device-screen">
        <div className="pos">
          <div className="pos-menu">
            <div className="pos-search" />
            <div className="pos-cats">
              <span className="on">{t.pos.all}</span>
              {t.pos.cats.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="pos-grid">
              {DEMO.map((d, i) => (
                <div key={i} className={"pos-item" + (last === i && !paid ? " hit" : "")}>
                  <img src={d.img} alt="" />
                  <b>{d[lang]}</b>
                  <span className="mono">{d.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pos-order">
            <div className="pos-order-h">{t.pos.title}</div>
            <div className="pos-lines">
              {counts.size === 0 && <div className="pos-empty">{t.pos.empty}</div>}
              {[...counts.entries()].map(([i, q]) => (
                <div key={i} className="pos-line">
                  <span>
                    <em className="mono">{q}×</em> {DEMO[i][lang]}
                  </span>
                  <span className="mono">{(DEMO[i].price * q).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="pos-total">
              <span>{t.pos.total}</span>
              <span className="mono">
                <Riyal /> {total.toFixed(2)}
              </span>
            </div>
            <div className={"pos-pay" + (paid ? " done" : "")}>{paid ? <Icon name="check" /> : t.pos.pay}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("ar");
  const [period, setPeriod] = useState<Period>("monthly");
  const [open, setOpen] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const t = T[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rk_lang");
      if (saved === "en" || saved === "ar") setLang(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("rk_lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Blocks fade up once as they come into view.
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll("[data-in]:not(.in)") || []);
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [lang]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const planName = (p: Plan) => (lang === "ar" ? p.name : PLAN_EN[p.key].name);
  const tr = (s: string) => (lang === "ar" ? s : ITEM_EN[s] || s);
  const wordmark = lang === "ar" ? "/brand/rakeen-wordmark-deep.png" : "/brand/rakeen-wordmark-en-deep.png";
  const stripIcons: IconName[] = ["wifi", "qr", "devices", "chat"];
  const [asas, emad, sarh] = PLANS;

  return (
    <div className="rk" ref={root}>
      {/* ---------- nav ---------- */}
      <header className={"nav" + (scrolled ? " scrolled" : "")}>
        <div className="wrap nav-in">
          <a href="#top" onClick={go("top")} className="brand">
            <img src={wordmark} alt={lang === "ar" ? "ركين" : "Rakeen"} />
          </a>
          <nav className="nav-links">
            <a href="#features" onClick={go("features")}>{t.nav.features}</a>
            <a href="#plans" onClick={go("plans")}>{t.nav.plans}</a>
            <a href="#faq" onClick={go("faq")}>{t.nav.faq}</a>
          </nav>
          <div className="nav-end">
            <button className="lang" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "English" : "العربية"}>
              {lang === "ar" ? "EN" : "ع"}
            </button>
            <a href="/dashboard" className="nav-login">{t.nav.login}</a>
            <a href="/signup" className="btn btn-lime btn-sm">{t.nav.start}</a>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="hero" id="top">
        <div className="hero-glow" aria-hidden />
        <div className="wrap hero-in">
          <div className="hero-copy">
            <a href="/signup" className="pill">
              <span className="pill-dot" />
              {t.hero.pill}
            </a>
            <h1>
              {t.hero.h1a}
              <br />
              <span className="mark">{t.hero.h1b}</span> {t.hero.h1c}
            </h1>
            <p className="lead">{t.hero.sub}</p>
            <div className="cta-row">
              <a href="/signup" className="btn btn-ink">
                {t.hero.cta}
                <Icon name="arrow" />
              </a>
              <a href="#plans" onClick={go("plans")} className="btn btn-ghost">{t.hero.cta2}</a>
            </div>
            <p className="note">{t.hero.note}</p>
          </div>

          <div className="hero-art">
            <HeroCashier lang={lang} />
            <div className="float f-online">
              <span className="f-ic">
                <Icon name="plus" />
              </span>
              <div>
                <b>{t.float.online}</b>
                <span className="mono">
                  <Riyal /> 62.00
                </span>
              </div>
            </div>
            <div className="float f-kitchen">
              <span className="f-ic ok">
                <Icon name="check" />
              </span>
              <b>{t.float.kitchen}</b>
            </div>
            <div className="float f-profit">
              <span>{t.float.profit}</span>
              <b className="mono">
                <Riyal /> 6,271
              </b>
              <svg viewBox="0 0 80 24" className="spark" aria-hidden>
                <path d="M1 20 L14 16 L26 18 L38 10 L52 12 L64 5 L79 3" />
              </svg>
            </div>
          </div>
        </div>

        <div className="wrap">
          <ul className="strip" data-in>
            {t.strip.map((s, i) => (
              <li key={i}>
                <Icon name={stripIcons[i]} />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- steps ---------- */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.steps.kicker}</span>
            <h2>{t.steps.title}</h2>
          </div>
          <ol className="steps" data-in>
            {t.steps.items.map((s, i) => (
              <li key={i}>
                <span className="step-n mono">{i + 1}</span>
                <b>{s.t}</b>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="sec" id="features">
        <div className="wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.feat.kicker}</span>
            <h2>{t.feat.title}</h2>
          </div>

          <div className="bento">
            <article className="tile tile-pos" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(asas)}</span>
                <h3>{t.feat.cards.pos.t}</h3>
                <p>{t.feat.cards.pos.d}</p>
              </div>
              <div className="viz-offline" aria-hidden>
                <div className="off-chip">
                  <Icon name="wifi" />
                  {t.feat.offline}
                </div>
                {[1041, 1042, 1043].map((n, i) => (
                  <div key={n} className="off-row" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
                    <span className="mono">#{n}</span>
                    <span className="off-state">
                      <i />
                      {t.feat.saved}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="tile tile-kds" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(emad)}</span>
                <h3>{t.feat.cards.kds.t}</h3>
                <p>{t.feat.cards.kds.d}</p>
              </div>
              <div className="viz-ticket" aria-hidden>
                <div className="ticket">
                  <b className="mono">#1042</b>
                  <span>1× {DEMO[0][lang]}</span>
                  <span>2× {DEMO[3][lang]}</span>
                  <i className="ticket-timer mono">02:14</i>
                </div>
              </div>
            </article>

            <article className="tile tile-inv" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(emad)}</span>
                <h3>{t.feat.cards.inv.t}</h3>
                <p>{t.feat.cards.inv.d}</p>
              </div>
              <div className="viz-bars" aria-hidden>
                {t.feat.inv.map((b) => (
                  <div key={b.n} className={"bar" + (b.v < 25 ? " low" : "")}>
                    <span>{b.n}</span>
                    <div className="bar-track">
                      <i style={{ width: `${b.v}%` }} />
                    </div>
                    {b.v < 25 && <em>{t.feat.low}</em>}
                  </div>
                ))}
              </div>
            </article>

            <article className="tile tile-profit tile-dark" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(emad)}</span>
                <h3>{t.feat.cards.profit.t}</h3>
                <p>{t.feat.cards.profit.d}</p>
              </div>
              <div className="viz-pl" aria-hidden>
                {t.feat.profitRows.map((r) => (
                  <div key={r.n} className="pl-row">
                    <span>{r.n}</span>
                    <span className={"mono" + (r.v < 0 ? " neg" : "")}>{num(r.v)}</span>
                  </div>
                ))}
                <div className="pl-row pl-net">
                  <span>{t.feat.net}</span>
                  <span className="mono">
                    <Riyal /> {num(18240 - 5470 - 3760)}
                  </span>
                </div>
              </div>
            </article>

            <article className="tile tile-loyalty" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(emad)}</span>
                <h3>{t.feat.cards.loyalty.t}</h3>
                <p>{t.feat.cards.loyalty.d}</p>
              </div>
              <div className="viz-card" aria-hidden>
                <div className="wcard">
                  <div className="wcard-top">
                    <img src="/pos-icon-192.png" alt="" />
                    <span>GOLD</span>
                  </div>
                  <div className="wcard-pts">
                    <b className="mono">240</b>
                    <small>{t.feat.points}</small>
                  </div>
                  <div className="wcard-bar" />
                </div>
              </div>
            </article>

            <article className="tile tile-store" data-in>
              <div className="tile-txt">
                <span className="tag tag-top">{planName(sarh)}</span>
                <h3>{t.feat.cards.store.t}</h3>
                <p>{t.feat.cards.store.d}</p>
              </div>
              <div className="viz-phone" aria-hidden>
                <div className="phone">
                  <div className="phone-h">{t.feat.storeName}</div>
                  {DEMO.slice(0, 2).map((d, i) => (
                    <div key={i} className="phone-item">
                      <img src={d.img} alt="" loading="lazy" />
                      <div>
                        <b>{d[lang]}</b>
                        <span className="mono">{d.price.toFixed(2)}</span>
                      </div>
                      <i>
                        <Icon name="plus" />
                      </i>
                    </div>
                  ))}
                  <div className="phone-cta">{t.feat.order}</div>
                </div>
              </div>
            </article>

            <article className="tile tile-delivery" data-in>
              <div className="tile-txt">
                <span className="tag">{planName(emad)}</span>
                <h3>{t.feat.cards.delivery.t}</h3>
                <p>{t.feat.cards.delivery.d}</p>
              </div>
              <div className="viz-apps" aria-hidden>
                <span style={{ background: "#FF6600" }}>H</span>
                <span style={{ background: "#0B6B3A" }}>ج</span>
                <span style={{ background: "#7B2FF7" }}>T</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- plans ---------- */}
      <section className="sec plans" id="plans">
        <div className="wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.plans.kicker}</span>
            <h2>{t.plans.title}</h2>
            <p className="sec-sub">{t.plans.sub}</p>
            <div className="period" role="group" data-period={period}>
              <button className={period === "monthly" ? "on" : ""} onClick={() => setPeriod("monthly")} aria-pressed={period === "monthly"}>
                {t.plans.monthly}
              </button>
              <button className={period === "annual" ? "on" : ""} onClick={() => setPeriod("annual")} aria-pressed={period === "annual"}>
                {t.plans.annual}
                <em>{t.plans.save}</em>
              </button>
            </div>
          </div>

          <div className="plan-grid">
            {PLANS.map((p, i) => {
              const featured = p.key === "emad";
              const price = period === "annual" ? p.annual : p.monthly;
              const extra = period === "annual" ? p.extraBranchAnnual : p.extraBranchMonthly;
              const per = period === "annual" ? t.plans.perYear : t.plans.perMonth;
              return (
                <article key={p.key} className={"plan" + (featured ? " featured" : "")} data-in style={{ transitionDelay: `${i * 80}ms` }}>
                  {featured && <span className="plan-badge">{t.plans.popular}</span>}
                  <h3>{planName(p)}</h3>
                  <p className="plan-tag">{lang === "ar" ? p.tagline : PLAN_EN[p.key].tagline}</p>
                  <div className="price">
                    <Riyal />
                    <b className="mono">{num(price)}</b>
                    <span>{per}</span>
                  </div>
                  <p className="plan-branch">
                    {t.plans.branches(p.includedBranches)} · {t.plans.extra(num(extra), per)}
                  </p>
                  <a href="/signup" className={"btn " + (featured ? "btn-lime" : "btn-line")}>
                    {t.plans.choose}
                  </a>
                  {i > 0 && <p className="plan-inherit">{t.plans.everything(planName(PLANS[i - 1]))}</p>}
                  <ul className="plan-list">
                    {planList(p).map((s) => (
                      <li key={s}>
                        <Icon name="check" />
                        {tr(s)}
                      </li>
                    ))}
                  </ul>
                  <a className="plan-quote" href={waLink(t.plans.waMsg(planName(p)))} target="_blank" rel="noopener noreferrer">
                    {t.plans.quote}
                  </a>
                </article>
              );
            })}
          </div>

          <div className="trial" data-in>
            <span className="trial-n mono">350</span>
            <div className="trial-txt">
              <b>{t.plans.trialT}</b>
              <p>{t.plans.trialD}</p>
            </div>
            <a href="/signup" className="btn btn-lime">{t.hero.cta}</a>
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section className="sec" id="faq">
        <div className="wrap faq-wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.faq.kicker}</span>
            <h2>{t.faq.title}</h2>
          </div>
          <div className="faq" data-in>
            {t.faq.items.map((f, i) => (
              <div key={i} className={"qa" + (open === i ? " open" : "")}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {f.q}
                  <span className="qa-ic">
                    <Icon name="plus" />
                  </span>
                </button>
                <div className="qa-a">
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- close ---------- */}
      <section className="sec sec-close">
        <div className="wrap">
          <div className="close" data-in>
            <div className="close-glow" aria-hidden />
            <h2>{t.close.title}</h2>
            <p>{t.close.sub}</p>
            <div className="cta-row">
              <a href="/signup" className="btn btn-lime">
                {t.close.cta}
                <Icon name="arrow" />
              </a>
              <a href={waLink(lang === "ar" ? "السلام عليكم، عندي سؤال عن ركين" : "Hi, I have a question about Rakeen")} target="_blank" rel="noopener noreferrer" className="btn btn-ghost-dark">
                {t.close.wa}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-brand">
            <img src={wordmark} alt={lang === "ar" ? "ركين" : "Rakeen"} />
            <span>{t.footer.tag}</span>
          </div>
          <nav>
            <a href="#features" onClick={go("features")}>{t.nav.features}</a>
            <a href="#plans" onClick={go("plans")}>{t.nav.plans}</a>
            <a href="/privacy">{t.footer.privacy}</a>
            <a href="/terms">{t.footer.terms}</a>
          </nav>
          <div className="foot-contact">
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" className="mono">
              055 744 4227
            </a>
            <a href="mailto:support@rakeenapp.com">support@rakeenapp.com</a>
          </div>
        </div>
        <div className="wrap foot-bottom">{t.footer.rights}</div>
      </footer>
    </div>
  );
}
