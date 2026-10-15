"use client";

/* الصفحة الرئيسية لـ rakeenapp.com.
   - الأسعار والمزايا من lib/plans.ts مباشرة (نفس عرض السعر والعقد واللوحة).
   - بطاقة الولاء = نسخة من البطاقة الحقيقية (app/loyalty-card/[token]، الثيم
     الكلاسيكي) بنفس الأيقونات والألوان والمقاسات، مو رسمة.
   - المتجر = لقطة حقيقية من متجر عنوب (public/landing/store-anoob.jpg،
     تنعاد بـ scratchpad/shot-store.cjs لو تغيّر شكل المتجر).
   الصفحة القديمة محفوظة على /classic. */

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLANS, type Plan, type PlanItem } from "@/lib/plans";
import { LOYALTY_ICON_PATHS, getContrastTextColor } from "../loyalty-card/[token]/icons";
import "./rakeen-landing.css";

type Lang = "ar" | "en";
type Period = "monthly" | "annual";

const WA = "966557444227";
const waLink = (text: string) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const num = (n: number) => n.toLocaleString("en-US");

const IMG = "https://media.rakeenapp.com/menu-item-images/1/";
const DEMO = [
  { ar: "بوكس وسط مشكّل", en: "Mixed box M", cat: { ar: "البوكسات", en: "Boxes" }, price: 39, img: IMG + "37-1786203511961.png" },
  { ar: "بوكس كبير مشكّل", en: "Mixed box L", cat: { ar: "البوكسات", en: "Boxes" }, price: 79, img: IMG + "38-1786204226614.jpeg" },
  { ar: "بوكس رول مسخن", en: "Warm roll box", cat: { ar: "البوكسات", en: "Boxes" }, price: 39, img: IMG + "42-1786204272084.jpeg" },
  { ar: "صوص حامض", en: "Sour sauce", cat: { ar: "الصوصات", en: "Sauces" }, price: 2, img: IMG + "57-1786341048546.png" },
];
const RING = [0, 3, 1, 3, 2]; // the hero cashier rings these up, in order

// Real loyalty-card designs (logo + banner uploaded by each business).
const LB = "https://media.rakeenapp.com/loyalty-branding/1/";
type Pass = {
  name: string;
  customer: string;
  tenure: string;
  accent: string;
  logo: string;
  banner: string;
  tier: { emoji: string; label: string };
  points?: number;
  visits?: { filled: number; of: number; icon: string; reward: string; ready: number };
  saved: number;
};
// fan order: [0] sits in the middle, [1] and [2] either side.
const PASSES: Pass[] = [
  { name: "PASS", customer: "فهد العتيبي", tenure: "معنا من سنة", accent: "#516F6D", logo: LB + "logo-1786636378234.png", banner: LB + "banner-1786636379131.png", tier: { emoji: "💎", label: "Platinum" }, points: 1280, saved: 860 },
  { name: "عنوب | Anoob", customer: "خالد الحربي", tenure: "معنا من سنة", accent: "#C4FF2B", logo: LB + "logo-1786634917576.png", banner: LB + "banner-1786634918047.jpeg", tier: { emoji: "🥇", label: "Gold" }, points: 240, saved: 500 },
  { name: "ألدان CAFE", customer: "منال القحطاني", tenure: "معنا من ٨ شهور", accent: "#781414", logo: LB + "logo-1786637275028.png", banner: LB + "banner-1786637277741.png", tier: { emoji: "🥈", label: "Silver" }, visits: { filled: 4, of: 6, icon: "coffee", reward: "قهوة مجانية", ready: 1 }, saved: 120 },
  { name: "Bunzo's Burger", customer: "نورة الدوسري", tenure: "معنا من شهرين", accent: "#C83C3C", logo: LB + "logo-1786637601603.png", banner: LB + "banner-1786637602818.png", tier: { emoji: "🥉", label: "Bronze" }, visits: { filled: 3, of: 6, icon: "burger", reward: "برقر مجاني", ready: 0 }, saved: 45 },
];

/* ---------------- copy ---------------- */

const T = {
  ar: {
    nav: { features: "المزايا", plans: "الباقات", faq: "الأسئلة", login: "دخول", start: "ابدأ مجانًا" },
    hero: {
      pill: "٣٥٠ طلب مجانًا · بدون بطاقة",
      h1a: "لكل مطعم ناجح،",
      h1b: "رُكن",
      h1c: "يستند عليه.",
      sub: "الكاشير، والمتجر، والولاء، وأرباحك. نظام واحد يشتغل عنك.",
      cta: "ابدأ مجانًا",
      cta2: "شوف الباقات",
      from: "الباقات من",
      perMonth: "شهريًا",
    },
    pos: { title: "الطلب الحالي", total: "الإجمالي", pay: "ادفع", all: "الكل", search: "ابحث أو امسح باركود…", paid: "تم الدفع" },
    newOrder: { t: "طلب جديد من المتجر", s: "مدفوع · Apple Pay" },
    strip: ["يكمل بدون إنترنت", "فاتورة ضريبية برمز QR", "آيباد وكمبيوتر وجوال", "دعم بالعربي على واتساب"],
    ch: {
      pos: {
        k: "الكاشير",
        h: "يبيع، حتى لو طاح النت.",
        p: "تنقطع الشبكة؟ الكاشير يكمل، ويرسل كل شي أول ما ترجع.",
        b: ["فاتورة ضريبية برمز QR", "كاش وشبكة ودفع مقسّم", "طلبات المطبخ تنطبع لحالها", "إغلاق الوردية بضغطة"],
      },
      store: {
        k: "المتجر الإلكتروني",
        h: "متجرك بهويتك. بدون عمولة.",
        p: "عميلك يطلب منك مباشرة، يدفع بالبطاقة، ويتابع طلبه لين يوصله.",
        b: ["بدون عمولة على الطلب", "توصيل أو استلام", "الطلب يوصل الكاشير والمطبخ فورًا"],
        real: "لقطة حقيقية من متجر عنوب على ركين",
      },
      loyalty: {
        k: "الولاء",
        h: "عميلك يرجع لك.",
        p: "بطاقة بهويتك تنحفظ بجواله بدون تطبيق. يجمع نقاط أو أختام، ويستبدلها عند الكاشير.",
        b: ["نقاط أو أختام", "مستويات من برونزي لبلاتيني", "تذكير لحاله لو غاب"],
        real: "بطاقات بنفس شكلها الحقيقي عند العميل",
      },
      numbers: {
        k: "الأرقام",
        h: "تعرف وش تكسب. بالريال.",
        p: "تكلفة كل طبق من وصفاتك الفعلية، والمخزون ينقص مع كل بيعة. صوّر فاتورة المورد وخلاص.",
        b: ["صافي الربح الحقيقي", "تنبيه قبل ما يخلص صنف", "قراءة فواتير الموردين بالتصوير"],
      },
    },
    rcpt: { title: "فاتورة ضريبية مبسطة", no: "رقم الفاتورة", sub: "المجموع قبل الضريبة", vat: "ضريبة القيمة المضافة ١٥٪", total: "الإجمالي", cash: "شبكة", thanks: "شكرًا لزيارتكم" },
    off: "بدون اتصال · ٣ طلبات محفوظة",
    dash: {
      title: "صافي ربح هالشهر",
      rows: [
        { n: "المبيعات", v: 18240 },
        { n: "تكلفة الطعام", v: -5470 },
        { n: "المصاريف", v: -3760 },
      ],
      alert: "البصل قرب يخلص",
      alertS: "باقي ٢ كجم من ٢٠",
      scan: "فاتورة المورد انقرأت",
      scanS: "بصل ١٨ كجم · طماط ٢٤ كجم",
    },
    more: {
      h: "وكل اللي يحتاجه يومك.",
      items: ["شاشة المطبخ", "تطبيقات التوصيل", "الطاولات والحجوزات", "صلاحيات الموظفين", "تعدد الفروع", "تقارير وتصدير Excel", "شاشة العميل", "صفحة حجز المواعيد"],
    },
    plans: {
      k: "الباقات",
      h: "اختر باقتك. وابدأ اليوم.",
      sub: "كل الباقات تبدأ بتجربة مجانية لين ٣٥٠ طلب.",
      monthly: "شهري",
      annual: "سنوي",
      save: "شهرين مجانًا",
      perMonth: "شهريًا",
      perYear: "سنويًا",
      saveAmt: (n: string) => `توفّر ${n} بالسنة`,
      popular: "الأكثر طلبًا",
      top: "الأشمل",
      count: (n: number) => `${n} ${n <= 10 ? "مزايا" : "ميزة"}`,
      branches: (n: number) => (n === 1 ? "فرع واحد" : n === 2 ? "فرعين" : `${n} فروع`),
      extra: (p: string) => `+ ${p} لكل فرع زيادة`,
      everything: (name: string) => `كل اللي في ${name}، وفوقها:`,
      carry: (name: string, n: number) => `ومعها كل مزايا ${name} (${n} ميزة):`,
      choose: "ابدأ مجانًا",
      ask: "عندك سؤال؟ كلّمنا",
      waMsg: (name: string) => `السلام عليكم، أبي أعرف أكثر عن باقة ${name} في ركين`,
      compare: "قارن كل المزايا",
      hide: "إخفاء المقارنة",
      feature: "الميزة",
      assure: ["ترقّي أي وقت", "بدون بطاقة للتجربة", "دعم على واتساب"],
    },
    faq: {
      k: "الأسئلة",
      h: "قبل ما تبدأ.",
      items: [
        { q: "وش أحتاج عشان أبدأ؟", a: "آيباد أو كمبيوتر، وإنترنت للتسجيل. الطابعة اختيارية: أي طابعة فواتير شبكية (Wi‑Fi أو LAN) تدعم ESC/POS." },
        { q: "لو انقطع النت؟", a: "الكاشير يكمل البيع ويحفظ الطلبات، ويرسلها لحاله أول ما يرجع الاتصال." },
        { q: "كيف التجربة المجانية؟", a: "كل المزايا مفتوحة لين ٣٥٠ طلب، الكاشير والمتجر مع بعض. لما توصل لها عندك يوم كامل تختار فيه باقتك." },
        { q: "أقدر أغيّر باقتي بعدين؟", a: "إيه، ترقّي أي وقت والمزايا تنفتح على طول." },
        { q: "عندي أكثر من فرع؟", a: "الفرع الإضافي بنص سعر الباقة، وباقة صرح فيها فرعين وتقارير لكل فرع." },
      ],
    },
    close: { h: "مطعمك يستاهل نظام يشتغل عنه.", sub: "سجّل، أضف منيوك، وابدأ البيع خلال دقائق.", cta: "ابدأ مجانًا", wa: "كلّمنا واتساب" },
    sticky: "ابدأ مجانًا · ٣٥٠ طلب",
    footer: { tag: "نظام تشغيل مطعمك.", privacy: "الخصوصية", terms: "الشروط", rights: "© ٢٠٢٦ ركين" },
  },
  en: {
    nav: { features: "Features", plans: "Plans", faq: "FAQ", login: "Log in", start: "Start free" },
    hero: {
      pill: "350 orders free · No card",
      h1a: "Every great restaurant",
      h1b: "stands",
      h1c: "on something.",
      sub: "Cashier, online store, loyalty and your profit. One system that works for you.",
      cta: "Start free",
      cta2: "See plans",
      from: "Plans from",
      perMonth: "/ month",
    },
    pos: { title: "Current order", total: "Total", pay: "Pay", all: "All", search: "Search or scan…", paid: "Paid" },
    newOrder: { t: "New store order", s: "Paid · Apple Pay" },
    strip: ["Works offline", "Tax invoice with QR", "iPad, computer and phone", "Arabic support on WhatsApp"],
    ch: {
      pos: {
        k: "Cashier",
        h: "Keeps selling, even offline.",
        p: "Network down? The cashier carries on and syncs everything once you're back.",
        b: ["Tax invoice with QR", "Cash, card and split bills", "Kitchen tickets print by themselves", "Close the shift in one tap"],
      },
      store: {
        k: "Online store",
        h: "Your brand. Zero commission.",
        p: "Customers order from you directly, pay by card, and track the order to their door.",
        b: ["No commission per order", "Delivery or pickup", "Orders land on the cashier and kitchen instantly"],
        real: "A real screenshot of Anoob's store on Rakeen",
      },
      loyalty: {
        k: "Loyalty",
        h: "Customers come back.",
        p: "A card in your brand, saved to their phone, no app. Points or stamps, redeemed at the cashier.",
        b: ["Points or stamps", "Tiers from Bronze to Platinum", "Automatic nudge when they drift away"],
        real: "Exactly how the card looks on the customer's phone",
      },
      numbers: {
        k: "Numbers",
        h: "Know what you make. To the riyal.",
        p: "Every dish costed from your real recipes, stock that drops with each sale. Snap the supplier invoice and you're done.",
        b: ["Real net profit", "Heads-up before an item runs out", "Supplier invoices read from a photo"],
      },
    },
    rcpt: { title: "Simplified tax invoice", no: "Invoice no.", sub: "Subtotal", vat: "VAT 15%", total: "Total", cash: "Card", thanks: "Thank you for visiting" },
    off: "Offline · 3 orders saved",
    dash: {
      title: "This month's net profit",
      rows: [
        { n: "Sales", v: 18240 },
        { n: "Food cost", v: -5470 },
        { n: "Expenses", v: -3760 },
      ],
      alert: "Onion running low",
      alertS: "2 kg left of 20",
      scan: "Supplier invoice read",
      scanS: "Onion 18 kg · Tomato 24 kg",
    },
    more: {
      h: "And everything your day needs.",
      items: ["Kitchen screen", "Delivery apps", "Tables & reservations", "Staff permissions", "Multiple branches", "Reports & Excel export", "Customer display", "Booking page"],
    },
    plans: {
      k: "Plans",
      h: "Pick your plan. Start today.",
      sub: "Every plan starts with a free trial of 350 orders.",
      monthly: "Monthly",
      annual: "Yearly",
      save: "2 months free",
      perMonth: "/ month",
      perYear: "/ year",
      saveAmt: (n: string) => `Save ${n} a year`,
      popular: "Most popular",
      top: "Everything",
      count: (n: number) => `${n} features`,
      branches: (n: number) => (n === 1 ? "1 branch" : `${n} branches`),
      extra: (p: string) => `+ ${p} per extra branch`,
      everything: (name: string) => `Everything in ${name}, plus:`,
      carry: (name: string, n: number) => `And all ${n} features of ${name}:`,
      choose: "Start free",
      ask: "Questions? Talk to us",
      waMsg: (name: string) => `Hi, I'd like to know more about the Rakeen ${name} plan`,
      compare: "Compare all features",
      hide: "Hide comparison",
      feature: "Feature",
      assure: ["Upgrade any time", "No card for the trial", "WhatsApp support"],
    },
    faq: {
      k: "FAQ",
      h: "Before you start.",
      items: [
        { q: "What do I need to start?", a: "An iPad or computer, and internet to sign up. A printer is optional: any network (Wi‑Fi or LAN) receipt printer that speaks ESC/POS." },
        { q: "What if the internet drops?", a: "The cashier keeps selling, saves the orders and sends them by itself once you're back online." },
        { q: "How does the free trial work?", a: "Every feature is open for 350 orders, cashier and store combined. When you reach it you get a full day to pick a plan." },
        { q: "Can I change plans later?", a: "Yes. Upgrade any time and the features open right away." },
        { q: "More than one branch?", a: "An extra branch is half the plan price; Sarh includes two branches with per-branch reports." },
      ],
    },
    close: { h: "Your restaurant deserves a system that works for it.", sub: "Sign up, add your menu, and start selling in minutes.", cta: "Start free", wa: "WhatsApp us" },
    sticky: "Start free · 350 orders",
    footer: { tag: "Your restaurant's operating system.", privacy: "Privacy", terms: "Terms", rights: "© 2026 Rakeen" },
  },
};

// English names for the package items (lib/plans.ts is Arabic only). A
// missing one falls back to the Arabic text rather than disappearing.
const ITEM_EN: Record<string, string> = {
  "الكاشير": "Point of sale",
  "الفاتورة الضريبية": "Tax invoice with QR",
  "العمل بدون إنترنت": "Works offline",
  "إغلاق الوردية": "Shift close",
  "المنيو": "Menu management",
  "الطلبات والاسترجاع": "Orders and refunds",
  "التقرير اليومي": "Daily report",
  "الموظفين": "Staff with PIN",
  "شاشة المطبخ وطباعة المطبخ": "Kitchen screen and printing",
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

// Short names for the cards (the quote keeps the full sentences). An item
// missing here shows its full text, so a new item in lib/plans.ts still shows.
const CARD_AR: Record<string, string> = {
  "شاشة المطبخ وطباعة المطبخ": "شاشة المطبخ وطباعته",
  "شاشة العميل: يشوف طلبه وباركود الولاء": "شاشة العميل",
  "المخزون والوصفات وتنبيهات النقص والاستهلاك التلقائي": "المخزون والوصفات والتنبيهات",
  "المشتريات، وقراءة فواتير الموردين بالتصوير": "قراءة فواتير الموردين بالتصوير",
  "تكلفة كل منتج، وصافي الربح، والمصاريف والمحاسبة": "تكلفة الأطباق وصافي الربح",
  "العملاء، وبرنامج الولاء، وبطاقة المحفظة": "برنامج الولاء وبطاقة الجوال",
  "الطاولات والحجوزات وقائمة الانتظار": "الطاولات والحجوزات",
  "تطبيقات التوصيل وحساب عمولاتها": "تطبيقات التوصيل",
  "صلاحيات الموظفين وسجل العمليات": "صلاحيات الموظفين",
  "التقارير الكاملة وتصدير Excel": "التقارير الكاملة وExcel",
  "المتجر الإلكتروني: طلب مباشر وتتبّع ودفع بالبطاقة، بدون عمولة": "متجر إلكتروني بدون عمولة",
  "صفحة حجز المواعيد للعملاء": "صفحة حجز المواعيد",
  "إدارة الفروع وتقارير لكل فرع": "تعدد الفروع وتقارير لكل فرع",
};
const CARD_EN: Record<string, string> = {
  "شاشة المطبخ وطباعة المطبخ": "Kitchen screen & printing",
  "شاشة العميل: يشوف طلبه وباركود الولاء": "Customer display",
  "المخزون والوصفات وتنبيهات النقص والاستهلاك التلقائي": "Stock, recipes & alerts",
  "المشتريات، وقراءة فواتير الموردين بالتصوير": "Supplier invoice scanning",
  "تكلفة كل منتج، وصافي الربح، والمصاريف والمحاسبة": "Dish cost & net profit",
  "العملاء، وبرنامج الولاء، وبطاقة المحفظة": "Loyalty & phone wallet card",
  "الطاولات والحجوزات وقائمة الانتظار": "Tables & reservations",
  "تطبيقات التوصيل وحساب عمولاتها": "Delivery apps",
  "صلاحيات الموظفين وسجل العمليات": "Staff permissions",
  "التقارير الكاملة وتصدير Excel": "Full reports & Excel",
  "المتجر الإلكتروني: طلب مباشر وتتبّع ودفع بالبطاقة، بدون عمولة": "Online store, zero commission",
  "صفحة حجز المواعيد للعملاء": "Booking page",
  "إدارة الفروع وتقارير لكل فرع": "Multi-branch reports",
};
// What each card lists: أساس its short names, the others what they add.
function planAdds(plan: Plan): string[] {
  const label = (i: PlanItem) => (plan.key === "asas" ? i.short || i.text : i.text);
  return [...new Set(plan.items.filter((i) => i.short !== "الإعدادات").map(label))];
}
// Every item a package includes (its own plus the ones below it), for the
// feature count and the comparison table.
const LADDER = PLANS.map((p) => planAdds(p));
const includedCount = (i: number) => LADDER.slice(0, i + 1).reduce((s, l) => s + l.length, 0);

/* ---------------- small pieces ---------------- */

// U+20C1, the official riyal sign; only the self-hosted saudi_riyal font has it.
function Riyal() {
  return <span className="riyal" aria-label="SAR">{"⃁"}</span>;
}

type IconName = "check" | "wifi" | "qr" | "devices" | "chat" | "plus" | "arrow" | "bag" | "alert" | "scan" | "crown" | "minus";
function Icon({ name }: { name: IconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="ic" aria-hidden>
      {name === "check" && <path {...p} d="M5 12.5l4.5 4.5L19 7" />}
      {name === "minus" && <path {...p} d="M8 12h8" />}
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
      {name === "bag" && (
        <g {...p}>
          <path d="M9 9V7a3 3 0 0 1 6 0v2" />
          <path d="M6.2 9h11.6l.9 10.2a1.6 1.6 0 0 1-1.6 1.8H6.9a1.6 1.6 0 0 1-1.6-1.8L6.2 9Z" />
        </g>
      )}
      {name === "alert" && (
        <g {...p}>
          <path d="M12 4.2 21 19H3L12 4.2Z" />
          <path d="M12 10v4.2" />
          <circle cx="12" cy="17" r=".8" fill="currentColor" />
        </g>
      )}
      {name === "scan" && (
        <g {...p}>
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          <path d="M8 9h8M8 12h8M8 15h5" />
        </g>
      )}
      {name === "crown" && <path {...p} d="M4 17h16M5 17 3.5 7.5l5 3.5L12 5l3.5 6 5-3.5L19 17" />}
    </svg>
  );
}

/* A copy of the real loyalty card (app/loyalty-card/[token], classic theme):
   same three bands, same tier chip, stamps from the same icon set, same
   "مدعوم من ركين" footer. */
function LoyaltyPass({ pass, qr }: { pass: Pass; qr: string }) {
  const on = getContrastTextColor(pass.accent);
  const v = pass.visits;
  return (
    <div className="pass" style={{ ["--a" as string]: pass.accent, ["--on" as string]: on }}>
      <div className="pass-head">
        <div className="pass-top">
          <img src={pass.logo} alt="" className="pass-logo" />
          <div className="pass-brand">{pass.name}</div>
          <div className="pass-tier">
            <span>{pass.tier.emoji}</span>
            <span>{pass.tier.label}</span>
          </div>
        </div>
        <div className="pass-customer">{pass.customer}</div>
        <div className="pass-tenure">{pass.tenure}</div>
      </div>
      <div className="pass-mid" style={{ backgroundImage: `linear-gradient(rgba(247,244,239,.8),rgba(247,244,239,.8)), url(${pass.banner})` }}>
        {v ? (
          <div className="pass-stamps">
            {Array.from({ length: v.of }).map((_, i) => (
              <svg key={i} viewBox="0 0 24 24" fill={i < v.filled ? pass.accent : "none"} stroke={i < v.filled ? pass.accent : "#c9c4ba"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: LOYALTY_ICON_PATHS[v.icon] || LOYALTY_ICON_PATHS.generic }} />
            ))}
          </div>
        ) : (
          <div className="pass-points">
            <div className="pass-halo" />
            <svg viewBox="0 0 24 24" fill={pass.accent} className="pass-sparkle">
              <path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z" />
            </svg>
            <div className="pass-plabel">رصيد النقاط</div>
            <div className="pass-pval">{(pass.points || 0).toLocaleString("ar-SA")}</div>
          </div>
        )}
      </div>
      <div className="pass-foot">
        <div className="pass-saved">
          <span>💰</span>
          <span>وفرت معنا {pass.saved.toLocaleString("ar-SA")} ر.س</span>
        </div>
        {v && (
          <div className="pass-stats">
            <div>
              <small>متبقي لـ{v.reward}</small>
              <b>{v.of - v.filled}</b>
            </div>
            <i />
            <div>
              <small>هدايا جاهزة</small>
              <b>{v.ready}</b>
            </div>
          </div>
        )}
        <div className="pass-qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="pass-powered">مدعوم من ركين</div>
      </div>
    </div>
  );
}

/* The hero cashier, styled after the real POS (lime category, dark price pill,
   quantity chips), ringing up a few items on a loop. */
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
      } else if (step >= RING.length + 4) {
        step = 0;
        setPaid(false);
        setLines([]);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const counts = new Map<number, number>();
  lines.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1));
  const total = lines.reduce((s, i) => s + DEMO[i].price, 0);
  const last = lines[lines.length - 1];

  return (
    <div className="tablet" aria-hidden>
      <div className="tablet-screen">
        <div className="pos">
          <div className="pos-menu">
            <div className="pos-tools">
              <div className="pos-search">{t.pos.search}</div>
              <span className="pos-tool">★</span>
            </div>
            <div className="pos-cats">
              <span className="on">{t.pos.all}</span>
              <span>{DEMO[0].cat[lang]}</span>
              <span>{DEMO[3].cat[lang]}</span>
            </div>
            <div className="pos-grid">
              {DEMO.map((d, i) => (
                <div key={i} className={"pos-item" + (last === i && !paid ? " hit" : "")}>
                  <div className="pos-img">
                    <img src={d.img} alt="" />
                  </div>
                  <b>{d[lang]}</b>
                  <small>{d.cat[lang]}</small>
                  <span className="pos-price mono">{d.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pos-order">
            <div className="pos-order-h">{t.pos.title}</div>
            <div className="pos-lines">
              {[...counts.entries()].map(([i, q]) => (
                <div key={i} className="pos-line">
                  <span className="pos-qty mono">{q}</span>
                  <span className="pos-lname">{DEMO[i][lang]}</span>
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
            <div className={"pos-pay" + (paid ? " done" : "")}>
              {paid ? (
                <>
                  <Icon name="check" /> {t.pos.paid}
                </>
              ) : (
                t.pos.pay
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Receipt({ lang, qr }: { lang: Lang; qr: string }) {
  const r = T[lang].rcpt;
  const items = [
    { q: 1, d: DEMO[0] },
    { q: 1, d: DEMO[1] },
    { q: 2, d: DEMO[3] },
  ];
  const total = items.reduce((s, i) => s + i.q * i.d.price, 0);
  const vat = total - total / 1.15;
  return (
    <div className="receipt" aria-hidden>
      <div className="rc-brand">عنوب | Anoob</div>
      <div className="rc-sub">{r.title}</div>
      <div className="rc-meta">
        <span>{r.no}</span>
        <span className="mono">#1042</span>
      </div>
      <div className="rc-meta">
        <span className="mono">2026-10-16</span>
        <span className="mono">13:42</span>
      </div>
      <div className="rc-cut" />
      {items.map((i, k) => (
        <div key={k} className="rc-row">
          <span>
            {i.q}× {i.d[lang]}
          </span>
          <span className="mono">{(i.q * i.d.price).toFixed(2)}</span>
        </div>
      ))}
      <div className="rc-cut" />
      <div className="rc-row rc-light">
        <span>{r.sub}</span>
        <span className="mono">{(total - vat).toFixed(2)}</span>
      </div>
      <div className="rc-row rc-light">
        <span>{r.vat}</span>
        <span className="mono">{vat.toFixed(2)}</span>
      </div>
      <div className="rc-row rc-total">
        <span>{r.total}</span>
        <span className="mono">{total.toFixed(2)}</span>
      </div>
      <div className="rc-row rc-light">
        <span>{r.cash}</span>
        <span className="mono">{total.toFixed(2)}</span>
      </div>
      <div className="rc-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="rc-thanks">{r.thanks}</div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("ar");
  const [period, setPeriod] = useState<Period>("monthly");
  const [open, setOpen] = useState<number | null>(0);
  const [compare, setCompare] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [qr, setQr] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const t = T[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rk_lang");
      if (saved === "en" || saved === "ar") setLang(saved);
    } catch {}
    QRCode.toString("https://rakeenapp.com", { type: "svg", margin: 0, color: { dark: "#171717", light: "#00000000" } })
      .then(setQr)
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("rk_lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      const end = document.documentElement.scrollHeight - window.innerHeight - 520;
      setSticky(y > 640 && y < end);
    };
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [lang, compare]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const planName = (p: Plan) => (lang === "ar" ? p.name : PLAN_EN[p.key].name);
  const tr = (s: string) => (lang === "ar" ? s : ITEM_EN[s] || s);
  const card = (s: string) => (lang === "ar" ? CARD_AR[s] || s : CARD_EN[s] || ITEM_EN[s] || s);
  const wordmarkDark = lang === "ar" ? "/brand/rakeen-wordmark-deep.png" : "/brand/rakeen-wordmark-en-deep.png";
  const stripIcons: IconName[] = ["wifi", "qr", "devices", "chat"];
  const net = t.dash.rows.reduce((s, r) => s + r.v, 0);
  const maxRow = Math.max(...t.dash.rows.map((r) => Math.abs(r.v)));

  const Bullets = ({ items }: { items: string[] }) => (
    <ul className="bul">
      {items.map((b) => (
        <li key={b}>
          <Icon name="check" />
          {b}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="rk" ref={root}>
      {/* ---------- nav ---------- */}
      <header className={"nav" + (scrolled ? " scrolled" : "")}>
        <div className="wrap nav-in">
          <a href="#top" onClick={go("top")} className="brand" aria-label={lang === "ar" ? "ركين" : "Rakeen"}>
            <img src={lang === "ar" ? "/brand/rakeen-wordmark.png" : "/brand/rakeen-wordmark-en.png"} alt="" className="brand-light" />
            <img src={wordmarkDark} alt="" className="brand-dark" />
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
        <div className="hero-grid" aria-hidden />
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
              <a href="/signup" className="btn btn-lime btn-lg">
                {t.hero.cta}
                <Icon name="arrow" />
              </a>
              <a href="#plans" onClick={go("plans")} className="btn btn-glass btn-lg">{t.hero.cta2}</a>
            </div>
            <p className="from">
              {t.hero.from} <Riyal /> <b className="mono">{PLANS[0].monthly}</b> {t.hero.perMonth}
            </p>
          </div>

          <div className="hero-art">
            <HeroCashier lang={lang} />
            <div className="hero-phone">
              <div className="iphone">
                <img src="/landing/store-anoob.jpg" alt="" />
              </div>
            </div>
            <div className="toast t-order">
              <span className="toast-ic">
                <Icon name="bag" />
              </span>
              <div>
                <b>{t.newOrder.t}</b>
                <span>
                  <span className="mono">#1043</span> · {t.newOrder.s}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="wrap">
          <ul className="strip">
            {t.strip.map((s, i) => (
              <li key={i}>
                <Icon name={stripIcons[i]} />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div id="features" />

      {/* ---------- chapter: cashier ---------- */}
      <section className="chap">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="kicker">{t.ch.pos.k}</span>
            <h2>{t.ch.pos.h}</h2>
            <p>{t.ch.pos.p}</p>
            <Bullets items={t.ch.pos.b} />
          </div>
          <div className="chap-art art-receipt" data-in>
            <div className="paper-wrap">
              <Receipt lang={lang} qr={qr} />
            </div>
            <div className="toast t-offline">
              <span className="toast-ic dark">
                <Icon name="wifi" />
              </span>
              <b>{t.off}</b>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- chapter: store ---------- */}
      <section className="chap chap-flip">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="kicker k-violet">{t.ch.store.k}</span>
            <h2>{t.ch.store.h}</h2>
            <p>{t.ch.store.p}</p>
            <Bullets items={t.ch.store.b} />
          </div>
          <div className="chap-art art-store" data-in>
            <div className="store-blob" aria-hidden />
            <div className="iphone iphone-lg">
              <img src="/landing/store-anoob.jpg" alt={t.ch.store.real} loading="lazy" />
            </div>
            <div className="toast t-paid">
              <span className="toast-ic ok">
                <Icon name="check" />
              </span>
              <div>
                <b>{t.newOrder.t}</b>
                <span>
                  <span className="mono">#1043</span> · {t.newOrder.s}
                </span>
              </div>
            </div>
            <p className="real-note">{t.ch.store.real}</p>
          </div>
        </div>
      </section>

      {/* ---------- chapter: loyalty ---------- */}
      <section className="chap">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="kicker">{t.ch.loyalty.k}</span>
            <h2>{t.ch.loyalty.h}</h2>
            <p>{t.ch.loyalty.p}</p>
            <Bullets items={t.ch.loyalty.b} />
          </div>
          <div className="chap-art art-loyalty" data-in>
            <div className="fan">
              {PASSES.map((p, i) => (
                <div key={p.name} className={`fan-card fan-${i}`}>
                  <LoyaltyPass pass={p} qr={qr} />
                </div>
              ))}
            </div>
            <p className="real-note">{t.ch.loyalty.real}</p>
          </div>
        </div>
      </section>

      {/* ---------- chapter: numbers ---------- */}
      <section className="chap chap-dark">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="kicker k-lime">{t.ch.numbers.k}</span>
            <h2>{t.ch.numbers.h}</h2>
            <p>{t.ch.numbers.p}</p>
            <Bullets items={t.ch.numbers.b} />
          </div>
          <div className="chap-art art-dash" data-in>
            <div className="dash">
              <div className="dash-h">
                <span>{t.dash.title}</span>
                <span className="dash-live">
                  <i />
                  {lang === "ar" ? "مباشر" : "Live"}
                </span>
              </div>
              <div className="dash-net mono">
                <Riyal /> {num(net)}
              </div>
              <div className="dash-rows">
                {t.dash.rows.map((r) => (
                  <div key={r.n} className={"dash-row" + (r.v < 0 ? " neg" : "")}>
                    <span>{r.n}</span>
                    <div className="dash-bar">
                      <i style={{ width: `${(Math.abs(r.v) / maxRow) * 100}%` }} />
                    </div>
                    <span className="mono">{num(r.v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="toast t-alert">
              <span className="toast-ic warn">
                <Icon name="alert" />
              </span>
              <div>
                <b>{t.dash.alert}</b>
                <span>{t.dash.alertS}</span>
              </div>
            </div>
            <div className="toast t-scan">
              <span className="toast-ic ok">
                <Icon name="scan" />
              </span>
              <div>
                <b>{t.dash.scan}</b>
                <span>{t.dash.scanS}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="wrap more" data-in>
          <h3>{t.more.h}</h3>
          <ul>
            {t.more.items.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- plans ---------- */}
      <section className="plans" id="plans">
        <div className="wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.plans.k}</span>
            <h2>{t.plans.h}</h2>
            <p className="sec-sub">{t.plans.sub}</p>
            <div className="period" role="group">
              <button className={period === "monthly" ? "on" : ""} onClick={() => setPeriod("monthly")} aria-pressed={period === "monthly"}>
                {t.plans.monthly}
              </button>
              <button className={period === "annual" ? "on" : ""} onClick={() => setPeriod("annual")} aria-pressed={period === "annual"}>
                {t.plans.annual}
                <em>{t.plans.save}</em>
              </button>
            </div>
          </div>

          <div className="tiers">
            {PLANS.map((p, i) => {
              const price = period === "annual" ? p.annual : p.monthly;
              const extra = period === "annual" ? p.extraBranchAnnual : p.extraBranchMonthly;
              const per = period === "annual" ? t.plans.perYear : t.plans.perMonth;
              const cls = ["tier", `tier-${p.key}`].join(" ");
              return (
                <article key={p.key} className={cls} data-in style={{ transitionDelay: `${i * 90}ms` }}>
                  {p.key === "emad" && <span className="tier-badge">{t.plans.popular}</span>}
                  {p.key === "sarh" && (
                    <span className="tier-badge badge-top">
                      <Icon name="crown" />
                      {t.plans.top}
                    </span>
                  )}
                  <div className="tier-head">
                    <h3>{planName(p)}</h3>
                    <span className="tier-count">{t.plans.count(includedCount(i))}</span>
                  </div>
                  <p className="tier-tag">{lang === "ar" ? p.tagline : PLAN_EN[p.key].tagline}</p>
                  <div className="price">
                    <Riyal />
                    <b className="mono">{num(price)}</b>
                    <span>{per}</span>
                  </div>
                  <p className="tier-note">
                    {period === "annual" ? (
                      <span className="save-chip">{t.plans.saveAmt(num(p.monthly * 12 - p.annual))}</span>
                    ) : (
                      <>{t.plans.branches(p.includedBranches)}</>
                    )}
                    <span className="tier-extra">{t.plans.extra(num(extra))}</span>
                  </p>
                  <a href="/signup" className="btn tier-btn">
                    {t.plans.choose}
                  </a>
                  {i > 0 && <p className="tier-inherit">{t.plans.everything(planName(PLANS[i - 1]))}</p>}
                  <ul className="tier-list">
                    {LADDER[i].map((s) => (
                      <li key={s}>
                        <Icon name="check" />
                        {card(s)}
                      </li>
                    ))}
                  </ul>
                  {/* the top package shows everything it carries over, so
                      the fullest package also looks the fullest */}
                  {p.key === "sarh" && (
                    <div className="tier-carry">
                      <p>{t.plans.carry(planName(PLANS[i - 1]), includedCount(i - 1))}</p>
                      <ul>
                        {LADDER.slice(0, i).flat().map((s) => (
                          <li key={s}>{card(s)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <a className="tier-ask" href={waLink(t.plans.waMsg(planName(p)))} target="_blank" rel="noopener noreferrer">
                    {t.plans.ask}
                  </a>
                </article>
              );
            })}
          </div>

          <ul className="assure" data-in>
            {t.plans.assure.map((a) => (
              <li key={a}>
                <Icon name="check" />
                {a}
              </li>
            ))}
          </ul>

          <div className="compare-wrap">
            <button className="compare-btn" onClick={() => setCompare(!compare)} aria-expanded={compare}>
              {compare ? t.plans.hide : t.plans.compare}
              <Icon name={compare ? "minus" : "plus"} />
            </button>
            {compare && (
              <div className="compare">
                <table>
                  <thead>
                    <tr>
                      <th>{t.plans.feature}</th>
                      {PLANS.map((p) => (
                        <th key={p.key} className={`th-${p.key}`}>{planName(p)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LADDER.flatMap((items, level) =>
                      items.map((s) => (
                        <tr key={s}>
                          <td>{tr(s)}</td>
                          {PLANS.map((p, i) => (
                            <td key={p.key} className={i >= level ? "yes" : "no"}>
                              <Icon name={i >= level ? "check" : "minus"} />
                            </td>
                          ))}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section className="sec" id="faq">
        <div className="wrap faq-wrap">
          <div className="sec-h" data-in>
            <span className="kicker">{t.faq.k}</span>
            <h2>{t.faq.h}</h2>
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
      <section className="sec">
        <div className="wrap">
          <div className="close" data-in>
            <div className="close-glow" aria-hidden />
            <h2>{t.close.h}</h2>
            <p>{t.close.sub}</p>
            <div className="cta-row">
              <a href="/signup" className="btn btn-lime btn-lg">
                {t.close.cta}
                <Icon name="arrow" />
              </a>
              <a href={waLink(lang === "ar" ? "السلام عليكم، عندي سؤال عن ركين" : "Hi, I have a question about Rakeen")} target="_blank" rel="noopener noreferrer" className="btn btn-glass btn-lg">
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
            <img src={wordmarkDark} alt={lang === "ar" ? "ركين" : "Rakeen"} />
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

      {/* phones only: the one action, always in reach */}
      <a href="/signup" className={"sticky-cta" + (sticky ? " show" : "")}>
        {t.sticky}
        <Icon name="arrow" />
      </a>
    </div>
  );
}
