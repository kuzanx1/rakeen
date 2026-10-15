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

// Apple Wallet passes, as the real ones are built: lib/wallet-pass.ts
// (storeCard: logo + header field, strip, name + "left", QR with its code)
// and lib/wallet-strip.ts (stamps on a strip that is the card colour 80%
// darker, a photo under a scrim, or a gradient; points get the wave). Logos
// and banners are real uploads.
const LB = "https://media.rakeenapp.com/loyalty-branding/1/";
// Same stamp shapes as the dashboard preview (RKW_STAMP_PATHS).
const STAMP: Record<string, string> = {
  generic: "M12 2.6 L14.5 9.2 L21.4 9.2 L15.9 13.3 L18 20 L12 15.9 L6 20 L8.1 13.3 L2.6 9.2 L9.5 9.2 Z",
  coffee: "M4.8 5 H17.2 L15.6 20 H6.4 Z M3.4 2.2 H18.6 V4.6 H3.4 Z",
  burger: "M2 9.4 A10 6.4 0 0 1 22 9.4 Z M2.4 11.4 H21.6 V14.2 H2.4 Z M2.4 16 H21.6 A9.6 5 0 0 1 2.4 16 Z",
  pastry: "M17.4 2.4 A10.6 10.6 0 0 0 17.4 21.6 A8 10 0 1 1 17.4 2.4 Z",
};
type WPass = {
  key: string;
  brand: string;
  logo: string;
  bg: string;
  strip: string; // CSS background of the strip
  stripImg?: string;
  scrim?: number;
  stamp?: keyof typeof STAMP;
  stampOn: string;
  done: number;
  of: number;
  points?: number;
  tier?: string;
  customer: string;
  reward: string;
  code: string;
};
const WALLET: WPass[] = [
  { key: "anoob", brand: "عنوب", logo: LB + "logo-1786634917576.png", bg: "#17331C", strip: "#0b160c", stripImg: LB + "banner-1786634918047.jpeg", scrim: 0.5, stamp: "generic", stampOn: "#C4FF2B", done: 5, of: 8, customer: "خالد الحربي", reward: "بوكس مجاني", code: "A3F19C42" },
  { key: "aldan", brand: "ألدان", logo: LB + "logo-1786637275028.png", bg: "#5C1010", strip: "linear-gradient(131deg,#1f0505,#6e1812)", stamp: "coffee", stampOn: "#F3DDB5", done: 4, of: 6, customer: "منال القحطاني", reward: "قهوة مجانية", code: "7C21D0E9" },
  { key: "pass", brand: "PASS", logo: LB + "logo-1786636378234.png", bg: "#3E5654", strip: "#0d1211", stampOn: "#BFE3D3", done: 0, of: 0, points: 1280, tier: "Platinum", customer: "فهد العتيبي", reward: "مشروب مجاني", code: "5B8E04AF" },
  { key: "bunzo", brand: "Bunzo's", logo: LB + "logo-1786637601603.png", bg: "#B8302F", strip: "#250a09", stripImg: LB + "banner-1786637602818.png", scrim: 0.64, stamp: "burger", stampOn: "#FFFFFF", done: 3, of: 6, customer: "نورة الدوسري", reward: "برقر مجاني", code: "E40B9C17" },
];
const lumOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
};

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
        p: "بطاقة بهويتك في Apple Wallet، بدون تطبيق. كل زيارة تنضاف لحالها، ويوصله تنبيه على شاشة جواله.",
        b: ["أختام أو نقاط بتصميمك", "تنبيه على الشاشة المقفلة", "تذكير لما يقرب من فرعك"],
        real: "بطاقات Apple Wallet بنفس شكلها في جوال العميل",
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
        p: "A card in your brand in Apple Wallet, no app. Every visit adds itself, with a nudge on their lock screen.",
        b: ["Stamps or points in your design", "Lock-screen notifications", "A reminder when they're near a branch"],
        real: "Apple Wallet passes, exactly as they look on the customer's phone",
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

/* One Apple Wallet store card, laid out like the dashboard's preview
   (walletCardPreviewHtml) and the pass the server signs: system font, the
   wallet's own field sizes, stamps filled from the right. */
function WalletPass({ p, qr }: { p: WPass; qr: string }) {
  const light = lumOf(p.bg) > 150;
  const fg = light ? "rgb(20,19,14)" : "#fff";
  const faint = light ? "rgba(20,19,14,.58)" : "rgba(255,255,255,.6)";
  const off = light ? "rgba(20,19,14,.34)" : "rgba(255,255,255,.4)";
  const stamps = !p.points;
  const rows = p.of > 7 ? 2 : 1;
  const per = Math.ceil(p.of / rows);
  const left = p.of - p.done;
  return (
    <div className="wp" style={{ background: p.bg, color: fg }}>
      <div className="wp-head">
        <img className="wp-logo" src={p.logo} alt="" />
        <span className="wp-name">{p.tier ? "" : p.brand}</span>
        <div className="wp-hfields">
          {p.tier && (
            <div className="wp-f">
              <small style={{ color: faint }}>مستواك</small>
              <b>{p.tier}</b>
            </div>
          )}
          <div className="wp-f">
            <small style={{ color: faint }}>{stamps ? (p.stamp === "coffee" ? "ختومك" : "زياراتك") : "نقاطك"}</small>
            <b>{stamps ? `${p.done} / ${p.of}` : p.points!.toLocaleString("en-US")}</b>
          </div>
        </div>
      </div>
      <div className="wp-strip" style={{ background: p.strip }}>
        {p.stripImg && (
          <>
            <img className="wp-strip-img" src={p.stripImg} alt="" />
            <i className="wp-scrim" style={{ background: `rgba(8,8,10,${p.scrim ?? 0.34})` }} />
          </>
        )}
        {stamps ? (
          <div className="wp-stamps" style={{ gridTemplateColumns: `repeat(${per}, auto)` }}>
            {Array.from({ length: p.of }).map((_, i) => {
              const on = i < p.done;
              return (
                <svg key={i} viewBox="0 0 24 24" className={on ? "on" : ""}>
                  <path d={STAMP[p.stamp || "generic"]} fill={on ? p.stampOn : "none"} stroke={on ? p.stampOn : off} strokeWidth={on ? 0 : 1.9} strokeLinejoin="round" fillRule="evenodd" />
                </svg>
              );
            })}
          </div>
        ) : (
          <svg viewBox="0 0 375 123" preserveAspectRatio="none" className="wp-wave">
            <path d="M0 78 C 60 56, 110 98, 170 74 S 300 50, 375 68 L375 123 L0 123 Z" fill={p.stampOn} opacity=".13" />
            <path d="M0 78 C 60 56, 110 98, 170 74 S 300 50, 375 68" fill="none" stroke={p.stampOn} strokeWidth="3.4" opacity=".8" />
          </svg>
        )}
      </div>
      <div className="wp-fields">
        <div className="wp-f">
          <small style={{ color: faint }}>اسمك</small>
          <b>{p.customer}</b>
        </div>
        <div className="wp-f wp-end">
          <small style={{ color: faint }}>{stamps ? "باقي" : "مكافأتك"}</small>
          <b>{stamps ? left : p.reward}</b>
        </div>
      </div>
      <div className="wp-qr">
        <div className="wp-qr-box" dangerouslySetInnerHTML={{ __html: qr }} />
        <span style={{ color: faint }}>{p.code}</span>
      </div>
    </div>
  );
}

/* The iPhone Wallet app: the other passes stack above as their header
   strips, the chosen one opens in front. It moves through them by itself
   and a tap picks one. */
function WalletStack({ qr, lang }: { qr: string; lang: Lang }) {
  const [front, setFront] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFront((f) => (f + 1) % WALLET.length), 3600);
    return () => window.clearInterval(id);
  }, [hold]);
  const order = WALLET.map((_, i) => (front + 1 + i) % WALLET.length).slice(0, WALLET.length - 1);
  const p = WALLET[front];
  const left = p.of - p.done;
  return (
    <div className="wallet-scene">
      <div className="iphone wallet-phone">
        <div className="wallet-screen" dir="rtl">
          <div className="wl-top">
            <span>Wallet</span>
            <i>+</i>
          </div>
          <div className="wl-stack">
            {order.map((i) => {
              const q = WALLET[i];
              const light = lumOf(q.bg) > 150;
              return (
                <button key={q.key} className="wl-peek" style={{ background: q.bg, color: light ? "#14130e" : "#fff" }} onClick={() => { setFront(i); setHold(true); }} aria-label={q.brand}>
                  <img src={q.logo} alt="" />
                  <span>{q.brand}</span>
                  <b>{q.points ? q.points.toLocaleString("en-US") : `${q.done} / ${q.of}`}</b>
                </button>
              );
            })}
            <div className="wl-front" key={p.key}>
              <WalletPass p={p} qr={qr} />
            </div>
          </div>
        </div>
      </div>
      <div className="lock-note" key={"n" + p.key}>
        <img src={p.logo} alt="" />
        <div>
          <div className="ln-top">
            <b>{p.brand}</b>
            <span>{lang === "ar" ? "الآن" : "now"}</span>
          </div>
          <p>{p.points ? (lang === "ar" ? `عدّادك صار ${p.points.toLocaleString("en-US")} ☕` : `You're now at ${p.points.toLocaleString("en-US")} ☕`) : lang === "ar" ? `باقي لك ${left} على مكافأتك 🎁` : `${left} to go until your reward 🎁`}</p>
        </div>
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
            <WalletStack qr={qr} lang={lang} />
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
