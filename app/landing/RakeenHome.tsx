"use client";

/* الصفحة الرئيسية لـ rakeenapp.com (التصميم التحريري).
   - الأسعار والمزايا من lib/plans.ts مباشرة.
   - الكاشير الحي، الفاتورة، وبطاقات الولاء مكوّنات حقيقية من LandingPage.tsx.
   - الحلول حسب النشاط في SECTORS: إضافة نشاط جديد = عنصر جديد في المصفوفة.
   - أي عنصر عليه data-in لازم يبقى className ثابت (المراقب يضيف «in» باليد). */

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLANS, type Plan } from "@/lib/plans";
import { startWhatsAppLink } from "@/lib/signup";
import { APP_STORE, CARD_AR, CARD_EN, HeroCashier, ITEM_EN, LADDER, PLAN_EN, Receipt, Riyal, START, T, WA, WalletFan, includedCount } from "./LandingPage";
import "./rakeen-home.css";

type Lang = "ar" | "en";
type Period = "monthly" | "annual";
type L = { ar: string; en: string };

/* ---------- الحلول حسب النشاط ---------- */
type Sector = { k: string; name: L; wa: L; line: L; rows: { pain: L; fix: L }[]; plan: number };
const SECTORS: Sector[] = [
  {
    k: "rest",
    name: { ar: "المطاعم", en: "Restaurants" },
    wa: { ar: "عندي مطعم", en: "I run a restaurant" },
    line: { ar: "صالة مليانة، ومطبخ ما يغلط.", en: "A full house, and a kitchen that doesn't slip." },
    rows: [
      { pain: { ar: "الطلب يضيع بين الكاشير والمطبخ", en: "Orders get lost between cashier and kitchen" }, fix: { ar: "شاشة مطبخ وطباعة لكل قسم، والطلب يوصل لحظتها", en: "Kitchen screen and per-station printing, the moment it's rung up" } },
      { pain: { ar: "ما تعرف أي طبق يربّحك وأي طبق يخسّرك", en: "You can't tell which dish earns and which loses" }, fix: { ar: "تكلفة كل طبق من وصفته، وصافي ربحك بالريال", en: "Each dish costed from its recipe, net profit to the riyal" } },
      { pain: { ar: "الطاولات والحجوزات على الورق", en: "Tables and reservations live on paper" }, fix: { ar: "مخطط للصالة، حجوزات، وقائمة انتظار", en: "Floor plan, reservations and a waitlist" } },
    ],
    plan: 1,
  },
  {
    k: "cafe",
    name: { ar: "المقاهي", en: "Cafés" },
    wa: { ar: "عندي مقهى", en: "I run a café" },
    line: { ar: "طابور الصبح يمشي، والزبون يرجع بكرة.", en: "The morning line moves, and the customer is back tomorrow." },
    rows: [
      { pain: { ar: "زحمة وانتظار عند الكاونتر", en: "A crowd waiting at the counter" }, fix: { ar: "بيجر ركين: جوال الزبون يرن لما يجهز طلبه، بدون أجهزة نداء", en: "Rakeen Pager: the customer's phone rings when it's ready. No buzzers." } },
      { pain: { ar: "بطاقات الأختام الورقية تضيع", en: "Paper stamp cards get lost" }, fix: { ar: "بطاقة ولاء في Apple Wallet، تنضاف بمسحة", en: "A loyalty card in Apple Wallet, added with one scan" } },
      { pain: { ar: "الحليب والبن يخلصون فجأة", en: "Milk and beans run out by surprise" }, fix: { ar: "مخزون ينقص مع كل كوب، وتنبيه قبل ما يخلص", en: "Stock that drops with every cup, and a warning before it's gone" } },
    ],
    plan: 1,
  },
  {
    k: "truck",
    name: { ar: "الفود ترك", en: "Food trucks" },
    wa: { ar: "عندي فود ترك", en: "I run a food truck" },
    line: { ar: "جهاز واحد، ويشتغل وين ما وقفت.", en: "One device that works wherever you park." },
    rows: [
      { pain: { ar: "النت ضعيف في الفعاليات", en: "Weak signal at events" }, fix: { ar: "يبيع بدون إنترنت، ويرسل الطلبات لما يرجع", en: "Sells offline and syncs when the signal returns" } },
      { pain: { ar: "ما فيه مكان لكاشير وطابعة", en: "No room for a till and a printer" }, fix: { ar: "جهاز سنمي واحد بطابعته، أو جوالك", en: "A single SUNMI with its built-in printer, or your phone" } },
      { pain: { ar: "كل شوي أحد يسأل عن المنيو", en: "Everyone keeps asking for the menu" }, fix: { ar: "منيو أونلاين برمز QR، تعدّل السعر ويتحدّث بلحظته", en: "A QR menu that updates the instant you change a price" } },
    ],
    plan: 0,
  },
  {
    k: "cloud",
    name: { ar: "المطابخ السحابية", en: "Cloud kitchens" },
    wa: { ar: "عندي مطبخ سحابي", en: "I run a cloud kitchen" },
    line: { ar: "طلباتك لك، مو لتطبيقات التوصيل.", en: "Your orders are yours, not the delivery apps'." },
    rows: [
      { pain: { ar: "العمولات تاكل ربحك", en: "Commissions eat your margin" }, fix: { ar: "متجرك الإلكتروني: طلب مباشر ودفع بالبطاقة، بدون عمولة", en: "Your own store: direct orders, card payment, zero commission" } },
      { pain: { ar: "الزبون ما يعرف وين يطلب منك", en: "Customers don't know where to order" }, fix: { ar: "روابطك: صفحة وحدة للبايو فيها الطلب والواتساب والمنيو", en: "One bio page with ordering, WhatsApp and the menu" } },
      { pain: { ar: "كل قناة لها شاشة", en: "Every channel has its own screen" }, fix: { ar: "كل الطلبات تنزل على كاشير ومطبخ واحد", en: "Every order lands on one cashier and one kitchen" } },
    ],
    plan: 2,
  },
];
const SOON: L[] = [
  { ar: "المغاسل", en: "Laundries" },
  { ar: "الصالونات", en: "Salons" },
];

/* ---------- الحلول الأربعة الكبيرة ---------- */
type Core = { k: string; name: L; h: L; p: L; b: L[]; plan: L; alone: L };
const CORE: Core[] = [
  {
    k: "pos",
    name: { ar: "الكاشير", en: "Cashier" },
    h: { ar: "يبيع حتى لو طاح النت.", en: "Sells even when the internet drops." },
    p: { ar: "شاشة بيع سريعة على أي جهاز عندك، فاتورة ضريبية برمز QR، وإغلاق وردية بموازنة الكاش.", en: "A fast sales screen on any device you own, a QR tax invoice, and a shift close that balances the cash." },
    b: [
      { ar: "يكمل بدون إنترنت، ويرسل لما يرجع", en: "Keeps going offline, syncs when it's back" },
      { ar: "كاش، شبكة، ودفع مقسّم", en: "Cash, card and split payments" },
      { ar: "آيباد، أندرويد، كمبيوتر، وسنمي", en: "iPad, Android, computer and SUNMI" },
    ],
    plan: { ar: "في كل الباقات", en: "In every plan" },
    alone: { ar: "نظام كاشير وفوترة", en: "POS & invoicing" },
  },
  {
    k: "profit",
    name: { ar: "الأرباح والمخزون", en: "Profit & stock" },
    h: { ar: "تعرف ربحك بالريال، مو بالإحساس.", en: "Know your profit to the riyal, not by feel." },
    p: { ar: "ركين يحسب تكلفة كل طبق من وصفته، وينقّص المخزون مع كل بيعة، ويطلّع لك صافي الربح بعد المصاريف.", en: "Rakeen costs every dish from its recipe, draws stock down with each sale, and shows net profit after expenses." },
    b: [
      { ar: "تصوّر فاتورة المورد، ويقراها لك", en: "Snap a supplier invoice and it reads it" },
      { ar: "تنبيه قبل ما يخلص الصنف", en: "A warning before an item runs out" },
      { ar: "مصاريف، محاسبة، وتقارير Excel", en: "Expenses, accounting and Excel reports" },
    ],
    plan: { ar: "ضمن عماد وصرح", en: "In Emad and Sarh" },
    alone: { ar: "نظام مخزون ومحاسبة", en: "Inventory & accounting" },
  },
  {
    k: "store",
    name: { ar: "المتجر والمنيو", en: "Store & menu" },
    h: { ar: "يطلبون منك مباشرة. بدون عمولة.", en: "They order from you directly. No commission." },
    p: { ar: "متجر إلكتروني باسم محلك: توصيل أو استلام، ودفع بالبطاقة، والطلب ينزل على الكاشير والمطبخ على طول.", en: "An online store under your own name: delivery or pickup, card payment, and the order lands on the cashier and kitchen at once." },
    b: [
      { ar: "منيو QR يتحدّث مع الكاشير بنفس اللحظة", en: "A QR menu in sync with the cashier, instantly" },
      { ar: "عروض ومناسبات بتصاميم جاهزة", en: "Offers and occasions with ready designs" },
      { ar: "روابطك: صفحة وحدة لكل روابط محلك", en: "Links: one page for everything about your place" },
    ],
    plan: { ar: "المنيو في كل الباقات · المتجر في صرح", en: "Menu in every plan · Store in Sarh" },
    alone: { ar: "متجر إلكتروني للطلب", en: "Online ordering store" },
  },
  {
    k: "loyalty",
    name: { ar: "الولاء", en: "Loyalty" },
    h: { ar: "بطاقة ولاء في جوال عميلك.", en: "A loyalty card on your customer's phone." },
    p: { ar: "بدون تطبيق وبدون بطاقات ورقية: العميل يمسح، والبطاقة تنضاف لـ Apple Wallet، وكل زيارة تنحسب لحالها.", en: "No app and no paper cards: the customer scans, the card lands in Apple Wallet, and every visit counts itself." },
    b: [
      { ar: "تنبيه يوصله مع كل ختم", en: "A notification with every stamp" },
      { ar: "رسالة ترجّع اللي طوّل ما جاك", en: "A message that brings back the ones who drifted" },
      { ar: "بألوان وشعار محلك", en: "In your colours, with your logo" },
    ],
    plan: { ar: "ضمن عماد وصرح", en: "In Emad and Sarh" },
    alone: { ar: "برنامج ولاء وبطاقة محفظة", en: "Loyalty & wallet card" },
  },
];

/* ---------- ومعها ---------- */
const MORE: { n: L; d: L; plan: L }[] = [
  { n: { ar: "بيجر ركين", en: "Rakeen Pager" }, d: { ar: "جوال الزبون يرن لما يجهز طلبه. بدل أجهزة النداء.", en: "The customer's phone rings when the order's ready. No buzzers." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "شاشة المطبخ", en: "Kitchen screen" }, d: { ar: "الطلب يوصل المطبخ لحظة ما ينضرب.", en: "Orders reach the kitchen the moment they're rung up." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "شاشة العميل", en: "Customer display" }, d: { ar: "يشوف طلبه وباركود الولاء قدامه.", en: "They see their order and the loyalty barcode." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "الطاولات والحجوزات", en: "Tables & reservations" }, d: { ar: "مخطط الصالة، الحجوزات، وقائمة الانتظار.", en: "Floor plan, reservations and the waitlist." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "صلاحيات الموظفين", en: "Staff permissions" }, d: { ar: "كل موظف باسمه، وسجل لكل عملية.", en: "Every employee by name, every action logged." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "روابطك", en: "Links page" }, d: { ar: "صفحة روابط لمحلك في البايو، بثلاثة تصاميم.", en: "A link-in-bio page for your place, in three designs." }, plan: { ar: "عماد", en: "Emad" } },
  { n: { ar: "صفحة الحجز", en: "Booking page" }, d: { ar: "عملاؤك يحجزون موعدهم أونلاين.", en: "Customers book their slot online." }, plan: { ar: "صرح", en: "Sarh" } },
  { n: { ar: "الفروع", en: "Branches" }, d: { ar: "كل فروعك بحساب واحد، وتقرير لكل فرع.", en: "All branches in one account, a report for each." }, plan: { ar: "صرح", en: "Sarh" } },
];
const SHOTS: { src: string; cap: L }[] = [
  { src: "/landing/pager-ready.jpg", cap: { ar: "بيجر ركين", en: "Rakeen Pager" } },
  { src: "/landing/links-bold.jpg", cap: { ar: "روابطك", en: "Links page" } },
  { src: "/landing/app-menu.jpg", cap: { ar: "تطبيق الجوال", en: "Mobile app" } },
];

/* ---------- مثال الأرباح (توضيحي) ---------- */
const LEDGER: { n: L; v: number }[] = [
  { n: { ar: "المبيعات", en: "Sales" }, v: 48200 },
  { n: { ar: "تكلفة المواد", en: "Cost of goods" }, v: -17350 },
  { n: { ar: "الرواتب", en: "Payroll" }, v: -9800 },
  { n: { ar: "الإيجار", en: "Rent" }, v: -6000 },
  { n: { ar: "مصاريف أخرى", en: "Other expenses" }, v: -2150 },
];
const DISHES: { n: L; cost: number; price: number }[] = [
  { n: { ar: "برقر لحم", en: "Beef burger" }, cost: 11.4, price: 29 },
  { n: { ar: "سبانيش لاتيه", en: "Spanish latte" }, cost: 4.2, price: 17 },
  { n: { ar: "بطاطس", en: "Fries" }, cost: 2.1, price: 9 },
];

const C = {
  ar: {
    nav: { sectors: "الحلول", core: "المزايا", plans: "الباقات", faq: "الأسئلة", login: "دخول", start: "ابدأ مجانًا" },
    hero: {
      over: "نظام الكاشير والإدارة للمطاعم والمقاهي",
      h1a: "نظام واحد",
      h1b: "يشغّل محلك",
      h1c: "كله.",
      sub: "كاشير يبيع، وإدارة تعرّفك ربحك بالريال، ومتجر يجيب لك الطلب بدون عمولة، وولاء يرجّع عميلك. كلها ركين.",
      cta: "ابدأ مجانًا",
      cta2: "شوف الحلول",
      note: "أول 350 طلب مجانًا بكل المزايا. بدون بطاقة، وبدون عقد.",
    },
    facts: [
      { v: "99", u: "ريال", l: "يبدأ الاشتراك شهريًا" },
      { v: "350", u: "طلب", l: "مجانًا، بكل المزايا" },
      { v: "1", u: "يوم", l: "غالبًا وأنت تبيع" },
      { v: "0", u: "عمولة", l: "على طلبات متجرك" },
    ],
    sectors: { h: "حلول على مقاس نشاطك.", sub: "اختر نشاطك، وشوف وش يحل لك ركين بالضبط.", pain: "اللي يصير عندك", fix: "في ركين", fit: "الباقة اللي تكفيك", from: "شهريًا", go: "ابدأ مجانًا", soon: "قريبًا" },
    core: { h: "أربعة أشياء يقوم عليها محلك.", sub: "كل وحدة منها تُباع في السوق نظامًا لحالها. في ركين هي نظام واحد.", alone: "يُباع لحاله:", ex: "أرقام توضيحية", net: "صافي الربح", month: "هذا الشهر", dish: "الطبق", cost: "التكلفة", price: "السعر", margin: "الهامش", offline: "بدون اتصال · الطلبات محفوظة" },
    more: { h: "ومعها، كل اللي يحتاجه يومك.", app: "وتطبيق ركين على الآيفون والأندرويد: مبيعات اليوم وأنت برا المحل.", ios: "App Store", android: "أندرويد" },
    bill: {
      h1: "ستة أنظمة.",
      h2: "اشتراك واحد.",
      p: "كل نظام من هذي يُباع في السوق باشتراك لحاله، وبعضها يوصل 1,000 ريال بالشهر. في ركين كلها نظام واحد: بيانات وحدة، وفاتورة وحدة، ورقم دعم واحد.",
      title: "لو اشتريتها متفرقة",
      rows: ["نظام كاشير وفوترة ضريبية", "مخزون وتكاليف ومحاسبة", "متجر إلكتروني للطلب المباشر", "برنامج ولاء وبطاقة محفظة", "أجهزة نداء للطلبات", "منيو QR وصفحة روابط"],
      each: "اشتراك مستقل",
      sum: "المجموع",
      sumV: "6 اشتراكات · 6 شركات",
      ours: "في ركين · باقة صرح",
      oursS: "الستة كلها، في اشتراك واحد",
      low: "وتبدأ من 99 ريال مع باقة أساس.",
    },
    plans: { h: "ثلاث باقات. وتكبر معك.", sub: "ابدأ بأي باقة، ورقّها متى ما احتجت. والمزايا تنفتح على طول.", m: "شهري", y: "سنوي", save: "شهرين مجانًا", all: "قارن كل المزايا في واتساب" },
    close: { h: "جرّب ركين على أول 350 طلب.", p: "بدون بطاقة، وبدون عقد. وإذا ما ناسبك، ما عليك شي.", cta: "ابدأ مجانًا", wa: "أو كلّمنا واتساب" },
    sticky: "ابدأ مجانًا — أول 350 طلب",
  },
  en: {
    nav: { sectors: "Solutions", core: "Features", plans: "Plans", faq: "FAQ", login: "Log in", start: "Start free" },
    hero: {
      over: "The cashier and management system for restaurants and cafés",
      h1a: "One system",
      h1b: "runs your",
      h1c: "whole place.",
      sub: "A cashier that sells, management that shows your profit to the riyal, a store that brings orders with no commission, and loyalty that brings customers back. All of it is Rakeen.",
      cta: "Start free",
      cta2: "See solutions",
      note: "Your first 350 orders are free, every feature included. No card, no contract.",
    },
    facts: [
      { v: "99", u: "SAR", l: "a month to start" },
      { v: "350", u: "orders", l: "free, every feature" },
      { v: "1", u: "day", l: "usually, and you're selling" },
      { v: "0", u: "commission", l: "on your store's orders" },
    ],
    sectors: { h: "Solutions cut to your business.", sub: "Pick your business and see exactly what Rakeen solves.", pain: "What happens today", fix: "With Rakeen", fit: "The plan that fits", from: "a month", go: "Start free", soon: "Soon" },
    core: { h: "Four things your place stands on.", sub: "Each is sold on the market as a system of its own. In Rakeen they are one.", alone: "Sold alone as:", ex: "Illustrative figures", net: "Net profit", month: "This month", dish: "Dish", cost: "Cost", price: "Price", margin: "Margin", offline: "Offline · orders saved" },
    more: { h: "And everything else your day needs.", app: "Plus the Rakeen app on iPhone and Android: today's sales while you're away.", ios: "App Store", android: "Android" },
    bill: {
      h1: "Six systems.",
      h2: "One subscription.",
      p: "Each of these is sold on its own subscription, and some reach SAR 1,000 a month. In Rakeen they are one system: one set of data, one invoice, one support number.",
      title: "If you bought them apart",
      rows: ["POS & tax invoicing", "Inventory, costing & accounting", "Online store for direct orders", "Loyalty & wallet card", "Order pagers", "QR menu & links page"],
      each: "separate subscription",
      sum: "Total",
      sumV: "6 subscriptions · 6 vendors",
      ours: "Rakeen · Sarh plan",
      oursS: "All six, in one subscription",
      low: "And it starts at SAR 99 with the Asas plan.",
    },
    plans: { h: "Three plans that grow with you.", sub: "Start on any plan and upgrade when you need to. Features unlock right away.", m: "Monthly", y: "Annual", save: "2 months free", all: "Compare every feature on WhatsApp" },
    close: { h: "Try Rakeen on your first 350 orders.", p: "No card, no contract. If it's not for you, you owe nothing.", cta: "Start free", wa: "Or message us on WhatsApp" },
    sticky: "Start free — first 350 orders",
  },
};

const Arrow = () => (
  <svg className="h-arr" viewBox="0 0 24 24" aria-hidden>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const Tick = () => (
  <svg className="h-tick" viewBox="0 0 24 24" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const fmt = (n: number) => Math.abs(n).toLocaleString("en-US");

export default function RakeenHome() {
  const [lang, setLang] = useState<Lang>("ar");
  const [period, setPeriod] = useState<Period>("monthly");
  const [sector, setSector] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [qr, setQr] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const c = C[lang];
  const t = T[lang];
  const ar = lang === "ar";
  const tr = (l: L) => l[lang];
  const planName = (p: Plan) => (ar ? p.name : PLAN_EN[p.key].name);
  const card = (s: string) => (ar ? CARD_AR[s] || s : CARD_EN[s] || ITEM_EN[s] || s).split(":")[0];

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
    document.documentElement.dir = ar ? "rtl" : "ltr";
    try {
      localStorage.setItem("rk_lang", lang);
    } catch {}
  }, [lang, ar]);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setSticky(window.scrollY > 640 && window.scrollY < document.documentElement.scrollHeight - window.innerHeight - 500);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // reveal: the observer adds «in» by hand, so data-in elements keep a fixed className
  useEffect(() => {
    const els = root.current?.querySelectorAll("[data-in]");
    if (!els) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const go = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const s = SECTORS[sector];
  const sPlan = PLANS[s.plan];
  const net = LEDGER.reduce((a, r) => a + r.v, 0);
  const wordmark = ar ? "/brand/rakeen-wordmark-deep.png" : "/brand/rakeen-wordmark-en-deep.png";
  const wordmarkLight = ar ? "/brand/rakeen-wordmark.png" : "/brand/rakeen-wordmark-en.png";

  const visual = (k: string) => {
    if (k === "pos")
      return (
        <div className="h-vis h-vis-pos">
          <div className="h-rcpt">
            <Receipt lang={lang} qr={qr} />
          </div>
          <span className="h-off">
            <i />
            {c.core.offline}
          </span>
        </div>
      );
    if (k === "profit")
      return (
        <div className="h-vis h-vis-ledger">
          <div className="h-ledger">
            <div className="h-ledger-h">
              <b>{c.core.net}</b>
              <span>{c.core.month}</span>
            </div>
            {LEDGER.map((r) => (
              <div className="h-lrow" key={r.n.en}>
                <span>{tr(r.n)}</span>
                <i />
                <b className="mono">
                  {r.v < 0 ? "−" : ""}
                  {fmt(r.v)}
                </b>
              </div>
            ))}
            <div className="h-lnet">
              <span>{c.core.net}</span>
              <b className="mono">
                <Riyal /> {fmt(net)}
              </b>
            </div>
            <table className="h-dishes">
              <thead>
                <tr>
                  <th>{c.core.dish}</th>
                  <th>{c.core.cost}</th>
                  <th>{c.core.price}</th>
                  <th>{c.core.margin}</th>
                </tr>
              </thead>
              <tbody>
                {DISHES.map((d) => (
                  <tr key={d.n.en}>
                    <td>{tr(d.n)}</td>
                    <td className="mono">{d.cost.toFixed(2)}</td>
                    <td className="mono">{d.price}</td>
                    <td className="mono">{Math.round(((d.price - d.cost) / d.price) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="h-ex">{c.core.ex}</small>
        </div>
      );
    if (k === "store")
      return (
        <div className="h-vis h-vis-store">
          <div className="h-phone h-phone-a">
            <img src="/landing/store-anoob.jpg" alt={tr(CORE[2].name)} loading="lazy" />
          </div>
          <div className="h-phone h-phone-b">
            <img src="/landing/menu-hbiah.jpg" alt={tr(CORE[2].name)} loading="lazy" />
          </div>
        </div>
      );
    return (
      <div className="h-vis h-vis-wallet">
        <WalletFan qr={qr} lang={lang} />
      </div>
    );
  };

  return (
    <div className="rk r3" ref={root}>
      {/* ---------- nav ---------- */}
      <header className="h-nav" data-s={scrolled ? "" : undefined}>
        <div className="h-wrap h-nav-in">
          <a href="#top" onClick={go("top")} className="h-logo">
            <img src={wordmark} alt={ar ? "ركين" : "Rakeen"} />
          </a>
          <nav className="h-links">
            <a href="#sectors" onClick={go("sectors")}>{c.nav.sectors}</a>
            <a href="#core" onClick={go("core")}>{c.nav.core}</a>
            <a href="#plans" onClick={go("plans")}>{c.nav.plans}</a>
            <a href="#faq" onClick={go("faq")}>{c.nav.faq}</a>
          </nav>
          <div className="h-nav-act">
            <button className="h-lang mono" onClick={() => setLang(ar ? "en" : "ar")} aria-label={ar ? "English" : "العربية"}>
              {ar ? "EN" : "ع"}
            </button>
            <a href="/dashboard" className="h-login">{c.nav.login}</a>
            <a href={START} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-ink h-btn-sm">{c.nav.start}</a>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="h-hero" id="top">
        <div className="h-wrap h-hero-in">
          <div className="h-hero-copy">
            <p className="h-over">{c.hero.over}</p>
            <h1>
              {c.hero.h1a}
              <br />
              {c.hero.h1b} <span className="h-mark">{c.hero.h1c}</span>
            </h1>
            <p className="h-sub">{c.hero.sub}</p>
            <div className="h-cta">
              <a href={START} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-lime h-btn-lg">
                {c.hero.cta}
                <Arrow />
              </a>
              <a href="#sectors" onClick={go("sectors")} className="h-link">{c.hero.cta2}</a>
            </div>
            <p className="h-note">{c.hero.note}</p>
          </div>
          <div className="h-hero-art" key={"art" + lang}>
            <HeroCashier lang={lang} />
          </div>
        </div>
        <div className="h-wrap">
          <dl className="h-facts">
            {c.facts.map((f) => (
              <div key={f.l}>
                <dt>
                  <b className="mono">{f.v}</b>
                  <span>{f.u}</span>
                </dt>
                <dd>{f.l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- 01 حسب نشاطك ---------- */}
      <section className="h-sec" id="sectors">
        <div className="h-wrap">
          <header className="h-head" data-in>
            <span className="h-idx mono">01</span>
            <h2>{c.sectors.h}</h2>
            <p>{c.sectors.sub}</p>
          </header>
          <div className="h-sectors" data-in>
            <div className="h-tabs" role="tablist">
              {SECTORS.map((x, i) => (
                <button key={x.k} role="tab" aria-selected={i === sector} onClick={() => setSector(i)}>
                  {tr(x.name)}
                </button>
              ))}
              {SOON.map((x) => (
                <span key={x.en} className="h-soon">
                  {tr(x)}
                  <em>{c.sectors.soon}</em>
                </span>
              ))}
            </div>
            <div className="h-panel" role="tabpanel" key={s.k + lang}>
              <h3>{tr(s.line)}</h3>
              <div className="h-rows">
                <div className="h-row h-row-h">
                  <span>{c.sectors.pain}</span>
                  <span>{c.sectors.fix}</span>
                </div>
                {s.rows.map((r) => (
                  <div className="h-row" key={r.pain.en}>
                    <span>{tr(r.pain)}</span>
                    <b>{tr(r.fix)}</b>
                  </div>
                ))}
              </div>
              <div className="h-fit">
                <div>
                  <span>{c.sectors.fit}</span>
                  <p>
                    <b>{planName(sPlan)}</b>
                    <Riyal /> <b className="mono">{sPlan.monthly}</b> <small>{c.sectors.from}</small>
                  </p>
                </div>
                <a href={startWhatsAppLink(ar ? `السلام عليكم، ${s.wa.ar} وأبي أبدأ مع ركين` : `Hi, ${s.wa.en} and I'd like to start with Rakeen`)} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-ink">
                  {c.sectors.go}
                  <Arrow />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 02 الحلول الأربعة ---------- */}
      <section className="h-sec h-core" id="core">
        <div className="h-wrap">
          <header className="h-head" data-in>
            <span className="h-idx mono">02</span>
            <h2>{c.core.h}</h2>
            <p>{c.core.sub}</p>
          </header>
          {CORE.map((x, i) => (
            <article className="h-sol" key={x.k} id={"core-" + x.k}>
              <div className="h-sol-copy" data-in>
                <p className="h-sol-n">
                  <span className="mono">0{i + 1}</span>
                  {tr(x.name)}
                </p>
                <h3>{tr(x.h)}</h3>
                <p className="h-sol-p">{tr(x.p)}</p>
                <ul className="h-list">
                  {x.b.map((b) => (
                    <li key={b.en}>
                      <Tick />
                      {tr(b)}
                    </li>
                  ))}
                </ul>
                <dl className="h-meta">
                  <div>
                    <dt>{c.core.alone}</dt>
                    <dd>{tr(x.alone)}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "في ركين:" : "In Rakeen:"}</dt>
                    <dd>{tr(x.plan)}</dd>
                  </div>
                </dl>
              </div>
              <div className="h-sol-art" data-in>
                {visual(x.k)}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- 03 ومعها ---------- */}
      <section className="h-sec" id="more">
        <div className="h-wrap">
          <header className="h-head" data-in>
            <span className="h-idx mono">03</span>
            <h2>{c.more.h}</h2>
          </header>
          <div className="h-more">
            <ul className="h-more-list" data-in>
              {MORE.map((m) => (
                <li key={m.n.en}>
                  <b>{tr(m.n)}</b>
                  <span>{tr(m.d)}</span>
                  <em>{tr(m.plan)}</em>
                </li>
              ))}
            </ul>
            <div className="h-shots" data-in>
              {SHOTS.map((x) => (
                <figure key={x.src}>
                  <div className="h-phone">
                    <img src={x.src} alt={tr(x.cap)} loading="lazy" />
                  </div>
                  <figcaption>{tr(x.cap)}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div className="h-app" data-in>
            <p>{c.more.app}</p>
            <div>
              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-line h-btn-sm">{c.more.ios}</a>
              <a href="/android" className="h-btn h-btn-line h-btn-sm">{c.more.android}</a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 04 الفاتورة ---------- */}
      <section className="h-bill" id="value">
        <div className="h-wrap h-bill-in">
          <div className="h-bill-copy" data-in>
            <span className="h-idx mono">04</span>
            <h2>
              {c.bill.h1}
              <br />
              <span className="h-mark">{c.bill.h2}</span>
            </h2>
            <p>{c.bill.p}</p>
            <a href={START} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-lime h-btn-lg">
              {c.hero.cta}
              <Arrow />
            </a>
          </div>
          <div className="h-slip" data-in>
            <p className="h-slip-t">{c.bill.title}</p>
            <ol>
              {c.bill.rows.map((r, i) => (
                <li key={r}>
                  <span className="mono">{i + 1}</span>
                  <b>{r}</b>
                  <em>{c.bill.each}</em>
                </li>
              ))}
            </ol>
            <div className="h-slip-sum">
              <span>{c.bill.sum}</span>
              <b>{c.bill.sumV}</b>
            </div>
            <div className="h-slip-ours">
              <div>
                <b>{c.bill.ours}</b>
                <span>{c.bill.oursS}</span>
              </div>
              <p>
                <Riyal /> <b className="mono">{PLANS[2].monthly}</b>
                <small>{t.plans.perMonth}</small>
              </p>
            </div>
            <p className="h-slip-low">{c.bill.low}</p>
          </div>
        </div>
      </section>

      {/* ---------- 05 الباقات ---------- */}
      <section className="h-sec" id="plans">
        <div className="h-wrap">
          <header className="h-head" data-in>
            <span className="h-idx mono">05</span>
            <h2>{c.plans.h}</h2>
            <p>{c.plans.sub}</p>
          </header>
          <div className="h-period" role="group">
            <button aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")}>{c.plans.m}</button>
            <button aria-pressed={period === "annual"} onClick={() => setPeriod("annual")}>
              {c.plans.y}
              <em>{c.plans.save}</em>
            </button>
          </div>
          <div className="h-plans" data-in>
            {PLANS.map((p, i) => (
              <article key={p.key} className={"h-plan h-plan-" + p.key}>
                {p.key === "emad" && <span className="h-pop">{t.plans.popular}</span>}
                <h3>{planName(p)}</h3>
                <p className="h-plan-tag">{ar ? p.tagline : PLAN_EN[p.key].tagline}</p>
                <p className="h-price">
                  <Riyal />
                  <b className="mono">{(period === "annual" ? p.annual : p.monthly).toLocaleString("en-US")}</b>
                  <span>{period === "annual" ? t.plans.perYear : t.plans.perMonth}</span>
                </p>
                <p className="h-plan-br">
                  {t.plans.branches(p.includedBranches)} · {t.plans.extra(String(period === "annual" ? p.extraBranchAnnual : p.extraBranchMonthly))}
                </p>
                <a href={startWhatsAppLink(ar ? `السلام عليكم، أبي أبدأ مع ركين بباقة ${p.name}` : `Hi, I'd like to start with Rakeen on the ${PLAN_EN[p.key].name} plan`)} target="_blank" rel="noopener noreferrer" className={"h-btn " + (p.key === "emad" ? "h-btn-lime" : "h-btn-line")}>
                  {t.plans.choose}
                </a>
                <p className="h-plan-inh">{i > 0 ? t.plans.everything(planName(PLANS[i - 1])) : t.plans.count(includedCount(0))}</p>
                <ul className="h-list h-plan-list">
                  {LADDER[i].map((x) => (
                    <li key={x}>
                      <Tick />
                      {card(x)}
                    </li>
                  ))}
                </ul>
                {p.key === "sarh" && (
                  <p className="h-carry">
                    <b>{t.plans.carry(planName(PLANS[i - 1]), includedCount(i - 1))}</b>
                    {LADDER.slice(0, i).flat().map(card).join(ar ? "، " : ", ")}
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="h-plans-note">{c.hero.note}</p>
        </div>
      </section>

      {/* ---------- 06 كيف تبدأ + الأسئلة ---------- */}
      <section className="h-sec" id="start">
        <div className="h-wrap">
          <header className="h-head" data-in>
            <span className="h-idx mono">06</span>
            <h2>{t.steps.h}</h2>
          </header>
          <ol className="h-steps" data-in>
            {t.steps.items.map((x, i) => (
              <li key={x.h}>
                <span className="mono">{i + 1}</span>
                <h3>{x.h}</h3>
                <p>{x.p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="h-sec h-faq-sec" id="faq">
        <div className="h-wrap h-faq">
          <header className="h-faq-h" data-in>
            <span className="h-idx mono">07</span>
            <h2>{t.faq.h}</h2>
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" className="h-link">{c.close.wa.replace(/^(أو |Or )/, "")}</a>
          </header>
          <div className="h-faq-list" data-in>
            {t.faq.items.map((f, i) => (
              <div key={f.q} className="h-q" data-open={open === i ? "" : undefined}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {f.q}
                  <i aria-hidden />
                </button>
                <div className="h-a">
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- close ---------- */}
      <section className="h-close">
        <div className="h-wrap" data-in>
          <h2>{c.close.h}</h2>
          <p>{c.close.p}</p>
          <div className="h-cta">
            <a href={START} target="_blank" rel="noopener noreferrer" className="h-btn h-btn-ink h-btn-lg">
              {c.close.cta}
              <Arrow />
            </a>
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" className="h-link">{c.close.wa}</a>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="h-foot">
        <div className="h-wrap h-foot-in">
          <div className="h-foot-brand">
            <img src={wordmarkLight} alt={ar ? "ركين" : "Rakeen"} />
            <span>{t.footer.tag}</span>
          </div>
          <nav>
            <a href="#sectors" onClick={go("sectors")}>{c.nav.sectors}</a>
            <a href="#core" onClick={go("core")}>{c.nav.core}</a>
            <a href="#plans" onClick={go("plans")}>{c.nav.plans}</a>
            <a href="/privacy">{t.footer.privacy}</a>
            <a href="/terms">{t.footer.terms}</a>
          </nav>
          <div className="h-foot-contact">
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" className="mono">055 744 4227</a>
            <a href="mailto:support@rakeenapp.com">support@rakeenapp.com</a>
          </div>
        </div>
        <div className="h-wrap h-foot-b">{t.footer.rights}</div>
      </footer>

      {/* phones only */}
      <a href={START} target="_blank" rel="noopener noreferrer" className="h-sticky" data-show={sticky ? "" : undefined}>
        {c.sticky}
        <Arrow />
      </a>
    </div>
  );
}
