"use client";

/* الصفحة الرئيسية لـ rakeenapp.com.
   - الأسعار والمزايا من lib/plans.ts مباشرة (نفس عرض السعر والعقد واللوحة).
   - بطاقة الولاء = نسخة من البطاقة الحقيقية (app/loyalty-card/[token]، الثيم
     الكلاسيكي) بنفس الأيقونات والألوان والمقاسات، مو رسمة.
   - المتجر = لقطة حقيقية من متجر عنوب (public/landing/store-anoob.jpg،
     تنعاد بـ scratchpad/shot-store.cjs لو تغيّر شكل المتجر).
   الصفحة القديمة محفوظة على /classic. */

import { Fragment, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLANS, type Plan, type PlanItem } from "@/lib/plans";
import { startWhatsAppLink } from "@/lib/signup";
import "./rakeen-landing.css";

type Lang = "ar" | "en";
type Period = "monthly" | "annual";

const WA = "966557444227";
// No self sign-up for now (lib/signup.ts): every "start" opens WhatsApp.
const START = startWhatsAppLink();
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

// Apple Wallet passes, laid out the way the real ones are built:
// lib/wallet-pass.ts (storeCard: logo + header field, strip, name + "left",
// QR with its code) and lib/wallet-strip.ts (strip colour, photo stamps for
// a business that uploads its own, empty stamps greyed out, a wave or lines
// for points). هَبيّة is a real Rakeen cafe: its mark and cups come from its
// own store (hbiah.rakeenapp.com). The rest are made-up examples.
type Art = "cup" | "croissant" | "burger";
type WPass = {
  key: string;
  logo: React.ReactNode;
  bg: string;
  strip: string; // CSS background of the strip
  stampImg?: string; // a photo stamp, like a business uploads
  art?: Art; // or a drawn one
  artColors?: [string, string, string];
  lines?: string; // points card: a guilloche of fine lines in this colour
  done: number;
  of: number;
  progressLabel?: string;
  leftLabel?: string;
  points?: number;
  tier?: string;
  customer: string;
  reward: string;
  code: string;
  note: { brand: string; icon: string; ar: string; en: string };
};
const WALLET: WPass[] = [
  {
    key: "hbiah",
    logo: (
      <span className="lg lg-hbiah">
        <b>هَبيّة</b>
        <small>HBIAH</small>
      </span>
    ),
    bg: "#B7834A",
    strip: "#B7834A",
    done: 2,
    of: 5,
    progressLabel: "كم كوب",
    leftLabel: "متبقي لكوبك المجاني",
    customer: "Mohammed",
    reward: "قهوة مجانية",
    code: "F2ABA3D4",
    note: { brand: "هَبيّة", icon: "/landing/hbiah-mark.png", ar: "باقي لك 3 على كوبك المجاني ☕", en: "3 to go until your free coffee ☕" },
  },
  {
    key: "sana",
    logo: (
      <span className="lg lg-sana">
        <b>سَنا</b>
        <small>SANA COFFEE</small>
      </span>
    ),
    bg: "#1E3A2B",
    strip: "#1E3A2B",
    art: "cup",
    artColors: ["#F4EEDF", "#2F5A43", "#E8DCC0"],
    done: 3,
    of: 6,
    progressLabel: "ختومك",
    customer: "ريم",
    reward: "قهوة مجانية",
    code: "530912",
    note: { brand: "سَنا", icon: "", ar: "عدّادك صار 3 ☕", en: "You're now at 3 ☕" },
  },
  {
    key: "noir",
    logo: (
      <span className="lg lg-noir">
        <b>NOIR.</b>
      </span>
    ),
    bg: "#121214",
    strip: "#121214",
    lines: "rgba(255,255,255,.42)",
    done: 0,
    of: 0,
    points: 1440,
    tier: "Platinum",
    customer: "فهد العتيبي",
    reward: "عشاء لشخصين",
    code: "NR0042",
    note: { brand: "NOIR.", icon: "", ar: "عدّادك صار 1,440 ✨", en: "You're now at 1,440 ✨" },
  },
  {
    key: "waraq",
    logo: (
      <span className="lg lg-waraq">
        <b>وَرَق</b>
        <small>BAKERY</small>
      </span>
    ),
    bg: "#ECE5D3",
    strip: "#E3DAC3",
    art: "croissant",
    artColors: ["#D79A4E", "#A8642A", "#F2C98B"],
    done: 5,
    of: 8,
    progressLabel: "ختومك",
    customer: "سارة",
    reward: "كرواسون مجاني",
    code: "771904",
    note: { brand: "وَرَق", icon: "", ar: "باقي لك 3 على مكافأتك 🥐", en: "3 to go until your reward 🥐" },
  },
  {
    key: "brgr",
    logo: (
      <span className="lg lg-brgr">
        <b>BRGR.</b>
      </span>
    ),
    bg: "#C8231C",
    strip: "repeating-conic-gradient(#b81f19 0 25%, #c8231c 0 50%) 0 0/22px 22px",
    art: "burger",
    artColors: ["#F7D38A", "#5B2A12", "#7CB342"],
    done: 2,
    of: 6,
    progressLabel: "زياراتك",
    customer: "نورة",
    reward: "برقر مجاني",
    code: "290377",
    note: { brand: "BRGR.", icon: "", ar: "باقي لك 4 على مكافأتك 🍔", en: "4 to go until your reward 🍔" },
  },
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
      ticketA: "طلب مجانًا",
      ticketB: "بدون بطاقة بنكية",
      h1a: "لكل مطعم ناجح،",
      h1b: "رُكن",
      h1c: "يستند عليه.",
      sub: "الكاشير، والمتجر، والولاء، وأرباحك. نظام واحد يشتغل عن",
      rot: ["مطعمك.", "كافيهك.", "الفود ترك حقك.", "مخبزك.", "مطبخك السحابي."],
      today: "صافي اليوم",
      orders: "طلبات اليوم",
      kitchen: "المطبخ",
      stamp: "+1 ختم",
      cta: "ابدأ مجانًا",
      cta2: "شوف الباقات",
      from: "الباقات من",
      perMonth: "شهريًا",
    },
    pos: { title: "الطلب الحالي", total: "الإجمالي", pay: "ادفع", all: "الكل", search: "ابحث أو امسح باركود…", paid: "تم الدفع" },
    newOrder: { t: "طلب جديد من المتجر", s: "مدفوع · Apple Pay" },
    one: {
      tools: ["كاشير", "متجر إلكتروني", "برنامج ولاء", "مخزون", "محاسبة"],
      name: "ركين",
      line: "بدل ما تشترك في خمسة أنظمة، كلها في اشتراك واحد ويكلمون بعض.",
      facts: ["يكمل بدون إنترنت", "فاتورة ضريبية برمز QR", "على آيباد أو كمبيوتر أو جوال"],
    },
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
        real: "هَبيّة بطاقة حقيقية على ركين · الباقي أمثلة لتصاميم ممكنة",
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
      h: "من الأساس.. إلى الصرح.",
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
    close: { h: "مطعمك يستاهل نظام يشتغل عنه.", sub: "كلّمنا، نجهّز أصنافك وأسعارك، وتبدأ البيع خلال يوم.", cta: "ابدأ مجانًا", wa: "كلّمنا واتساب" },
    sticky: "ابدأ مجانًا — أول 350 طلب",
    fits: { k: "يناسب", items: ["المطاعم", "الكافيهات", "الفود ترك", "المخابز", "المطابخ السحابية", "محلات الحلويات", "العصائر", "البرقر والبيتزا"] },
    footer: { tag: "نظام تشغيل مطعمك.", privacy: "الخصوصية", terms: "الشروط", rights: "© ٢٠٢٦ ركين" },
  },
  en: {
    nav: { features: "Features", plans: "Plans", faq: "FAQ", login: "Log in", start: "Start free" },
    hero: {
      pill: "350 orders free · No card",
      ticketA: "orders free",
      ticketB: "No card needed",
      h1a: "Every great restaurant",
      h1b: "stands",
      h1c: "on something.",
      sub: "Cashier, online store, loyalty and your profit. One system that works for",
      rot: ["your restaurant.", "your café.", "your food truck.", "your bakery.", "your cloud kitchen."],
      today: "Today's net",
      orders: "Orders today",
      kitchen: "Kitchen",
      stamp: "+1 stamp",
      cta: "Start free",
      cta2: "See plans",
      from: "Plans from",
      perMonth: "/ month",
    },
    pos: { title: "Current order", total: "Total", pay: "Pay", all: "All", search: "Search or scan…", paid: "Paid" },
    newOrder: { t: "New store order", s: "Paid · Apple Pay" },
    one: {
      tools: ["Cashier", "Online store", "Loyalty", "Stock", "Accounting"],
      name: "Rakeen",
      line: "Instead of five subscriptions, one — and they all talk to each other.",
      facts: ["Works offline", "Tax invoice with QR", "On iPad, computer or phone"],
    },
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
        real: "هَبيّة is a real Rakeen card · the rest are design examples",
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
      h: "From the foundation to the edifice.",
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
    close: { h: "Your restaurant deserves a system that works for it.", sub: "Message us, we set up your items and prices, and you start selling within a day.", cta: "Start free", wa: "WhatsApp us" },
    sticky: "Start free — first 350 orders",
    fits: { k: "Built for", items: ["Restaurants", "Cafés", "Food trucks", "Bakeries", "Cloud kitchens", "Dessert shops", "Juice bars", "Burgers & pizza"] },
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

/* Drawn stamps for the examples: a few flat shapes each, so they read at
   27px like a real stamp. Filled = the brand colours, empty = an outline. */
function StampArt({ art, c, on, ghost, x, y, size }: { art: Art; c: [string, string, string]; on: boolean; ghost: string; x?: number; y?: number; size?: number }) {
  const f = (col: string) => (on ? col : "none");
  const st = on ? "none" : ghost;
  const sw = on ? 0 : 1.4;
  return (
    <svg viewBox="0 0 32 32" className={on ? "on" : ""} x={x} y={y} width={size} height={size}>
      {art === "cup" && (
        <g stroke={st} strokeWidth={sw} strokeLinejoin="round">
          <path d="M7 7.5h18l-1 2.2H8z" fill={f(c[2])} />
          <path d="M8.2 10.2h15.6l-1.7 18a1.5 1.5 0 0 1-1.5 1.3h-9.2a1.5 1.5 0 0 1-1.5-1.3z" fill={f(c[0])} />
          <path d="M9 15.5h14l-.7 7.5H9.7z" fill={f(c[1])} />
          <path d="M10.5 4.2h11l.9 3.3H9.6z" fill={f(c[2])} />
        </g>
      )}
      {art === "croissant" && (
        <g stroke={st} strokeWidth={sw} strokeLinejoin="round">
          <path d="M3 20c1-6 6.5-11 13-11s12 5 13 11c-2.2 1.6-4 1.8-5.5 1.2L16 23.5l-7.5-2.3C7 21.8 5.2 21.6 3 20z" fill={f(c[0])} />
          <path d="M11.5 10.6 13 21.9M20.5 10.6 19 21.9M16 9v14.5" stroke={on ? c[1] : ghost} strokeWidth={on ? 1.3 : 1.2} fill="none" strokeLinecap="round" />
          <path d="M6.5 13.5 9 20.8M25.5 13.5 23 20.8" stroke={on ? c[2] : ghost} strokeWidth={on ? 1.2 : 1.1} fill="none" strokeLinecap="round" />
        </g>
      )}
      {art === "burger" && (
        <g stroke={st} strokeWidth={sw} strokeLinejoin="round">
          <path d="M4.5 14c0-5.5 5-9 11.5-9s11.5 3.5 11.5 9z" fill={f(c[0])} />
          <path d="M3.8 16.2c2 1.6 3.4-.6 5.5.4s3.6-1 5.6.2 3.4-1 5.6 0 3.4-1.4 5.6-.2c.6.3 1.3.3 2.1-.4v1.2H3.8z" fill={f(c[2])} />
          <rect x="4" y="17.4" width="24" height="4" rx="2" fill={f(c[1])} />
          <path d="M4.8 22.6h22.4c0 2.6-2 4.4-4.6 4.4H9.4c-2.6 0-4.6-1.8-4.6-4.4z" fill={f(c[0])} />
          {on && <path d="M11 9.5h.01M16 8.3h.01M20.5 10h.01M14 11.2h.01" stroke="#fff6dc" strokeWidth="1.3" strokeLinecap="round" />}
        </g>
      )}
    </svg>
  );
}

// Fine sine lines across a points strip, like an engraved card.
function Guilloche({ color }: { color: string }) {
  const paths = Array.from({ length: 22 }, (_, k) => {
    let d = "";
    for (let x = 0; x <= 375; x += 6) {
      const y = 62 + Math.sin(x / 48 + k * 0.32) * (18 + k * 0.9) + Math.sin(x / 19 + k) * 3;
      d += (x ? " L" : "M") + x + " " + y.toFixed(1);
    }
    return d;
  });
  return (
    <svg viewBox="0 0 375 123" preserveAspectRatio="none" className="wp-wave">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth=".7" opacity={0.25 + (i % 5) * 0.12} />
      ))}
    </svg>
  );
}

/* Each card's strip is its own small piece of art, the way a business
   designs its strip image (هَبيّة's real one: postage stamps of the desert
   with its mountains as the stamps). Stamps fill from the right. */
const filledAt = (i: number, of: number, done: number) => of - 1 - i < done;
function Postage({ x, y, w, h, r, bg }: { x: number; y: number; w: number; h: number; r: number; bg: string }) {
  const holes: React.ReactNode[] = [];
  for (let k = -w / 2 + 3; k <= w / 2 - 2; k += 6.5) holes.push(<circle key={"t" + k} cx={k} cy={-h / 2} r="2.1" />, <circle key={"b" + k} cx={k} cy={h / 2} r="2.1" />);
  for (let k = -h / 2 + 3; k <= h / 2 - 2; k += 6.5) holes.push(<circle key={"l" + k} cx={-w / 2} cy={k} r="2.1" />, <circle key={"r" + k} cx={w / 2} cy={k} r="2.1" />);
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#7B4A21" />
      <image href="/landing/hbiah-banner.jpg" x={-w / 2 + 4} y={-h / 2 + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid slice" opacity=".5" style={{ mixBlendMode: "multiply" }} />
      <g fill={bg}>{holes}</g>
    </g>
  );
}
function StripScene({ p, ghost }: { p: WPass; ghost: string }) {
  const vb = "0 0 300 118";
  if (p.key === "hbiah") {
    const spots = [
      [22, 44],
      [92, 58],
      [160, 36],
      [196, 82],
      [262, 50],
    ];
    return (
      <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="scene">
        <Postage x={30} y={8} w={78} h={56} r={-14} bg={p.bg} />
        <Postage x={262} y={6} w={74} h={54} r={16} bg={p.bg} />
        <Postage x={132} y={102} w={70} h={50} r={-9} bg={p.bg} />
        {spots.map(([x, y], i) => (
          <image key={i} href="/landing/hbiah-mark.png" x={x - 4} y={y - 2} width="62" height="40" className={filledAt(i, p.of, p.done) ? "mt on" : "mt"} />
        ))}
      </svg>
    );
  }
  if (p.key === "sana") {
    const beans = [[18, 20, 30], [70, 98, -20], [120, 14, 60], [176, 104, 10], [232, 22, -40], [284, 90, 25], [40, 70, 80], [258, 64, -70], [150, 60, 45]];
    return (
      <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="scene">
        {beans.map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
            <ellipse rx="9" ry="6" fill="#28493A" />
            <path d="M-7 1 C-2 -3 2 3 7 -1" stroke={p.bg} strokeWidth="1.4" fill="none" />
          </g>
        ))}
        <path d="M24 92 H276" stroke="rgba(244,238,223,.18)" strokeWidth="1" />
        {Array.from({ length: p.of }).map((_, i) => (
          <StampArt key={i} art="cup" c={p.artColors!} on={filledAt(i, p.of, p.done)} ghost={ghost} x={34 + i * 40} y={56 - Math.sin((i / (p.of - 1)) * Math.PI) * 10} size={34} />
        ))}
      </svg>
    );
  }
  if (p.key === "waraq") {
    const stalk = (x: number, r: number) => (
      <g transform={`translate(${x} 118) rotate(${r})`} stroke="#C9BA92" strokeWidth="1.2" fill="none">
        <path d="M0 0 V-92" />
        {[18, 32, 46, 60, 74].map((y) => (
          <g key={y}>
            <path d={`M0 -${y} q-9 -4 -10 -14 q8 3 10 14`} />
            <path d={`M0 -${y} q9 -4 10 -14 q-8 3 -10 14`} />
          </g>
        ))}
      </g>
    );
    const pos = [[44, 18], [100, 18], [156, 18], [212, 18], [72, 62], [128, 62], [184, 62], [240, 62]];
    return (
      <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="scene">
        {stalk(14, -14)}
        {stalk(288, 12)}
        {pos.map(([x, y], i) => (
          <StampArt key={i} art="croissant" c={p.artColors!} on={(i < 4 ? 3 - i : 11 - i) < p.done} ghost={ghost} x={x} y={y} size={40} />
        ))}
      </svg>
    );
  }
  if (p.key === "brgr") {
    return (
      <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="scene">
        <text x="150" y="104" textAnchor="middle" className="scene-word">BRGR.</text>
        {Array.from({ length: p.of }).map((_, i) => (
          <StampArt key={i} art="burger" c={p.artColors!} on={filledAt(i, p.of, p.done)} ghost={ghost} x={30 + i * 42} y={40 + Math.sin(i * 1.3) * 9} size={38} />
        ))}
      </svg>
    );
  }
  // NOIR: engraved lines and a monogram
  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className="scene">
      <text x="40" y="112" className="scene-mono">N</text>
    </svg>
  );
}

/* One Apple Wallet store card, laid out like the dashboard's preview
   (walletCardPreviewHtml) and the pass the server signs: Apple's font,
   field sizes, stamps filled from the right. */
function WalletPass({ p, qr }: { p: WPass; qr: string }) {
  const light = lumOf(p.bg) > 150;
  const fg = light ? "rgb(28,26,20)" : "#fff";
  const faint = light ? "rgba(28,26,20,.55)" : "rgba(255,255,255,.62)";
  const ghost = light ? "rgba(28,26,20,.28)" : "rgba(255,255,255,.34)";
  const stamps = !p.points;
  const left = p.of - p.done;
  return (
    <div className="wp" style={{ background: p.bg, color: fg }}>
      <div className="wp-head">
        <div className="wp-logo">{p.logo}</div>
        <div className="wp-hfields">
          {p.tier && (
            <div className="wp-f">
              <small style={{ color: faint }}>مستواك</small>
              <b>{p.tier}</b>
            </div>
          )}
          <div className="wp-f">
            <small style={{ color: faint }}>{stamps ? p.progressLabel : "نقاطك"}</small>
            <b>{stamps ? `${p.done}/${p.of}` : p.points!.toLocaleString("en-US")}</b>
          </div>
        </div>
      </div>
      <div className="wp-strip" style={{ background: p.strip }}>
        {p.lines && <Guilloche color={p.lines} />}
        <StripScene p={p} ghost={ghost} />
      </div>
      <div className="wp-fields">
        <div className="wp-f">
          <small style={{ color: faint }}>اسمك</small>
          <b>{p.customer}</b>
        </div>
        <div className="wp-f wp-end">
          <small style={{ color: faint }}>{stamps ? p.leftLabel || "باقي" : "مكافأتك"}</small>
          <b>{stamps ? left : p.reward}</b>
        </div>
      </div>
      <div className="wp-qr">
        <div className="wp-qr-box">
          <div dangerouslySetInnerHTML={{ __html: qr }} />
          <span>{p.code}</span>
        </div>
      </div>
    </div>
  );
}

/* The passes fanned out like a hand of cards; the front one changes by
   itself, and a tap brings any card forward. */
function WalletFan({ qr, lang }: { qr: string; lang: Lang }) {
  const [front, setFront] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFront((f) => (f + 1) % WALLET.length), 3400);
    return () => window.clearInterval(id);
  }, [hold]);
  const n = WALLET.length;
  const p = WALLET[front];
  return (
    <div className="fan" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="lock-note" key={"n" + p.key}>
        {p.note.icon ? <img src={p.note.icon} alt="" style={{ background: p.bg }} /> : <span className="ln-ic" style={{ background: p.bg, color: lumOf(p.bg) > 150 ? "#222" : "#fff" }}>{p.note.brand.replace(/[^\p{L}]/gu, "").slice(0, 1)}</span>}
        <div>
          <div className="ln-top">
            <b>{p.note.brand}</b>
            <span>{lang === "ar" ? "الآن" : "now"}</span>
          </div>
          <p>{lang === "ar" ? p.note.ar : p.note.en}</p>
        </div>
      </div>
      <div className="fan-deck">
        {WALLET.map((q, i) => {
          let d = i - front;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const a = Math.abs(d);
          return (
            <button
              key={q.key}
              className={"fan-card" + (d === 0 ? " front" : "")}
              style={{ ["--d" as string]: d, ["--a" as string]: a, zIndex: 10 - a }}
              onClick={() => setFront(i)}
              aria-label={q.note.brand}
            >
              <WalletPass p={q} qr={qr} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* أساس, عماد, صرح mean foundation, pillar and edifice, so each package
   is drawn as one: a footing, a column, a building. They draw themselves
   in when the cards come into view. */
function TierArt({ k }: { k: string }) {
  return (
    <svg className={`tier-art art-${k}`} viewBox="0 0 200 150" aria-hidden>
      {k === "asas" && (
        <g>
          <path d="M20 132 H180" className="ground" />
          <path d="M34 132 V104 H166 V132" />
          <path d="M34 118 H166 M67 104 V118 M100 118 V132 M133 104 V118 M50 118 V132 M150 118 V132 M84 104 V118 M117 118 V132" className="fine" />
          <path d="M26 104 H174" />
        </g>
      )}
      {k === "emad" && (
        <g>
          <path d="M20 132 H180" className="ground" />
          <path d="M60 132 V122 H140 V132 M66 122 V114 H134 V122" />
          <path d="M78 114 V42 M122 114 V42" />
          <path d="M89 112 V44 M100 112 V44 M111 112 V44" className="fine" />
          <path d="M70 42 H130 V34 H70 Z M62 34 H138 V26 H62 Z" />
        </g>
      )}
      {k === "sarh" && (
        <g>
          <path d="M14 132 H186" className="ground" />
          <path d="M28 132 V124 H172 V132 M36 124 V117 H164 V124" />
          <path d="M48 117 V58 M70 117 V58 M92 117 V58 M108 117 V58 M130 117 V58 M152 117 V58" />
          <path d="M40 58 H160 V50 H40 Z" />
          <path d="M34 50 L100 14 L166 50" />
          <path d="M100 26 V34" className="fine" />
          <circle cx="100" cy="36" r="5" className="fine" />
        </g>
      )}
    </svg>
  );
}

/* Counts up to `to` the first time it scrolls into view (and again when
   `to` changes, like the monthly/yearly switch). */
function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  const seen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      const from = seen.current ? v : 0;
      seen.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        setV(Math.round(from + (to - from) * e));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (seen.current) {
      run();
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return <span ref={ref}>{num(v)}</span>;
}

/* The hero cashier, styled after the real POS (lime category, dark price pill,
   quantity chips), ringing up a few items on a loop. */
function HeroCashier({ lang, onPaid }: { lang: Lang; onPaid?: () => void }) {
  const t = T[lang];
  const [lines, setLines] = useState<number[]>([]);
  const [paid, setPaid] = useState(false);
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;
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
        paidRef.current?.();
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
  const heroRef = useRef<HTMLElement>(null);
  const t = T[lang];
  // hero: rotating word, and the pulse that runs out from each payment
  const [rot, setRot] = useState(0);
  const [beat, setBeat] = useState(false);
  const [paidCount, setPaidCount] = useState(0);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setRot((r) => r + 1), 2400);
    return () => window.clearInterval(id);
  }, []);
  const onPaid = () => {
    setPaidCount((n) => n + 1);
    setBeat(true);
    window.setTimeout(() => setBeat(false), 1600);
  };

  // The hero leans a little toward the pointer: the tablet and the phone at
  // different depths, and a soft light that follows it.
  const onHeroMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    el.style.setProperty("--px", `${e.clientX - r.left}px`);
    el.style.setProperty("--py", `${e.clientY - r.top}px`);
  };
  // Hero words rise one after another.
  const splitWords = (text: string, start: number) =>
    text.split(" ").map((w, i) => (
      <Fragment key={i}>
        <span className="w" style={{ ["--i" as string]: start + i }}>
          {w}
        </span>{" "}
      </Fragment>
    ));

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
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.current?.style.setProperty("--prog", String(max > 0 ? y / max : 0));
      const end = document.documentElement.scrollHeight - window.innerHeight - 520;
      setSticky(y > 640 && y < end);
      setShowTop(y > 900);
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
  const stripIcons: IconName[] = ["wifi", "qr", "devices"];
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
        <i className="nav-prog" aria-hidden />
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
            <a href={START} target="_blank" rel="noopener noreferrer" className="btn btn-lime btn-sm">{t.nav.start}</a>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="hero" id="top" onMouseMove={onHeroMove} ref={heroRef}>
        <div className="hero-grid" aria-hidden />
        <div className="hero-glow" aria-hidden />
        <div className="hero-spot" aria-hidden />
        <div className="hero-word" aria-hidden>
          {lang === "ar" ? "ركين" : "RAKEEN"}
        </div>
        {/* ركن: a corner drawn in two strokes behind the product */}
        <svg className="hero-lines" viewBox="0 0 600 600" aria-hidden>
          <path d="M40 560 V120 a80 80 0 0 1 80 -80 H560" />
          <path d="M100 560 V170 a70 70 0 0 1 70 -70 H560" />
        </svg>
        <div className="wrap hero-in">
          <div className="hero-copy">
            <a href={START} target="_blank" rel="noopener noreferrer" className="ticket">
              <b className="mono">350</b>
              <span>
                {t.hero.ticketA}
                <small>{t.hero.ticketB}</small>
              </span>
            </a>
            <h1>
              {splitWords(t.hero.h1a, 0)}
              <br />
              <span className="w" style={{ ["--i" as string]: 3 }}>
                <span className="mark">{t.hero.h1b}</span>
              </span>{" "}
              {splitWords(t.hero.h1c, 4)}
            </h1>
            <p className="lead">
              {t.hero.sub}{" "}
              <span className="rot" key={rot}>
                {t.hero.rot[rot % t.hero.rot.length]}
              </span>
            </p>
            <div className="cta-row">
              <a href={START} target="_blank" rel="noopener noreferrer" className="btn btn-lime btn-lg">
                {t.hero.cta}
                <Icon name="arrow" />
              </a>
              <a href="#plans" onClick={go("plans")} className="btn btn-glass btn-lg">{t.hero.cta2}</a>
            </div>
            <p className="from">
              {t.hero.from} <Riyal /> <b className="mono">{PLANS[0].monthly}</b> {t.hero.perMonth}
            </p>
          </div>

          <div className={"hero-art" + (beat ? " beat" : "")} key={"art" + lang}>
            {/* every payment travels out to the kitchen, the loyalty card and the day's total */}
            <svg className="hero-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <path d="M56 44 C 70 60, 82 70, 94 86" />
              <path d="M56 44 C 40 20, 22 12, 8 4" />
              <path d="M56 44 C 54 70, 50 84, 46 98" />
            </svg>
            <HeroCashier lang={lang} onPaid={onPaid} />
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
            <div className="sat sat-kds" key={"k" + paidCount}>
              <span className="sat-k">{t.hero.kitchen}</span>
              <b className="mono">#{1044 + paidCount}</b>
              <i>1× {DEMO[0][lang]}</i>
              <i>1× {DEMO[1][lang]}</i>
              <i>2× {DEMO[3][lang]}</i>
              <em className="mono">00:0{(paidCount % 5) + 1}</em>
            </div>
            <div className="sat sat-pass">
              <div className="sp-strip">
                {Array.from({ length: 5 }).map((_, i) => (
                  <img key={i} src="/landing/hbiah-mark.png" alt="" className={4 - i < (paidCount % 5) + 1 ? "on" : ""} />
                ))}
              </div>
              <span className="sp-label" key={"s" + paidCount}>
                {t.hero.stamp}
              </span>
            </div>
            <div className="sat sat-net">
              <span>{t.hero.today}</span>
              <b className="mono">
                <Riyal /> <CountUp to={6271 + paidCount * 161} ms={900} />
              </b>
              <small>
                {t.hero.orders} <span className="mono">{128 + paidCount}</span>
              </small>
            </div>
          </div>
        </div>

        <div className="wrap">
          {/* the point of it all: five tools you'd buy apart, as one */}
          <div className="one">
            <div className="one-eq">
              {t.one.tools.map((tool, i) => (
                <Fragment key={tool}>
                  {i > 0 && (
                    <i className="one-op" style={{ ["--i" as string]: i }}>
                      +
                    </i>
                  )}
                  <span className="one-tool" style={{ ["--i" as string]: i }}>
                    {tool}
                  </span>
                </Fragment>
              ))}
              <i className="one-op one-eqs" style={{ ["--i" as string]: 5 }}>
                =
              </i>
              <span className="one-name">{t.one.name}</span>
            </div>
            <p className="one-line">{t.one.line}</p>
            <ul className="one-facts">
              {t.one.facts.map((f, i) => (
                <li key={f}>
                  <Icon name={stripIcons[i]} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="fits" aria-label={t.fits.k}>
        <span className="fits-k">{t.fits.k}</span>
        <div className="fits-track" dir="ltr">
          <div className="fits-run">
            {[0, 1].map((k) => (
              <ul key={k} aria-hidden={k === 1}>
                {t.fits.items.map((it) => (
                  <li key={it}>
                    <i />
                    {it}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>

      <div id="features" />

      {/* ---------- chapter: cashier ---------- */}
      <section className="chap">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="chap-n mono" aria-hidden>01</span>
            <span className="kicker">{t.ch.pos.k}</span>
            <h2>{t.ch.pos.h}</h2>
            <p>{t.ch.pos.p}</p>
            <Bullets items={t.ch.pos.b} />
          </div>
          <div className="chap-art art-receipt" data-in>
            <div className="printer" aria-hidden>
              <div className="printer-top">
                <i />
              </div>
              <div className="paper-wrap">
                <Receipt lang={lang} qr={qr} />
              </div>
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
            <span className="chap-n mono" aria-hidden>02</span>
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
          </div>
        </div>
      </section>

      {/* ---------- chapter: loyalty ---------- */}
      <section className="chap chap-wide">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="chap-n mono" aria-hidden>03</span>
            <span className="kicker">{t.ch.loyalty.k}</span>
            <h2>{t.ch.loyalty.h}</h2>
            <p>{t.ch.loyalty.p}</p>
            <Bullets items={t.ch.loyalty.b} />
          </div>
          <div className="chap-art art-loyalty" data-in>
            <WalletFan qr={qr} lang={lang} />
          </div>
        </div>
      </section>

      {/* ---------- chapter: numbers ---------- */}
      <section className="chap chap-dark">
        <div className="wrap chap-in">
          <div className="chap-copy" data-in>
            <span className="chap-n mono" aria-hidden>04</span>
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
                <Riyal /> <CountUp to={net} ms={1600} />
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
                  <TierArt k={p.key} />
                  <div className="tier-head">
                    <h3>{planName(p)}</h3>
                    <span className="tier-count">{t.plans.count(includedCount(i))}</span>
                  </div>
                  <p className="tier-tag">{lang === "ar" ? p.tagline : PLAN_EN[p.key].tagline}</p>
                  <div className="price">
                    <Riyal />
                    <b className="mono">
                      <CountUp to={price} ms={700} />
                    </b>
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
                  <a href={START} target="_blank" rel="noopener noreferrer" className="btn tier-btn">
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
              <a href={START} target="_blank" rel="noopener noreferrer" className="btn btn-lime btn-lg">
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

      <button
        className={"to-top" + (showTop ? " show" : "")}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label={lang === "ar" ? "ارجع لفوق" : "Back to top"}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>

      {/* phones only: the one action, always in reach */}
      <a href={START} target="_blank" rel="noopener noreferrer" className={"sticky-cta" + (sticky ? " show" : "")}>
        {t.sticky}
        <Icon name="arrow" />
      </a>
    </div>
  );
}
