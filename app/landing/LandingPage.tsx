"use client";

import { useEffect, useRef, useState } from "react";
import "./rakeen-landing.css";

const fmtWestern = (n: number) => Math.round(n).toLocaleString("en-US");

const DEMO_ITEMS = [
  { id: 37, name: "بوكس وسط مشكّل", cat: "البوكسات", price: 49, image: "https://media.rakeenapp.com/menu-item-images/1/37-1786203511961.png" },
  { id: 38, name: "بوكس كبير مشكّل", cat: "البوكسات", price: 99, image: "https://media.rakeenapp.com/menu-item-images/1/38-1786204226614.jpeg" },
  { id: 42, name: "بوكس رول مسخن", cat: "البوكسات", price: 49, image: "https://media.rakeenapp.com/menu-item-images/1/42-1786204272084.jpeg" },
  { id: 57, name: "حامض عنُوب", cat: "صوصات عنوب", price: 2, image: "https://media.rakeenapp.com/menu-item-images/1/57-1786341048546.png" },
];

const DEMO_TABLES = [
  { num: 1, status: "available" as const },
  { num: 2, status: "occupied" as const, bill: "86.00" },
  { num: 3, status: "available" as const },
  { num: 4, status: "available" as const },
  { num: 5, status: "occupied" as const, bill: "42.50" },
  { num: 6, status: "available" as const },
];
const TABLE_STATUS_LABEL: Record<string, string> = { available: "متاحة", occupied: "مشغولة", reserved: "محجوزة" };

const INV_TILES = [
  { key: "Onion", name: "بصل", icon: "onion", par: 20, startQty: 18, unit: "كجم" },
  { key: "Tomato", name: "طماط", icon: "tomato", par: 26, startQty: 24, unit: "كجم" },
  { key: "Chicken", name: "دجاج", icon: "chicken", par: 34, startQty: 32, unit: "كجم" },
];

// Small stroke-icon markup shared with the vanilla-JS inventory-story
// animation below (toasts / OCR card / variance card are built as HTML
// strings there, not JSX, so they need their own copy of these — same
// stroke family as JourneyIcon, never emoji).
const INV_ICON_SVG = {
  order:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M6.2 9h11.6l.9 10.2a1.6 1.6 0 0 1-1.6 1.8H6.9a1.6 1.6 0 0 1-1.6-1.8L6.2 9Z"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2 21 19H3L12 4.2Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  invoice:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11a.5.5 0 0 1 .5.5v16.3a.4.4 0 0 1-.62.33l-1.6-1.05a.4.4 0 0 0-.44 0l-1.62 1.06a.4.4 0 0 1-.44 0l-1.62-1.06a.4.4 0 0 0-.44 0l-1.62 1.06a.4.4 0 0 1-.44 0l-1.62-1.06a.4.4 0 0 0-.44 0L6.12 20.6a.4.4 0 0 1-.62-.33V4a.5.5 0 0 1 .5-.5Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/></svg>',
};

// One knob for "the demos feel a bit fast" — scales every at(ms, fn) delay
// in the POS/inventory/store-demo timelines below without hand-retuning
// each of the dozens of individual literals.
const DEMO_SPEED = 1.4;

// The pillar-rise choreography's individual timings (in runHero below) are
// tuned directly in real milliseconds rather than through this multiplier —
// first content lands at ~2.9s (was ~7.1s, which read as a blank page on a
// slow connection) but every beat after that still holds long enough to
// read. Kept as 1 so a future global speed tweak has one knob to reach for,
// same pattern as DEMO_SPEED above, without re-deriving every literal.
const HERO_SPEED = 1;

const DEMO_PLATFORMS = [
  { name: "هنقرستيشن", initial: "H", color: "#FF6600" },
  { name: "جاهز", initial: "ج", color: "#0B6B3A" },
  { name: "ToYou", initial: "T", color: "#7B2FF7" },
];

const JOURNEY_INTEGRATIONS = [
  { icon: "truck", label: "الموردين", labelEn: "Suppliers" },
  { icon: "receipt", label: "فواتير المشتريات", labelEn: "Purchase invoices" },
  { icon: "storefront", label: "متجرك الإلكتروني", labelEn: "Your online store" },
  { icon: "scooter", label: "تطبيقات التوصيل", labelEn: "Delivery apps" },
  { icon: "wallet", label: "نظام الولاء", labelEn: "Loyalty system" },
];

const JOURNEY_VALUES = { profitStart: 5589, profitEnd: 5612, costStart: 1490, costEnd: 1538, invStart: 22, invEnd: 21 };

const WF = [
  { id: "sales", label: "مبيعات", labelEn: "Sales", value: 18240, pct: 100, cls: "pos" },
  { id: "cogs", label: "تكلفة الطعام", labelEn: "Food cost", value: -5470, pct: 30, cls: "neg" },
  { id: "vat", label: "ضريبة", labelEn: "Tax", value: -2380, pct: 13, cls: "neg" },
  { id: "opex", label: "مصاريف", labelEn: "Expenses", value: -3760, pct: 20.6, cls: "neg" },
];
const NET = 6290;
const NET_PCT = 34.5;

type LoyaltyCard = {
  id: string;
  name: string;
  customer: string;
  accent: string;
  onAccent: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  tier: string;
  tenure: string;
  saved: number;
  bandStyle: "food" | "coffee" | "pass" | "burger";
} & (
  | { system: "points"; points: number; visitsFilled?: undefined; visitsThreshold?: undefined; freeRewards?: undefined; stampIcon?: undefined }
  | { system: "visits"; points?: undefined; visitsFilled: number; visitsThreshold: number; freeRewards: number; stampIcon: string }
);

// Mirrors the real card at app/loyalty-card/[token]/page.tsx (ClassicTheme) —
// same header/middle/footer bands, tier chip, tenure line, saved badge, and
// (for visits cards) the remaining/rewards stats row. The owner sent real
// screenshots of this exact card in 3 accent/theme variants; field values
// below (tier, tenure, saved amount) are copied straight from those.
const LOYALTY_CARDS: LoyaltyCard[] = [
  {
    id: "anoob",
    name: "عنوب | Anoob",
    customer: "خالد الحربي",
    accent: "#C4FF2B",
    onAccent: "#171717",
    logoUrl: "https://media.rakeenapp.com/loyalty-branding/1/logo-1786634917576.png",
    bannerUrl: "https://media.rakeenapp.com/loyalty-branding/1/banner-1786634918047.jpeg",
    tier: "🥇 Gold",
    tenure: "معنا من سنة",
    saved: 500,
    system: "points" as const,
    points: 240,
    bandStyle: "food" as const,
  },
  {
    id: "aldan",
    name: "ألدان CAFE",
    customer: "منال القحطاني",
    accent: "#781414",
    onAccent: "#FAFAF5",
    logoUrl: "https://media.rakeenapp.com/loyalty-branding/1/logo-1786637275028.png",
    bannerUrl: "https://media.rakeenapp.com/loyalty-branding/1/banner-1786637277741.png",
    tier: "🥇 Gold",
    tenure: "معنا من سنة",
    saved: 500,
    system: "visits" as const,
    visitsFilled: 3,
    visitsThreshold: 6,
    freeRewards: 1,
    stampIcon: "☕",
    bandStyle: "coffee" as const,
  },
  {
    id: "pass",
    name: "PASS",
    customer: "فهد العتيبي",
    accent: "#516F6D",
    onAccent: "#FAFAF5",
    logoUrl: "https://media.rakeenapp.com/loyalty-branding/1/logo-1786636378234.png",
    bannerUrl: "https://media.rakeenapp.com/loyalty-branding/1/banner-1786636379131.png",
    tier: "🥇 Gold",
    tenure: "معنا من سنة",
    saved: 500,
    system: "points" as const,
    points: 240,
    bandStyle: "pass" as const,
  },
  {
    id: "bunzo",
    name: "Bunzo's Burger",
    customer: "نورة الدوسري",
    accent: "#C83C3C",
    onAccent: "#FAFAF5",
    logoUrl: "https://media.rakeenapp.com/loyalty-branding/1/logo-1786637601603.png",
    bannerUrl: "https://media.rakeenapp.com/loyalty-branding/1/banner-1786637602818.png",
    tier: "🥇 Gold",
    tenure: "معنا من سنة",
    saved: 500,
    system: "visits" as const,
    visitsFilled: 3,
    visitsThreshold: 6,
    freeRewards: 1,
    stampIcon: "🍔",
    bandStyle: "burger" as const,
  },
];

// One id per chip so the story below can light each one up at the exact
// moment its scene demonstrates it, instead of revealing all 7 at once.
const LOYALTY_FEATURES = [
  { id: "save", icon: "save-down", text: "حفظ فوري على الجوال", textEn: "Instant save to phone" },
  { id: "points", icon: "sparkle", text: "نقاط أو زيارات", textEn: "Points or visits" },
  { id: "redeem", icon: "gift", text: "استبدال فوري", textEn: "Instant redemption" },
  { id: "tier", icon: "badge", text: "مستويات عضوية", textEn: "Membership tiers" },
  { id: "notify", icon: "bell-ping", text: "تنبيه فوري", textEn: "Instant notifications" },
  { id: "chat", icon: "chat", text: "ربط واتساب", textEn: "WhatsApp integration" },
  { id: "brand", icon: "storefront", text: "بهويتك انت", textEn: "Your own branding" },
];

// Hero closing showcase. IMPORTANT: only "restaurant" (and "cafe", the same
// product under a different label) reflect what Rakeen actually is today —
// verified against the schema/signup flow, there is no business_type/
// industry concept anywhere in the product, and no hotel/clinic/retail/
// car-wash/pet-store screens, tables, or logic exist at all. The other five
// cards below depict products that do not exist. This was flagged
// explicitly and the owner chose to proceed anyway, on their own judgment,
// as a stated vision of where Rakeen is headed rather than what it is now.
// Same authorization context as before (see the removed INDUSTRY_CARDS this
// replaced): Rakeen is verified to be a restaurant/cafe-only product today —
// no hotel/clinic/retail code exists anywhere. The owner explicitly chose to
// depict these four anyway as a stated vision, on their own judgment, after
// being told plainly what is and isn't real.
const DASHBOARD_CARDS = ["restaurant", "clinic", "hotel", "retail"] as const;

// The rotating word after the closing headline — every real + depicted
// vertical, said once. "للمطاعم"/"للمقاهي" are real; the rest continue the
// same authorized vision as DASHBOARD_CARDS above.
const HERO_ROTATING_WORDS = ["للمطاعم", "للمقاهي", "للفنادق", "للعيادات", "للتجزئة", "للمغاسل", "لمحلات الحيوانات"];
const HERO_ROTATING_WORDS_EN = ["restaurants", "cafes", "hotels", "clinics", "retail", "laundries", "pet stores"];

// The hero card in the loyalty story below — real عنوب | Anoob data (see
// LOYALTY_CARDS above), same one used throughout the rest of this page's
// demos, so the customer's whole journey stays inside one recognizable
// brand rather than jumping between unrelated restaurants.
const LOYALTY_HERO = LOYALTY_CARDS[0];

const LOYALTY_STORY_VALUES = { earnStart: 165, earnEnd: 180, afterRedeem: 30, finalPoints: 50 };

// Same "classic-script" icon-string duplication pattern as INV_ICON_SVG —
// the loyalty story's toasts/cards are built as HTML strings in the vanilla
// layer below, not JSX, so they need their own copy of these.
const LOY_ICON_SVG = {
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path stroke-linejoin="round" d="M12 3.5c.5 3.3 1.9 4.7 5.2 5.2-3.3.5-4.7 1.9-5.2 5.2-.5-3.3-1.9-4.7-5.2-5.2 3.3-.5 4.7-1.9 5.2-5.2Z"/><path d="M18.3 15.8c.25 1.5.9 2.15 2.4 2.4-1.5.25-2.15.9-2.4 2.4-.25-1.5-.9-2.15-2.4-2.4 1.5-.25 2.15-.9 2.4-2.4Z"/></svg>',
  gift:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9.5" width="16" height="10.5" rx="1.6"/><path d="M4 13.2h16"/><path d="M12 9.5v10.5"/><path d="M12 9.5c-1.4 0-3.4-.9-3.4-2.7A2.1 2.1 0 0 1 10.7 4.7c1.7 0 2.9 2 2.9 2s1.2-2 2.9-2a2.1 2.1 0 0 1 2.1 2.1c0 1.8-2 2.7-3.4 2.7"/></svg>',
  phoneTap:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.4"/><path d="M11 18.5h2"/><circle cx="12" cy="8.5" r="2.6"/></svg>',
  bellPing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 15.5c0-1 .4-1.6.9-2.3.5-.7.7-1.5.7-3.3 0-2.6 1.7-4.4 3.9-4.4s3.9 1.8 3.9 4.4c0 1.8.2 2.6.7 3.3.5.7.9 1.3.9 2.3H6.5Z"/><path d="M10.3 18.2a1.9 1.9 0 0 0 3.4 0"/><circle cx="17.3" cy="6.2" r="2" fill="currentColor" stroke="none"/></svg>',
  saveDown:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2.4"/><path d="M12 8.5v6M9.3 12.2 12 14.8l2.7-2.6"/></svg>',
};

// Real عنوب | Anoob data, queried directly from the businesses/menu_* tables —
// same brand color (#C7FF4D), same logo/banner, same live menu prices and
// photos as their actual /order/anoob storefront. Payment methods on the
// real store are cash-only today (card/Apple Pay render disabled with a
// "قريبًا" badge) — the owner asked this demo show all three as active.
const STORE = {
  name: "عنوب | Anoob",
  logoUrl: "https://media.rakeenapp.com/business-branding/1/logo-1786305065646.png",
  bannerUrl: "https://media.rakeenapp.com/business-branding/1/online-banner-1786338777541.jpeg",
  brand: "#C7FF4D",
  brandInk: "#16281B",
};
const STORE_CATEGORIES = ["البوكسات", "صوصات عنُوب", "المشروبات"];
const STORE_PRODUCTS = [
  { id: 37, name: "بوكس وسط مشكّل", price: 49, img: "https://media.rakeenapp.com/menu-item-images/1/37-1786203511961.png", box: true },
  { id: 38, name: "بوكس كبير مشكّل", price: 99, img: "https://media.rakeenapp.com/menu-item-images/1/38-1786204226614.jpeg", box: true },
  { id: 51, name: "بوكس سمبوسة", price: 39, img: "https://media.rakeenapp.com/menu-item-images/1/51-1786205870515.jpeg", box: false },
];
const STORE_BOX_ITEMS = ["ورق عنب سبايسي", "مسخن", "سمبوسة دجاج", "ورق عنب كلاسيك"];
const STORE_PAYMENT_METHODS = [
  { id: "cash", label: "نقدًا" },
  { id: "applepay", label: "Apple Pay" },
  { id: "card", label: "بطاقة" },
];

function Logo() {
  return (
    <svg viewBox="0 0 66 100" width="14" height="21" fill="currentColor">
      <path fillRule="evenodd" d="M0,0 H36 A29,29 0 0 1 36,58 H0 Z M40,14 A15,15 0 1 0 40,44 A15,15 0 1 0 40,14 Z" />
      <rect x="0" y="0" width="18" height="100" rx="7" />
      <polygon points="14,58 34,58 65,100 47,100" />
    </svg>
  );
}

// A small bespoke icon set for the journey chips — outline-style (stroke,
// not fill), one consistent stroke weight and rounded caps/joins throughout,
// so the 13 steps read as one designed family instead of a stock icon grid
// or emoji. Each shape is deliberately simple (2-4 primitives) rather than
// a literal illustration, matching the restrained, geometric feel of
// Linear/Notion/Stripe-style product iconography.
const JOURNEY_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function JourneyIcon({ name }: { name: string }) {
  switch (name) {
    case "order": // shopping bag — the customer places an order
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M9 9V7a3 3 0 0 1 6 0v2" />
          <path d="M6.2 9h11.6l.9 10.2a1.6 1.6 0 0 1-1.6 1.8H6.9a1.6 1.6 0 0 1-1.6-1.8L6.2 9Z" />
        </svg>
      );
    case "card": // payment card — the cashier
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="3" y="6" width="18" height="12.5" rx="2.4" />
          <path d="M3 10h18" />
        </svg>
      );
    case "sparkle": // a soft 4-point sparkle — loyalty/points, not a stock star
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path strokeLinejoin="round" d="M12 3.5c.5 3.3 1.9 4.7 5.2 5.2-3.3.5-4.7 1.9-5.2 5.2-.5-3.3-1.9-4.7-5.2-5.2 3.3-.5 4.7-1.9 5.2-5.2Z" />
          <path d="M18.3 15.8c.25 1.5.9 2.15 2.4 2.4-1.5.25-2.15.9-2.4 2.4-.25-1.5-.9-2.15-2.4-2.4 1.5-.25 2.15-.9 2.4-2.4Z" />
        </svg>
      );
    case "chef": // chef's hat — the kitchen
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M6.5 13.5C5.6 12.6 5 11.4 5 10a4 4 0 0 1 4-4c.4 0 .8.1 1.1.2A3.5 3.5 0 0 1 16.9 6.2c.35-.1.72-.2 1.1-.2a4 4 0 0 1 4 4c0 1.4-.6 2.6-1.5 3.5" />
          <path d="M6.5 13.5h11l.5 6.5a1 1 0 0 1-1 1.1H7a1 1 0 0 1-1-1.1l.5-6.5Z" />
        </svg>
      );
    case "box-down": // inventory box, with a "decreasing" accent
    case "box-up": // inventory box, with an "increasing" accent
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4.5 8.2 12 4l7.5 4.2v7.6L12 20l-7.5-4.2V8.2Z" />
          <path d="M4.7 8.4 12 12.3l7.3-3.9M12 12.3V20" />
          {name === "box-down" ? <path d="M15.5 15.5v3.2m0 0-1.4-1.4m1.4 1.4 1.4-1.4" /> : <path d="M15.5 18.7v-3.2m0 0-1.4 1.4m1.4-1.4 1.4 1.4" />}
        </svg>
      );
    case "coin": // cost — a coin, live-updating
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="12" cy="12" r="7.2" />
          <path d="M12 8.3v7.4M9.9 10.2c0-1 .9-1.7 2.1-1.7s2.1.6 2.1 1.5c0 2.1-4.2 1-4.2 3.1 0 .9.9 1.5 2.1 1.5s2.1-.6 2.1-1.6" />
        </svg>
      );
    case "trend-up": // profits — a rising line
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4 16.5 9.5 11l3.5 3 6.5-7.5" />
          <path d="M15 6h4.5v4.5" />
        </svg>
      );
    case "bars": // reports — three bars
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="4.5" y="12.5" width="3.6" height="7" rx="1.2" />
          <rect x="10.2" y="7.5" width="3.6" height="12" rx="1.2" />
          <rect x="15.9" y="10" width="3.6" height="9.5" rx="1.2" />
        </svg>
      );
    case "receipt": // purchase invoice
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M6.5 3.5h11a.5.5 0 0 1 .5.5v16.3a.4.4 0 0 1-.62.33l-1.6-1.05a.4.4 0 0 0-.44 0l-1.62 1.06a.4.4 0 0 1-.44 0l-1.62-1.06a.4.4 0 0 0-.44 0l-1.62 1.06a.4.4 0 0 1-.44 0l-1.62-1.06a.4.4 0 0 0-.44 0L6.12 20.6a.4.4 0 0 1-.62-.33V4a.5.5 0 0 1 .5-.5Z" />
          <path d="M9 8h6M9 11.5h6M9 15h3.5" />
        </svg>
      );
    case "magnifier": // comparing suppliers
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="10.3" cy="10.3" r="6" />
          <path d="M14.8 14.8 20 20" />
          <path d="M8 10.3h4.6" />
        </svg>
      );
    case "send": // delivery — dispatched
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M20.3 3.8 3 10.6c-.6.24-.56 1.1.05 1.3l6.3 1.9 1.9 6.3c.2.6 1.06.65 1.3.05l6.8-17.3a.7.7 0 0 0-.85-.85Z" />
          <path d="M10.9 13.4 20.3 3.8" />
        </svg>
      );
    case "wallet": // net profit / loyalty card
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4 8.2A2.2 2.2 0 0 1 6.2 6h11.1a.7.7 0 0 1 .7.7v1.5" />
          <rect x="4" y="8.2" width="16" height="10.8" rx="2.2" />
          <circle cx="15.6" cy="13.6" r="1.15" />
        </svg>
      );
    case "truck": // suppliers — delivery in
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M3 7.5h10v8H3Z" />
          <path d="M13 10.8h3.3l2.7 2.6v2.1h-6Z" />
          <circle cx="7" cy="17.3" r="1.6" />
          <circle cx="16" cy="17.3" r="1.6" />
        </svg>
      );
    case "storefront": // online store
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4 9.3 5 4h14l1 5.3" />
          <path d="M3.6 9.3a2.3 2.3 0 0 0 4.5.3 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5-.3" />
          <path d="M5.4 10.8V20h13v-9.2" />
          <path d="M10 20v-5.3h4V20" />
        </svg>
      );
    case "scooter": // delivery apps
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="6" cy="17.8" r="2.1" />
          <circle cx="17.8" cy="17.8" r="2.1" />
          <path d="M6 17.8h4l2.3-5.6h3.7" />
          <path d="M10.3 12.2h2.9l1.5-2.7h2.4" />
          <path d="M17.8 15.7v-2.5a2 2 0 0 1 2-2" />
        </svg>
      );
    case "onion": // ingredient
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M12 6.5c3.4 0 5.8 3.1 5.8 7 0 3.6-2.6 6.5-5.8 6.5s-5.8-2.9-5.8-6.5c0-3.9 2.4-7 5.8-7Z" />
          <path d="M12 6.5V3.5M9.7 5.2 12 3.5l2.3 1.7" />
          <path d="M9 10.5c.6 3 .6 6 0 8.2M15 10.5c-.6 3-.6 6 0 8.2" />
        </svg>
      );
    case "tomato": // ingredient
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="12" cy="13.5" r="7" />
          <path d="M12 6.5c-1-1.3-2.6-1.6-4-1.1.9 1.1 2.3 1.5 4 1.1Z" />
          <path d="M12 6.5c1-1.3 2.6-1.6 4-1.1-.9 1.1-2.3 1.5-4 1.1Z" />
          <path d="M12 6.5v1.8" />
        </svg>
      );
    case "chicken": // ingredient
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M9.5 9c2.8 0 5 2.2 5 5 0 3.3-2.7 6-6 6s-6-2.7-6-6c0-.9.2-1.7.6-2.5" />
          <path d="M13 10.5c1.8-1.8 3.6-3.6 5-5 .8-.8.8-2-.2-2.6-1-.6-1.9.1-2.4.9-1.1 1.6-2.5 3.6-4 5.7" />
          <circle cx="17.6" cy="4.6" r="1.15" />
        </svg>
      );
    case "alert-triangle": // low-stock / variance alerts
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M12 4.2 21 19H3L12 4.2Z" />
          <path d="M12 10v4.2" />
          <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "clipboard-check": // stock count
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="5.5" y="4.5" width="13" height="16" rx="2.2" />
          <path d="M9 4.5V3.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
          <path d="M9 12.5l2 2 4-4.3" />
        </svg>
      );
    case "check": // plain checkmark — trust-row items etc.
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case "gift": // redeemed reward
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="4" y="9.5" width="16" height="10.5" rx="1.6" />
          <path d="M4 13.2h16" />
          <path d="M12 9.5v10.5" />
          <path d="M12 9.5c-1.4 0-3.4-.9-3.4-2.7A2.1 2.1 0 0 1 10.7 4.7c1.7 0 2.9 2 2.9 2s1.2-2 2.9-2a2.1 2.1 0 0 1 2.1 2.1c0 1.8-2 2.7-3.4 2.7" />
        </svg>
      );
    case "qr": // scan to open the card
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
          <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
          <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
          <path d="M14.5 15h3M18.5 15v3M14.5 19h2M20.5 19v-2" />
        </svg>
      );
    case "phone-tap": // cashier looks the customer up by phone number
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
          <path d="M11 18.5h2" />
          <circle cx="12" cy="8.5" r="2.6" />
        </svg>
      );
    case "bell-ping": // automatic win-back nudge
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M6.5 15.5c0-1 .4-1.6.9-2.3.5-.7.7-1.5.7-3.3 0-2.6 1.7-4.4 3.9-4.4s3.9 1.8 3.9 4.4c0 1.8.2 2.6.7 3.3.5.7.9 1.3.9 2.3H6.5Z" />
          <path d="M10.3 18.2a1.9 1.9 0 0 0 3.4 0" />
          <circle cx="17.3" cy="6.2" r="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "save-down": // card saves straight to the phone, no app
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="5" y="4" width="14" height="16" rx="2.4" />
          <path d="M12 8.5v6M9.3 12.2 12 14.8l2.7-2.6" />
        </svg>
      );
    case "chat": // reach the business directly
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" />
        </svg>
      );
    case "badge": // membership tier
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="12" cy="9.5" r="5.5" />
          <path d="M9 14.2 7.3 20.5 12 18l4.7 2.5-1.7-6.3" />
        </svg>
      );
    case "coffee": // cafe
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" />
          <path d="M16 10.5h1.5a2.3 2.3 0 0 1 0 4.6H16" />
          <path d="M8 5.5c-.6.8-.6 1.4 0 2M11.5 5.5c-.6.8-.6 1.4 0 2" />
        </svg>
      );
    case "bed": // hotel
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
          <path d="M3 18v2M21 18v2" />
          <path d="M3 13h7v-2.5a1.5 1.5 0 0 1 1.5-1.5H14a1.5 1.5 0 0 1 1.5 1.5V13" />
        </svg>
      );
    case "cross-med": // clinic
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "price-tag": // retail
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M12.5 4h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-.3.7l-8.7 8.7a1 1 0 0 1-1.4 0L3.1 14.4a1 1 0 0 1 0-1.4l8.7-8.7A1 1 0 0 1 12.5 4Z" />
          <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "car": // car wash
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4.5 15.5 6 10.2A2 2 0 0 1 7.9 8.8h8.2a2 2 0 0 1 1.9 1.4l1.5 5.3" />
          <rect x="3.5" y="15.5" width="17" height="4" rx="1.4" />
          <circle cx="7.5" cy="19.3" r="1.3" />
          <circle cx="16.5" cy="19.3" r="1.3" />
        </svg>
      );
    case "paw": // pet store
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <circle cx="12" cy="15.5" r="3.6" />
          <circle cx="6.3" cy="9.5" r="1.7" />
          <circle cx="10.4" cy="6.5" r="1.7" />
          <circle cx="13.6" cy="6.5" r="1.7" />
          <circle cx="17.7" cy="9.5" r="1.7" />
        </svg>
      );
    case "barcode": // retail
      return (
        <svg {...JOURNEY_ICON_PROPS}>
          <path d="M4 5v14M8 5v14M11 5v14M15 5v14M19 5v14" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

// Decorative only — reads as a QR code at a glance but encodes nothing; the
// real card's QR is a real one generated server-side, this is just a
// showcase mock. Finder squares are the classic 3-corner pattern; the rest
// is a fixed (not random, so SSR/client always match) filler pattern.
const QR_FINDER = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
const QR_SIZE = 17;
function qrModuleOn(r: number, c: number): boolean {
  const tail = QR_SIZE - 7;
  if (r < 7 && c < 7) return QR_FINDER[r][c] === "1";
  if (r < 7 && c >= tail) return QR_FINDER[r][c - tail] === "1";
  if (r >= tail && c < 7) return QR_FINDER[r - tail][c] === "1";
  return (r * 3 + c * 7) % 5 < 2;
}
function MiniQR() {
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < QR_SIZE; r++) {
    for (let c = 0; c < QR_SIZE; c++) {
      if (qrModuleOn(r, c)) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className="mini-qr-svg" shapeRendering="crispEdges">
      {cells}
    </svg>
  );
}

// The full-page sections, in scroll order — used by the up/down nav buttons
// to figure out "the next one" regardless of exactly where mid-section the
// visitor currently is.
const PAGE_SECTION_IDS = ["hero", "posDemoSec", "invDemoSec", "journeySec", "profitSec", "loyaltySec", "storeDemoSec", "close"];

function scrollToAdjacentSection(direction: 1 | -1) {
  const sections = PAGE_SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  if (sections.length === 0) return;
  // "current section" = the last one whose top has already scrolled past a
  // point a bit below the viewport's top edge — simple and reliable without
  // needing an IntersectionObserver just for this.
  const reference = window.scrollY + window.innerHeight * 0.3;
  let currentIndex = 0;
  sections.forEach((el, i) => {
    if (el.offsetTop <= reference) currentIndex = i;
  });
  const targetIndex = Math.min(sections.length - 1, Math.max(0, currentIndex + direction));
  sections[targetIndex].scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  // The hero's rotating-word interval lives inside a useEffect that only
  // runs once on mount, so it can't see fresh `lang` state via closure —
  // a ref gives it a live-updating value to read each tick instead.
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Only the marketing copy switches — the interactive demos (POS,
  // inventory, loyalty, storefront) stay Arabic always, since they're
  // faithful replicas of the real Rakeen product, which is Arabic-only
  // today. Faking an English product UI that doesn't exist would misrepresent
  // what a visitor actually gets.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

    type AnimGenEl = HTMLElement & { _animGen?: number };
    function animateNumber(el: HTMLElement | null, from: number, to: number, duration: number, formatter: (n: number) => string = fmtWestern) {
      if (!el) return;
      const target = el as AnimGenEl;
      const myGen = (target._animGen = (target._animGen || 0) + 1);
      const start = performance.now();
      function step(now: number) {
        if (target._animGen !== myGen) return;
        const t = Math.min(1, (now - start) / duration);
        const val = from + (to - from) * (1 - Math.pow(1 - t, 3));
        el!.textContent = formatter(val);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    let invDemoTimers: number[] = [];
    const RING_CIRC = 213.6;
    function invStockTier(pct: number) {
      if (pct < 20) return "critical";
      if (pct < 45) return "warn";
      return "ok";
    }
    function invSetTile(key: string, qty: number, parLevel: number) {
      const pct = Math.max(0, Math.min(100, Math.round((qty / parLevel) * 100)));
      const tier = invStockTier(pct);
      const tileTier = tier === "ok" ? "" : tier;
      const ringWrap = $(`inv${key}Ring`);
      const fill = $(`inv${key}Fill`);
      const pctEl = $(`inv${key}Pct`);
      const meta = $(`inv${key}Meta`);
      const tile = $(`inv${key}Tile`);
      if (ringWrap) ringWrap.className = "stock-ring-wrap " + tileTier;
      if (tile) tile.className = "stock-tile " + tileTier;
      if (fill) fill.style.strokeDashoffset = String(RING_CIRC * (1 - pct / 100));
      if (pctEl) pctEl.textContent = pct + "٪";
      const unit = INV_TILES.find((t) => t.key === key)?.unit || "كجم";
      if (meta) meta.textContent = `${qty} من ${parLevel} ${unit} متبقي`;
    }
    function invShowToast(kind: "info" | "alert" | "success", icon: string, title: string, sub: string) {
      const stack = $("invToastStack");
      if (!stack) return;
      const toast = document.createElement("div");
      toast.className = "inv-toast " + kind;
      toast.innerHTML = `<span class="inv-toast-icon">${icon}</span><div><div class="inv-toast-title">${title}</div><div class="inv-toast-sub">${sub}</div></div>`;
      stack.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("show"));
      return toast;
    }
    function invResetVisual() {
      const caption = $("invDemoCaption");
      if (caption) caption.textContent = "مخزونك الآن — كل شي تحت السيطرة";
      INV_TILES.forEach((t) => invSetTile(t.key, t.startQty, t.par));
      const stack = $("invToastStack");
      if (stack) stack.innerHTML = "";
      const slot = $("invEventSlot");
      if (slot) slot.innerHTML = "";
    }

    // Scene 4 (restock via OCR) and Scene 5 (night-count variance) are
    // bigger set-pieces than a toast can hold, so they get their own card
    // built as an HTML string into #invEventSlot — same "classic script"
    // pattern as invShowToast above, just a larger template.
    function invShowOcrCard() {
      const slot = $("invEventSlot");
      if (!slot) return;
      slot.innerHTML = `
        <div class="inv-ocr-card" id="invOcrCard">
          <div class="inv-ocr-head">
            <span class="inv-ocr-icon">${INV_ICON_SVG.invoice}</span>
            <div>
              <div class="inv-ocr-title">فاتورة مورد جديدة</div>
              <div class="inv-ocr-sub" id="invOcrStatus">جارٍ مسح الفاتورة...</div>
            </div>
          </div>
          <div class="inv-ocr-scan-wrap"><div class="inv-ocr-scan-line"></div></div>
          <div class="inv-ocr-result" id="invOcrResult">${INV_ICON_SVG.check}<span>بصل — ١٨ كجم</span></div>
        </div>`;
      requestAnimationFrame(() => $("invOcrCard")?.classList.add("show"));
    }
    function invFinishOcrCard() {
      const card = $("invOcrCard");
      card?.classList.add("done");
      const status = $("invOcrStatus");
      if (status) status.textContent = "تم استخراج الأصناف ✓";
      $("invOcrResult")?.classList.add("show");
    }
    function invHideEventSlot() {
      const slot = $("invEventSlot");
      const child = slot?.firstElementChild as HTMLElement | undefined;
      child?.classList.remove("show");
    }
    // Not a physical-count feature (Rakeen doesn't have one) — this is the
    // real signal Rakeen CAN surface honestly: it decrements stock from the
    // recipe on every sale, so if the kitchen physically runs out earlier
    // than that math predicts, the gap itself points at waste, oversized
    // portions, or usage that never went through the register.
    function invShowVarianceCard() {
      const slot = $("invEventSlot");
      if (!slot) return;
      slot.innerHTML = `
        <div class="inv-variance-card" id="invVarianceCard">
          <div class="inv-variance-head">
            <span class="inv-variance-icon">${INV_ICON_SVG.alert}</span>
            <div class="inv-variance-title">فرق بين المسجّل والواقع — طماط</div>
          </div>
          <div class="inv-variance-nums">
            <div class="inv-variance-num"><span class="inv-variance-num-label">المسجّل بركين</span><span class="inv-variance-num-value mono">6 كجم</span></div>
            <div class="inv-variance-num diff"><span class="inv-variance-num-label">بالمطبخ فعليًا</span><span class="inv-variance-num-value">خلص</span></div>
          </div>
          <p class="inv-variance-explain">لسا مسجَّل عندنا كمية، لكن المطبخ أبلغ إنه خلص فعليًا. الفرق قد يكون هدر، حصص أكبر من الوصفة، أو استخدام ما مرّ على الكاشير.</p>
          <div class="inv-variance-check">
            <span class="inv-variance-chip ok">${INV_ICON_SVG.check}الوصفة المعتمدة</span>
            <span class="inv-variance-chip ok">${INV_ICON_SVG.check}مبيعات اليوم المسجّلة</span>
          </div>
        </div>`;
      requestAnimationFrame(() => $("invVarianceCard")?.classList.add("show"));
    }

    function runInvDemo() {
      const timers: number[] = [];
      const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms * DEMO_SPEED));
      const setCaption = (text: string) => {
        const el = $("invDemoCaption");
        if (el) el.textContent = text;
      };
      let t = 800;

      // Scene 2 — a real order arrives, only the ingredients it uses react
      at(t, () => invShowToast("info", INV_ICON_SVG.order, "طلب جديد #١٠٤٣", "المطبخ بدأ التجهيز — المخزون يتحدّث تلقائيًا"));
      at(t + 700, () => {
        invSetTile("Onion", 17.8, 20);
        invSetTile("Tomato", 23.7, 26);
        invSetTile("Chicken", 31.8, 34);
      });
      t += 2400;

      // Scene 3 — several more orders later, one ingredient goes critical
      at(t, () => setCaption("طلبات متتالية تراكمت خلال الوردية"));
      at(t + 500, () => invSetTile("Onion", 3.4, 20));
      t += 1400;
      at(t, () => invShowToast("alert", INV_ICON_SVG.alert, "البصل قارب ينفد", "يكفي تقريبًا لـ ٨ طلبات قادمة بالوتيرة الحالية"));
      t += 2600;

      // Scene 4 — restock by photographing the supplier invoice, not typing it
      at(t, () => {
        setCaption("صوّر فاتورة المورد بدل ما تكتبها");
        invShowOcrCard();
      });
      t += 1500;
      at(t, () => invFinishOcrCard());
      t += 1200;
      at(t, () => invSetTile("Onion", 18, 20));
      t += 1000;
      at(t, () => {
        invHideEventSlot();
        setCaption("رجع طبيعي — بدون إدخال يدوي");
      });
      t += 1800;

      // Scene 5 — a completely different moment: the kitchen runs out of an
      // ingredient in real life before Rakeen's own recipe-based count does
      at(t, () => {
        setCaption("الطماط خلص بالمطبخ فعليًا");
        invSetTile("Tomato", 6, 26);
        invShowToast("alert", INV_ICON_SVG.alert, "الطماط: أُبلغ إنه خلص بالمطبخ", "بس المسجّل بركين لسا يقول فيه كمية — فيه فرق يستاهل مراجعة");
      });
      t += 1600;
      at(t, () => invShowVarianceCard());
      t += 700;
      at(t, () => $("invVarianceCard")?.classList.add("shake"));
      t += 3800;

      at(t, () => {
        invResetVisual();
        runInvDemo();
      });

      invDemoTimers = timers;
    }
    function resetInvDemo() {
      invDemoTimers.forEach((tm) => window.clearTimeout(tm));
      invDemoTimers = [];
      invResetVisual();
    }

    let profitTimers: number[] = [];
    function runProfit() {
      const timers: number[] = [];
      WF.forEach((row) => {
        const fill = $("wf" + row.id + "Fill");
        const val = $("wf" + row.id + "Val");
        if (fill) {
          fill.style.width = row.pct + "%";
          fill.classList.remove("flash");
          void fill.offsetWidth;
          fill.classList.add("flash");
        }
        animateNumber(val, 0, row.value, 700, (n) => (n >= 0 ? "" : "−") + fmtWestern(Math.abs(n)));
        timers.push(
          window.setTimeout(() => {
            val?.classList.remove("pop");
            void val?.offsetWidth;
            val?.classList.add("pop");
          }, 700)
        );
      });
      const nf = $("wfNetFill");
      const nv = $("wfNetVal");
      if (nf) {
        nf.style.width = NET_PCT + "%";
        nf.classList.remove("flash");
        void nf.offsetWidth;
        nf.classList.add("flash");
      }
      animateNumber(nv, 0, NET, 900, fmtWestern);
      timers.push(
        window.setTimeout(() => {
          nv?.classList.remove("pop");
          void nv?.offsetWidth;
          nv?.classList.add("pop", "pulse");
        }, 900)
      );
      profitTimers = timers;
    }
    function resetProfit() {
      profitTimers.forEach((tm) => window.clearTimeout(tm));
      profitTimers = [];
      WF.forEach((row) => {
        const fill = $("wf" + row.id + "Fill");
        const val = $("wf" + row.id + "Val");
        if (fill) {
          fill.style.width = "0%";
          fill.classList.remove("flash");
        }
        if (val) {
          val.textContent = "0";
          val.classList.remove("pop");
        }
      });
      const nf = $("wfNetFill");
      if (nf) {
        nf.style.width = "0%";
        nf.classList.remove("flash");
      }
      const nv = $("wfNetVal");
      if (nv) {
        nv.textContent = "0";
        nv.classList.remove("pop", "pulse");
      }
    }

    const moneyFmt = (n: number) => n.toFixed(2);
    let posDemoTimers: number[] = [];
    let posDemoRunning = false;

    const POS_DEMO_SCREENS = ["Products", "Tables", "Checkout", "Loyalty", "Delivery", "Incoming", "Prep", "Refund", "Shift", "Outro"];
    function posDemoShowScreen(name: string) {
      POS_DEMO_SCREENS.forEach((s) => {
        $(`screen${s}`)?.classList.toggle("active", s.toLowerCase() === name);
      });
    }
    function posDemoTap(id: string) {
      const el = $(id);
      if (!el) return;
      el.classList.add("demo-tap");
      window.setTimeout(() => el.classList.remove("demo-tap"), 300);
    }
    function posDemoResetVisual() {
      const caption = $("posDemoCaption");
      if (caption) caption.textContent = "الأقسام";
      posDemoShowScreen("products");
      $("posDemoRoot")?.removeAttribute("data-theme");
      const orderItems = $("demoOrderItems");
      if (orderItems) orderItems.innerHTML = '<div class="order-empty" id="demoOrderEmpty">اضغط على منتج لإضافته</div>';
      ["demoSubtotal", "demoVat", "demoTotal"].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = "0.00";
      });
      const payBtn = $("demoPayBtn");
      if (payBtn) {
        payBtn.classList.remove("paid");
        payBtn.textContent = "ادفع";
      }
      document.querySelectorAll<HTMLElement>(".pos-demo .product-card").forEach((c) => {
        c.classList.remove("flash", "demo-hide");
      });
      $("catBoxes")?.classList.remove("active");
      $("catSauces")?.classList.remove("active");
      $("catAll")?.classList.add("active");
      $("demoFavToggle")?.classList.remove("active");
      $("demoFavStar")?.classList.remove("on");
      const searchInput = $("demoSearchInput") as HTMLInputElement | null;
      if (searchInput) searchInput.value = "";
      const table3 = $("demoTable3");
      if (table3) {
        table3.className = "table-card available";
        const s = table3.querySelector(".table-status");
        if (s) s.textContent = "متاحة";
      }
      $("methodCard")?.classList.remove("active");
      $("methodSplit")?.classList.remove("active");
      $("methodCash")?.classList.add("active");
      $("splitPanel")?.classList.remove("open");
      $("splitModeMethod")?.classList.remove("active");
      $("splitModePeople")?.classList.add("active");
      $("splitPeopleView")?.classList.add("show");
      $("splitMethodView")?.classList.remove("show");
      $("splitNetworkRow")?.classList.remove("active");
      $("splitCashRow")?.classList.remove("active");
      const splitNetwork = $("splitNetwork");
      if (splitNetwork) splitNetwork.textContent = "0.00";
      const splitCash = $("splitCash");
      if (splitCash) splitCash.textContent = "0.00";
      $("loyaltyGain")?.classList.remove("show");
      $("loyaltyPoints")?.classList.remove("bump");
      const loyaltyPoints = $("loyaltyPoints");
      if (loyaltyPoints) loyaltyPoints.textContent = "١٢ نقطة";
      $("channelDelivery")?.classList.remove("active");
      $("channelPickup")?.classList.add("active");
      [0, 1, 2].forEach((i) => $(`platform${i}`)?.classList.remove("active"));
      const ringWrap = $("deliveryRingWrap");
      if (ringWrap) ringWrap.className = "delivery-ring-wrap";
      const ringFill = $("ringFill");
      if (ringFill) ringFill.style.strokeDashoffset = "20";
      const ringTime = $("ringTime");
      if (ringTime) ringTime.textContent = "12:00";
      $("incomingCard")?.classList.remove("pulse");
      $("incomingBell")?.classList.remove("ring");
      const prepVal = $("prepVal");
      if (prepVal) prepVal.textContent = "10 دقائق";
      $("acceptBtn")?.classList.remove("paid");
      $("readyBtn")?.classList.remove("paid");
      $("refundBtn")?.classList.remove("active");
      $("refundDone")?.classList.remove("show");
      $("shiftBtn")?.classList.remove("paid");
    }

    function runPosDemo() {
      if (posDemoRunning) return;
      posDemoRunning = true;
      const timers: number[] = [];
      const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms * DEMO_SPEED));
      const setCaption = (text: string) => {
        const el = $("posDemoCaption");
        if (el) el.textContent = text;
      };
      let t = 300;

      // 1) categories
      at(t, () => setCaption("١ — الأقسام"));
      at(t + 200, () => { $("catAll")?.classList.remove("active"); $("catBoxes")?.classList.add("active"); posDemoTap("catBoxes"); });
      at(t + 1000, () => { $("catBoxes")?.classList.remove("active"); $("catSauces")?.classList.add("active"); posDemoTap("catSauces"); });
      at(t + 1800, () => { $("catSauces")?.classList.remove("active"); $("catAll")?.classList.add("active"); posDemoTap("catAll"); });
      t += 2600;

      // 2) search — actually filters the grid
      at(t, () => setCaption("٢ — البحث السريع"));
      const query = "بوكس وسط مشكّل";
      const searchStart = t + 200;
      [...query].forEach((ch, i) => {
        at(searchStart + i * 65, () => {
          const input = $("demoSearchInput") as HTMLInputElement | null;
          if (input) input.value += ch;
        });
      });
      const searchDone = searchStart + query.length * 65;
      at(searchDone + 150, () => {
        [1, 2, 3].forEach((i) => $(`demoProd${i}`)?.classList.add("demo-hide"));
        $("demoProd0")?.classList.add("flash");
      });
      at(searchDone + 1700, () => {
        $("demoProd0")?.classList.remove("flash");
        [1, 2, 3].forEach((i) => $(`demoProd${i}`)?.classList.remove("demo-hide"));
        const input = $("demoSearchInput") as HTMLInputElement | null;
        if (input) input.value = "";
      });
      t = searchDone + 2300;

      // 3) favorite star
      at(t, () => setCaption("٣ — المفضّلة"));
      at(t + 250, () => {
        $("demoFavToggle")?.classList.add("active");
        $("demoFavStar")?.classList.add("on");
        posDemoTap("demoFavToggle");
      });
      at(t + 1700, () => $("demoFavToggle")?.classList.remove("active"));
      t += 2400;

      // 4) add to order
      at(t, () => setCaption("٤ — إضافة صنف للطلب"));
      const orderSteps = [
        { prodId: "demoProd0", name: "بوكس وسط مشكّل", price: 49 },
        { prodId: "demoProd1", name: "بوكس كبير مشكّل", price: 99 },
      ];
      let subtotal = 0;
      function addRow(step: (typeof orderSteps)[number]) {
        const orderItems = $("demoOrderItems");
        if (!orderItems) return;
        const prevSubtotal = subtotal;
        subtotal += step.price;
        const empty = $("demoOrderEmpty");
        if (empty) empty.remove();
        const row = document.createElement("div");
        row.className = "order-item";
        row.innerHTML = `<div class="oi-row"><span class="oi-qty">1×</span><div class="oi-info"><div class="oi-name">${step.name}</div></div><span class="oi-total mono">${step.price.toFixed(2)}</span></div>`;
        orderItems.appendChild(row);
        requestAnimationFrame(() => row.classList.add("in"));
        animateNumber($("demoSubtotal"), prevSubtotal, subtotal, 500, moneyFmt);
        animateNumber($("demoVat"), prevSubtotal * 0.15, subtotal * 0.15, 500, moneyFmt);
        animateNumber($("demoTotal"), prevSubtotal * 1.15, subtotal * 1.15, 500, moneyFmt);
      }
      let ot = t + 200;
      orderSteps.forEach((step) => {
        at(ot, () => { $(step.prodId)?.classList.add("flash"); posDemoTap(step.prodId); });
        at(ot + 550, () => {
          $(step.prodId)?.classList.remove("flash");
          addRow(step);
        });
        ot += 1500;
      });
      t = ot + 1800;

      // 5) tables
      at(t, () => { setCaption("٥ — الطاولات وحجزها"); posDemoShowScreen("tables"); });
      at(t + 700, () => {
        const card = $("demoTable3");
        if (!card) return;
        card.className = "table-card reserved";
        const s = card.querySelector(".table-status");
        if (s) s.textContent = "محجوزة";
        posDemoTap("demoTable3");
      });
      t += 2700;

      // 6) checkout: payment method + split bill
      at(t, () => { setCaption("٦ — الدفع: كاش، بطاقة، أو تقسيم"); posDemoShowScreen("checkout"); });
      at(t + 600, () => { $("methodCash")?.classList.remove("active"); $("methodCard")?.classList.add("active"); posDemoTap("methodCard"); });
      at(t + 1500, () => {
        $("methodCard")?.classList.remove("active");
        $("methodSplit")?.classList.add("active");
        $("splitPanel")?.classList.add("open");
        posDemoTap("methodSplit");
      });
      at(t + 2100, () => {
        const c = $("splitCount");
        const e = $("splitEach");
        if (c) c.textContent = "3";
        if (e) e.textContent = (170.2 / 3).toFixed(2);
      });
      at(t + 3200, () => {
        $("splitModePeople")?.classList.remove("active");
        $("splitModeMethod")?.classList.add("active");
        $("splitPeopleView")?.classList.remove("show");
        $("splitMethodView")?.classList.add("show");
        posDemoTap("splitModeMethod");
      });
      at(t + 3800, () => {
        $("splitNetworkRow")?.classList.add("active");
        const n = $("splitNetwork");
        if (n) n.textContent = "120.00";
      });
      at(t + 4500, () => {
        $("splitCashRow")?.classList.add("active");
        const c = $("splitCash");
        if (c) c.textContent = "50.20";
      });
      t += 6200;

      // 7) loyalty points
      at(t, () => { setCaption("٧ — نقاط الولاء"); posDemoShowScreen("loyalty"); });
      at(t + 600, () => {
        const pts = $("loyaltyPoints");
        if (pts) { pts.textContent = "١٣ نقطة"; pts.classList.add("bump"); }
        $("loyaltyGain")?.classList.add("show");
        window.setTimeout(() => $("loyaltyPoints")?.classList.remove("bump"), 350);
      });
      t += 2500;

      // 8) delivery: channel + apps
      at(t, () => { setCaption("٨ — التوصيل: اختيار التطبيق"); posDemoShowScreen("delivery"); });
      at(t + 500, () => { $("channelPickup")?.classList.remove("active"); $("channelDelivery")?.classList.add("active"); posDemoTap("channelDelivery"); });
      at(t + 1100, () => { $("platform0")?.classList.add("active"); posDemoTap("platform0"); });
      at(t + 1900, () => { $("platform0")?.classList.remove("active"); $("platform1")?.classList.add("active"); posDemoTap("platform1"); });
      t += 2900;

      // 9) incoming order — a real online order from the restaurant's own store
      at(t, () => {
        setCaption("٩ — طلب أونلاين جديد");
        posDemoShowScreen("incoming");
        $("incomingCard")?.classList.add("pulse");
      });
      at(t + 250, () => $("incomingBell")?.classList.add("ring"));
      at(t + 1000, () => $("incomingBell")?.classList.remove("ring"));
      at(t + 1400, () => {
        const v = $("prepVal");
        if (v) v.textContent = "15 دقيقة";
      });
      at(t + 2500, () => { $("acceptBtn")?.classList.add("paid"); posDemoTap("acceptBtn"); });
      t += 3400;

      // 10) order prep — live countdown (warn at 5 min, urgent when overdue) + ready button
      at(t, () => { setCaption("١٠ — تجهيز الطلب"); posDemoShowScreen("prep"); });
      at(t + 600, () => {
        const f = $("ringFill");
        const time = $("ringTime");
        if (f) f.style.strokeDashoffset = "70";
        if (time) time.textContent = "07:30";
      });
      at(t + 1800, () => {
        const wrap = $("deliveryRingWrap");
        const f = $("ringFill");
        const time = $("ringTime");
        wrap?.classList.add("warn");
        if (f) f.style.strokeDashoffset = "125";
        if (time) time.textContent = "05:00";
      });
      at(t + 3000, () => {
        const wrap = $("deliveryRingWrap");
        const f = $("ringFill");
        const time = $("ringTime");
        wrap?.classList.remove("warn");
        wrap?.classList.add("urgent");
        if (f) f.style.strokeDashoffset = "158";
        if (time) time.textContent = "00:00";
      });
      at(t + 3800, () => { $("readyBtn")?.classList.add("paid"); posDemoTap("readyBtn"); });
      t += 4600;

      // 11) refund / cancel
      at(t, () => { setCaption("١١ — استرجاع أو إلغاء الطلب"); posDemoShowScreen("refund"); });
      at(t + 700, () => { $("refundBtn")?.classList.add("active"); posDemoTap("refundBtn"); });
      at(t + 1400, () => $("refundDone")?.classList.add("show"));
      t += 3000;

      // 12) dark/light theme
      at(t, () => { setCaption("١٢ — الوضع الداكن والفاتح"); posDemoShowScreen("products"); });
      at(t + 500, () => { $("posDemoRoot")?.setAttribute("data-theme", "dark"); posDemoTap("demoThemeToggle"); });
      at(t + 2300, () => $("posDemoRoot")?.removeAttribute("data-theme"));
      t += 2900;

      // 13) shift close + reconciliation
      at(t, () => { setCaption("١٣ — إغلاق الوردية والموازنة"); posDemoShowScreen("shift"); });
      at(t + 1200, () => { $("shiftBtn")?.classList.add("paid"); posDemoTap("shiftBtn"); });
      t += 3000;

      // 14) closing beat — big, plain: highlight reel, not the whole product
      at(t, () => { setCaption("متصل مباشرة: الكاشير ← المطبخ ← لوحة التحكم، أول بأول"); posDemoShowScreen("outro"); });
      t += 4200;

      // loop
      at(t, () => {
        posDemoResetVisual();
        posDemoRunning = false;
        runPosDemo();
      });

      posDemoTimers = timers;
    }
    function resetPosDemo() {
      posDemoTimers.forEach((tm) => window.clearTimeout(tm));
      posDemoTimers = [];
      posDemoRunning = false;
      posDemoResetVisual();
    }

    let heroTimers: number[] = [];
    let heroRotInterval: number | null = null;
    let heroRotIndex = 0;
    function runHero() {
      const wallA = $("wallA");
      const wallAInner = $("wallAInner");
      const wallB = $("wallB");
      const wallBInner = $("wallBInner");
      const wallCorner = $("wallCorner");
      const wallWordReveal = $("wallWordReveal");
      const headline = $("pillarHeadlineLight");
      const wordOld = $("wordOld");
      const subline = $("heroSubline");
      const stage = $("dashboardShowcase");
      const dashCards = Array.from(document.querySelectorAll<HTMLElement>(".dash-card"));
      const headline2 = $("heroHeadline2");
      const rotatingSub = $("heroRotatingSub");
      if (!wallA || !wallAInner || !wallB || !wallBInner || !wallCorner || !wallWordReveal || !headline || !wordOld) return;
      // Timings below are real milliseconds (HERO_SPEED stays at 1 — no
      // blanket multiplier). First content lands quickly (~2.9s) so a real
      // visit never reads as a blank page, but every beat past that holds
      // long enough to actually read before the next one takes over — a
      // uniform speed-up previously made headline+subline appear and get
      // replaced within ~200ms of each other, which was too fast to read.
      const at = (ms: number, fn: () => void) => heroTimers.push(window.setTimeout(fn, ms * HERO_SPEED));
      at(150, () => wallA.classList.add("rise"));
      // alone for a moment before the green pillar arrives — a small
      // uneasy wobble, like it's about to topple
      at(550, () => wallAInner.classList.add("shake"));
      at(950, () => wallB.classList.add("rise"));
      at(1150, () => wallAInner.classList.remove("shake"));
      at(1500, () => wallAInner.classList.add("impact"));
      at(1600, () => wallBInner.classList.add("jolt"));
      at(2000, () => wallB.classList.add("glow"));
      at(2350, () => {
        wallCorner.classList.add("dissolve");
        wallWordReveal.classList.add("show");
      });
      at(2900, () => headline.classList.add("show"));
      at(3800, () => wordOld.classList.add("struck"));

      // "ليس نظامًا عامًا... بل نظام مصمم لطبيعة عملك" — then the wordmark
      // becomes the center of a brand moment: a dedicated dashboard for
      // each industry appears one at a time (Apple-keynote depth/blur),
      // then everything recedes and the wordmark itself pulses once —
      // "رجع يتجمع" — before the closing headline + rotating industry list.
      at(4300, () => subline?.classList.add("show"));
      // Beat A (headline+subline) fades out just before Beat B (the
      // dashboard showcase) fades in, in the same spot — see
      // .hero-narrative-stack in rakeen-landing.css. ~2.9s of read time
      // with both lines visible together before it hands off.
      at(7200, () => {
        headline.classList.remove("show");
        subline?.classList.remove("show");
      });
      at(7500, () => stage?.classList.add("show"));

      const applyDashSlots = (active: number) => {
        dashCards.forEach((c, i) => {
          c.classList.remove("slot-active", "slot-prev", "slot-next", "slot-hidden");
          if (i === active) c.classList.add("slot-active");
          else if (i === (active - 1 + dashCards.length) % dashCards.length) c.classList.add("slot-prev");
          else if (i === (active + 1) % dashCards.length) c.classList.add("slot-next");
          else c.classList.add("slot-hidden");
        });
      };
      const dashStep = 1900;
      const showcaseStart = 7800;
      for (let i = 0; i < dashCards.length; i++) {
        at(showcaseStart + i * dashStep, () => applyDashSlots(i));
      }
      const showcaseEnd = showcaseStart + dashCards.length * dashStep;

      at(showcaseEnd + 300, () => {
        stage?.classList.remove("show");
        stage?.classList.add("hide");
      });
      // collapse the showcase's own layout space once its fade-out has
      // actually finished, so the closing headline sits right where the
      // showcase left off instead of low down with a dead gap above
      at(showcaseEnd + 900, () => stage?.classList.add("gone"));
      at(showcaseEnd + 1000, () => wallWordReveal.classList.add("pulse"));
      at(showcaseEnd + 1800, () => wallWordReveal.classList.remove("pulse"));

      at(showcaseEnd + 1600, () => headline2?.classList.add("show"));
      at(showcaseEnd + 2600, () => {
        rotatingSub?.classList.add("show");
        heroRotIndex = 0;
        const word = $("heroRotWord");
        const rotWords = () => (langRef.current === "ar" ? HERO_ROTATING_WORDS : HERO_ROTATING_WORDS_EN);
        if (word) word.textContent = rotWords()[0];
        heroRotInterval = window.setInterval(() => {
          const w = $("heroRotWord");
          if (!w) return;
          w.classList.add("out");
          window.setTimeout(() => {
            const words = rotWords();
            heroRotIndex = (heroRotIndex + 1) % words.length;
            w.textContent = words[heroRotIndex];
            w.classList.add("in-prep");
            w.classList.remove("out");
            requestAnimationFrame(() => w.classList.remove("in-prep"));
          }, 260);
        }, 1500);
      });
    }
    function resetHero() {
      heroTimers.forEach((tm) => window.clearTimeout(tm));
      heroTimers = [];
      if (heroRotInterval !== null) {
        window.clearInterval(heroRotInterval);
        heroRotInterval = null;
      }
      heroRotIndex = 0;
      $("wallA")?.classList.remove("rise");
      $("wallAInner")?.classList.remove("shake", "impact");
      $("wallB")?.classList.remove("rise", "glow");
      $("wallBInner")?.classList.remove("jolt");
      $("wallCorner")?.classList.remove("dissolve");
      $("wallWordReveal")?.classList.remove("show", "pulse");
      $("pillarHeadlineLight")?.classList.remove("show");
      $("wordOld")?.classList.remove("struck");
      $("heroSubline")?.classList.remove("show");
      $("dashboardShowcase")?.classList.remove("show", "hide", "gone");
      document.querySelectorAll<HTMLElement>(".dash-card").forEach((c) => c.classList.remove("slot-active", "slot-prev", "slot-next", "slot-hidden"));
      $("heroHeadline2")?.classList.remove("show");
      $("heroRotatingSub")?.classList.remove("show");
      const word = $("heroRotWord");
      if (word) {
        word.textContent = langRef.current === "ar" ? HERO_ROTATING_WORDS[0] : HERO_ROTATING_WORDS_EN[0];
        word.classList.remove("out", "in-prep");
      }
    }

    function animateCount(el: HTMLElement, from: number, to: number, duration: number) {
      const start = performance.now();
      function tick(now: number) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * eased).toLocaleString("en-US");
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // A realistic, self-looping simulation of the actual Rakeen dashboard —
    // not a diagram of the concept. One cycle: order arrives → paid →
    // kitchen receives → inventory/cost/profit update live → reports
    // refresh — then it resets and replays for as long as the section is
    // in view, like a screen recording on autoplay.
    let journeyTimers: number[] = [];
    let journeyLoopActive = false;

    function resetJourneyVisual() {
      $("jrOrderCard")?.classList.remove("in");
      const orderStatus = $("jrOrderStatus");
      if (orderStatus) {
        orderStatus.textContent = "قيد الانتظار";
        orderStatus.classList.remove("paid");
      }
      $("jrKitchenRow")?.classList.remove("active");
      const kitchenStatus = $("jrKitchenStatus");
      if (kitchenStatus) kitchenStatus.textContent = "بانتظار الطلب";
      $("jrSimInvCell")?.classList.remove("updated");
      $("jrSimCostCell")?.classList.remove("updated");
      $("jrSimProfitCell")?.classList.remove("updated");
      const invEl = $("jrInvVal");
      if (invEl) invEl.textContent = String(JOURNEY_VALUES.invStart);
      const costEl = $("jrCostVal");
      if (costEl) costEl.textContent = JOURNEY_VALUES.costStart.toLocaleString("en-US");
      const profitEl = $("jrProfitVal");
      if (profitEl) profitEl.textContent = JOURNEY_VALUES.profitStart.toLocaleString("en-US");
      const reportsIcon = $("jrReportsIcon");
      reportsIcon?.classList.remove("spin", "done");
      const reportsStatus = $("jrReportsStatus");
      if (reportsStatus) {
        reportsStatus.textContent = "بانتظار التحديث";
        reportsStatus.classList.remove("done");
      }
    }

    function playJourneyCycle() {
      const t: number[] = [];
      t.push(window.setTimeout(() => $("jrOrderCard")?.classList.add("in"), 100));
      t.push(
        window.setTimeout(() => {
          const st = $("jrOrderStatus");
          if (st) {
            st.textContent = "مدفوع ✓";
            st.classList.add("paid");
          }
        }, 1000)
      );
      t.push(
        window.setTimeout(() => {
          $("jrKitchenRow")?.classList.add("active");
          const ks = $("jrKitchenStatus");
          if (ks) ks.textContent = "استلم الطلب ✓";
        }, 1650)
      );
      t.push(
        window.setTimeout(() => {
          $("jrSimInvCell")?.classList.add("updated");
          const inv = $("jrInvVal");
          if (inv) animateCount(inv, JOURNEY_VALUES.invStart, JOURNEY_VALUES.invEnd, 600);
        }, 2300)
      );
      t.push(
        window.setTimeout(() => {
          $("jrSimCostCell")?.classList.add("updated");
          const cost = $("jrCostVal");
          if (cost) animateCount(cost, JOURNEY_VALUES.costStart, JOURNEY_VALUES.costEnd, 700);
        }, 2850)
      );
      t.push(
        window.setTimeout(() => {
          $("jrSimProfitCell")?.classList.add("updated");
          const profit = $("jrProfitVal");
          if (profit) animateCount(profit, JOURNEY_VALUES.profitStart, JOURNEY_VALUES.profitEnd, 900);
        }, 3400)
      );
      t.push(window.setTimeout(() => $("jrReportsIcon")?.classList.add("spin"), 4100));
      t.push(
        window.setTimeout(() => {
          const icon = $("jrReportsIcon");
          icon?.classList.remove("spin");
          icon?.classList.add("done");
          const status = $("jrReportsStatus");
          if (status) {
            status.textContent = "✓ محدّثة الآن";
            status.classList.add("done");
          }
        }, 4700)
      );
      t.push(window.setTimeout(resetJourneyVisual, 6600));
      t.push(
        window.setTimeout(() => {
          if (journeyLoopActive) playJourneyCycle();
        }, 7200)
      );
      journeyTimers = t;
    }

    function runJourney() {
      journeyLoopActive = true;
      playJourneyCycle();
    }
    function resetJourney() {
      journeyLoopActive = false;
      journeyTimers.forEach((tm) => window.clearTimeout(tm));
      journeyTimers = [];
      resetJourneyVisual();
    }

    // A realistic customer journey, self-looping while the section is in
    // view — one real card (Anoob), earning → saving to the phone →
    // returning → redeeming → the owner's own real dashboard numbers →
    // an automatic win-back nudge. Every claim here maps to something that
    // actually exists in the product today (verified against the real
    // dashboard/POS/loyalty-card code before writing this):
    //  - card save is the real PWA "add to home screen" flow, not a native
    //    Apple/Google Wallet pass (Rakeen has no such integration)
    //  - the win-back nudge is delivered as a real web push notification,
    //    not WhatsApp (no automated WhatsApp sending exists)
    //  - Scene 5's numbers are the real, currently-tracked loyalty KPIs
    //    (returning customers, points issued, active members) — not the
    //    brief's "revenue from loyalty"/"rewards redeemed" figures, which
    //    aren't tracked anywhere in the product yet
    let loyaltyTimers: number[] = [];
    let loyaltyLoopActive = false;
    let loyCurrentPoints = LOYALTY_STORY_VALUES.earnStart;

    function loyShowToast(icon: string, title: string, sub: string) {
      const slot = $("loyEventSlot");
      if (!slot) return;
      // Same single-slot replacement as loyShowCard/loyShowStats — this
      // used to appendChild instead, so a faded (but still-present, still
      // taking up layout space) card from the previous scene would stack
      // underneath the new toast, pushing it out of place.
      slot.innerHTML = `<div class="loy-toast" id="loyEventToast"><span class="loy-toast-icon">${icon}</span><div><div class="loy-toast-title">${title}</div><div class="loy-toast-sub">${sub}</div></div></div>`;
      requestAnimationFrame(() => $("loyEventToast")?.classList.add("show"));
    }
    function loyShowCard(icon: string, title: string, sub: string) {
      const slot = $("loyEventSlot");
      if (!slot) return;
      slot.innerHTML = `
        <div class="loy-card" id="loyEventCard">
          <span class="loy-card-icon">${icon}</span>
          <div>
            <div class="loy-card-title">${title}</div>
            <div class="loy-card-sub">${sub}</div>
          </div>
        </div>`;
      requestAnimationFrame(() => $("loyEventCard")?.classList.add("show"));
    }
    function loyShowStats() {
      const slot = $("loyEventSlot");
      if (!slot) return;
      slot.innerHTML = `
        <div class="loy-stats-row" id="loyStatsRow">
          <div class="loy-stat"><span class="loy-stat-label">عملاء عائدون اليوم</span><span class="loy-stat-value mono" id="loyStatReturning">0٪</span></div>
          <div class="loy-stat"><span class="loy-stat-label">نقاط مصدرة اليوم</span><span class="loy-stat-value mono" id="loyStatIssued">0</span></div>
          <div class="loy-stat"><span class="loy-stat-label">أعضاء تفاعلوا اليوم</span><span class="loy-stat-value mono" id="loyStatActive">0</span></div>
        </div>`;
      requestAnimationFrame(() => {
        $("loyStatsRow")?.classList.add("show");
        const ret = $("loyStatReturning");
        if (ret) {
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / 700);
            ret.textContent = Math.round(62 * (1 - Math.pow(1 - p, 3))) + "٪";
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        const issued = $("loyStatIssued");
        if (issued) animateCount(issued, 0, 1240, 900);
        const active = $("loyStatActive");
        if (active) animateCount(active, 0, 38, 700);
      });
    }
    function loyClearSlot() {
      const slot = $("loyEventSlot");
      const child = slot?.firstElementChild as HTMLElement | undefined;
      child?.classList.remove("show");
    }
    function loySetPoints(value: number, pulse: boolean) {
      const el = $("loyPointsVal");
      if (el) {
        const from = loyCurrentPoints;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 700);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(from + (value - from) * eased).toLocaleString("ar-SA");
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      loyCurrentPoints = value;
      if (pulse) {
        const card = $("loyHeroCard");
        card?.classList.add("earn-pulse");
        window.setTimeout(() => card?.classList.remove("earn-pulse"), 750);
      }
    }

    const loyAt = (ms: number, fn: () => void) => loyaltyTimers.push(window.setTimeout(fn, ms));
    const loyLightFeature = (id: string) => $(`loyFeat-${id}`)?.classList.add("lit");

    // Every loop opens on the multi-brand fan — the real cards float gently
    // (a continuous CSS animation, not a JS-timed cycle) to say "every
    // restaurant gets its own identity" — then Scene 2's focus shift hands
    // off to the single hero card the rest of the story plays out on.
    function playLoyaltyIntro() {
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".loy-intro-card"));
      const entranceStep = 140;
      cards.forEach((c, i) => loyAt(i * entranceStep, () => c.classList.add("in")));
      loyAt(300, () => loyLightFeature("brand"));
      const entranceEnd = cards.length * entranceStep + 350;
      const holdEnd = entranceEnd + 1900; // ~2s of ambient floating before the focus shift

      loyAt(holdEnd, () => {
        $("loyIntroRow")?.classList.add("fade-out");
        $("loyHeroWrap")?.classList.add("show");
      });
      // collapse its layout space only once the fade transition has
      // actually finished, so the hero card doesn't leave a gap above it
      loyAt(holdEnd + 550, () => $("loyIntroRow")?.classList.add("gone"));
      loyAt(holdEnd + 650, () => {
        if (loyaltyLoopActive) playLoyaltyCycle();
      });
    }

    function playLoyaltyCycle() {
      const at = loyAt;
      let t = 600;

      // Scene 1 — order paid, points land immediately
      at(t, () => loyShowToast(LOY_ICON_SVG.sparkle, "حصلت على ١٥ نقطة! 🎉", "بعد إتمام الدفع مباشرة"));
      at(t + 500, () => {
        loySetPoints(LOYALTY_STORY_VALUES.earnEnd, true);
        loyLightFeature("points");
      });
      t += 2600;

      // Scene 2 — card saves straight to the phone, no app to download
      at(t, () => {
        loyClearSlot();
        loyShowCard(LOY_ICON_SVG.saveDown, "البطاقة تُحفظ على جوالك", "بدون تطبيق، بدون تسجيل — تظهر على شاشتك مباشرة");
        loyLightFeature("save");
      });
      t += 2600;

      // Scene 3 — days later, the customer returns
      at(t, () => {
        loyClearSlot();
        loyShowToast(LOY_ICON_SVG.phoneTap, "الكاشير: رقم الجوال؟", "البطاقة تفتح فورًا — ١٨٠ نقطة، عضوية Gold");
        $("loyTierChip")?.classList.add("tier-pulse");
        loyLightFeature("tier");
      });
      t += 400;
      at(t, () => $("loyTierChip")?.classList.remove("tier-pulse"));
      t += 2400;

      // Scene 4 — redeem, then start earning again right away
      at(t, () => {
        loyClearSlot();
        loyShowCard(LOY_ICON_SVG.gift, "١٨٠ نقطة → وجبة مجانية", "العميل يأكد الاستبدال من بطاقته بنفسه");
        loyLightFeature("redeem");
      });
      at(t + 900, () => loySetPoints(LOYALTY_STORY_VALUES.afterRedeem, true));
      t += 2400;
      at(t, () => {
        loyClearSlot();
        loyShowToast(LOY_ICON_SVG.sparkle, "بدأ يكسب نقاط من جديد", "أول ما دفع، رصيده رجع يتحرك");
      });
      at(t + 500, () => loySetPoints(LOYALTY_STORY_VALUES.finalPoints, false));
      t += 2200;

      // Scene 5 — the owner's own dashboard, real tracked numbers
      at(t, () => {
        loyClearSlot();
        loyShowStats();
      });
      t += 3000;

      // Scene 6 — automatic re-engagement, no follow-up from the owner
      at(t, () => {
        loyClearSlot();
        loyShowCard(LOY_ICON_SVG.bellPing, "تذكير تلقائي بعد فترة غياب", "“من فترة ما شفناك 👋 عندك نقاط بانتظارك” — يرسل نفسه");
        loyLightFeature("notify");
        loyLightFeature("chat");
      });
      t += 3200;

      at(t, () => {
        loyClearSlot();
      });
      t += 700;
      at(t, () => {
        if (!loyaltyLoopActive) return;
        loyCurrentPoints = LOYALTY_STORY_VALUES.earnStart;
        const el = $("loyPointsVal");
        if (el) el.textContent = loyCurrentPoints.toLocaleString("ar-SA");
        $("loyHeroWrap")?.classList.remove("show");
        $("loyIntroRow")?.classList.remove("fade-out", "gone");
        document.querySelectorAll<HTMLElement>(".loy-intro-card").forEach((c) => c.classList.remove("in"));
        document.querySelectorAll<HTMLElement>(".loyalty-feature").forEach((c) => c.classList.remove("lit"));
        playLoyaltyIntro();
      });
    }
    function runLoyalty() {
      loyaltyLoopActive = true;
      playLoyaltyIntro();
    }
    function resetLoyalty() {
      loyaltyLoopActive = false;
      loyaltyTimers.forEach((tm) => window.clearTimeout(tm));
      loyaltyTimers = [];
      loyCurrentPoints = LOYALTY_STORY_VALUES.earnStart;
      const slot = $("loyEventSlot");
      if (slot) slot.innerHTML = "";
      const el = $("loyPointsVal");
      if (el) el.textContent = loyCurrentPoints.toLocaleString("ar-SA");
      $("loyHeroCard")?.classList.remove("earn-pulse");
      $("loyTierChip")?.classList.remove("tier-pulse");
      $("loyHeroWrap")?.classList.remove("show");
      $("loyIntroRow")?.classList.remove("fade-out", "gone");
      document.querySelectorAll<HTMLElement>(".loy-intro-card").forEach((c) => c.classList.remove("in"));
      document.querySelectorAll<HTMLElement>(".loyalty-feature").forEach((c) => c.classList.remove("lit"));
    }

    // Storefront walkthrough — mirrors runPosDemo's at()-timeline pattern.
    // Real عنوب data throughout (menu, prices, photos, box-builder items).
    // Payment methods are shown all-enabled per the owner's explicit ask —
    // the real live store only accepts cash today (card/Apple Pay render
    // disabled with a "قريبًا" badge), this demo intentionally shows the
    // finished-product version.
    let storeDemoTimers: number[] = [];
    let storeDemoRunning = false;
    const SD_SCREENS = ["menu", "branch", "location", "box", "checkout", "status"];
    function sdShowScreen(name: string) {
      SD_SCREENS.forEach((s) => $(`sdScreen${s.charAt(0).toUpperCase() + s.slice(1)}`)?.classList.toggle("active", s === name));
    }
    function sdTap(id: string) {
      const el = $(id);
      if (!el) return;
      el.classList.add("demo-tap");
      window.setTimeout(() => el.classList.remove("demo-tap"), 300);
    }
    function sdResetVisual() {
      const caption = $("storeDemoCaption");
      if (caption) caption.textContent = "١ — عميلك يفتح متجرك";
      sdShowScreen("menu");
      $("sdChannelDelivery")?.classList.add("active");
      $("sdChannelPickup")?.classList.remove("active");
      $("sdBranchMain")?.classList.remove("selected");
      const locSub = $("sdLocationSub");
      if (locSub) locSub.textContent = "نحدد موقعك تلقائيًا...";
      const pin = $("sdMapPin");
      if (pin) pin.style.transform = "";
      $("sdCartBar")?.classList.remove("show");
      STORE_BOX_ITEMS.forEach((_, i) => {
        const el = $(`sdBoxQty${i}`);
        if (el) el.textContent = "0";
      });
      const fill = $("sdBoxProgress");
      if (fill) fill.style.width = "0%";
      ["sdNameInput", "sdPhoneInput", "sdAddressInput"].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = "";
      });
      STORE_PAYMENT_METHODS.forEach((m) => $(`sdPay${m.id}`)?.classList.toggle("selected", m.id === "cash"));
      $("sdStep2")?.classList.remove("active", "done");
      $("sdStep3")?.classList.remove("active", "done");

      $("sdFrame")?.classList.remove("sent");
      $("sdConnectLine")?.classList.remove("show");
      $("sdConnected")?.classList.remove("show");
      ["sdConnKitchen", "sdConnInventory", "sdConnLoyalty", "sdConnReports"].forEach((id) => $(id)?.classList.remove("active", "done"));
      const kitchenStatus = $("sdKitchenStatus");
      if (kitchenStatus) kitchenStatus.textContent = "استلم الطلب #١٠٤٣";
      const onion = $("sdInvOnion");
      if (onion) onion.textContent = "18.0";
      const pts = $("sdLoyaltyPts");
      if (pts) pts.textContent = "0";
      const sales = $("sdRepSales");
      if (sales) sales.textContent = "18,240";
      const orders = $("sdRepOrders");
      if (orders) orders.textContent = "248";
      const profit = $("sdRepProfit");
      if (profit) profit.textContent = "6,271";
      $("sdConnectedLine")?.classList.remove("show");
    }
    function runStoreDemo() {
      if (storeDemoRunning) return;
      storeDemoRunning = true;
      const timers: number[] = [];
      const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms * DEMO_SPEED));
      const setCaption = (text: string) => {
        const el = $("storeDemoCaption");
        if (el) el.textContent = text;
      };
      let t = 300;

      // 1) storefront landing
      at(t, () => setCaption("١ — عميلك يفتح متجرك"));
      at(t + 500, () => sdTap("sdCatBoxes"));
      t += 1400;

      // 2) pickup → pick a branch
      at(t, () => {
        setCaption("٢ — استلام؟ يختار فرعه");
        sdTap("sdChannelPickup");
        $("sdChannelPickup")?.classList.add("active");
        $("sdChannelDelivery")?.classList.remove("active");
      });
      at(t + 350, () => sdShowScreen("branch"));
      t += 900;
      at(t, () => { $("sdBranchMain")?.classList.add("selected"); sdTap("sdBranchMain"); });
      t += 1300;

      // 3) delivery → location auto-detected, pin is draggable
      at(t, () => {
        setCaption("٣ — أو توصيل؟ موقعه يتحدد له تلقائيًا");
        sdShowScreen("menu");
        sdTap("sdChannelDelivery");
        $("sdChannelDelivery")?.classList.add("active");
        $("sdChannelPickup")?.classList.remove("active");
      });
      at(t + 350, () => sdShowScreen("location"));
      t += 850;
      at(t, () => {
        const pin = $("sdMapPin");
        if (pin) { pin.style.opacity = "1"; pin.style.transform = "translateY(0)"; }
      });
      at(t + 550, () => {
        const sub = $("sdLocationSub");
        if (sub) sub.textContent = "تم تحديد موقعك تلقائيًا";
      });
      t += 1000;
      at(t, () => {
        const pin = $("sdMapPin");
        if (pin) pin.style.transform = "translate(16px, -12px)";
      });
      t += 550;
      at(t, () => {
        const pin = $("sdMapPin");
        if (pin) pin.style.transform = "translate(-10px, 8px)";
        const sub = $("sdLocationSub");
        if (sub) sub.textContent = "قدر تسحب الدبوس لأي مكان تبيه";
      });
      t += 750;
      at(t, () => sdTap("sdLocationConfirmBtn"));
      at(t + 350, () => sdShowScreen("menu"));
      t += 900;

      // 4) add the build-your-own box
      at(t, () => { setCaption("٤ — يضيف بوكس ويخصصه"); sdTap("sdAdd37"); });
      at(t + 350, () => sdShowScreen("box"));
      t += 900;

      const boxPicks = [0, 1, 2];
      boxPicks.forEach((idx, i) => {
        at(t + i * 750, () => {
          const el = $(`sdBoxQty${idx}`);
          if (el) el.textContent = "1";
          sdTap(`sdStepBtn${idx}`);
          const fill = $("sdBoxProgress");
          if (fill) fill.style.width = `${((i + 1) / boxPicks.length) * 100}%`;
        });
      });
      t += boxPicks.length * 750 + 500;
      at(t, () => sdTap("sdBoxAddBtn"));
      at(t + 350, () => { sdShowScreen("menu"); $("sdCartBar")?.classList.add("show"); });
      t += 1200;

      // 5) open cart → checkout
      at(t, () => { setCaption("٥ — يفتح السلة ويدخل بياناته"); sdTap("sdCartBar"); });
      at(t + 350, () => sdShowScreen("checkout"));
      t += 900;

      const nameText = "عبدالله الحربي";
      [...nameText].forEach((ch, i) => {
        at(t + i * 60, () => {
          const el = $("sdNameInput");
          if (el) el.textContent += ch;
        });
      });
      t += nameText.length * 60 + 300;

      const phoneText = "05XXXXXXXX";
      [...phoneText].forEach((ch, i) => {
        at(t + i * 55, () => {
          const el = $("sdPhoneInput");
          if (el) el.textContent += ch;
        });
      });
      t += phoneText.length * 55 + 300;

      const addressText = "بجانب صيدلية النهدي، عمارة بيضاء";
      [...addressText].forEach((ch, i) => {
        at(t + i * 30, () => {
          const el = $("sdAddressInput");
          if (el) el.textContent += ch;
        });
      });
      t += addressText.length * 30 + 400;

      // 6) try the payment methods — all enabled in this demo
      STORE_PAYMENT_METHODS.forEach((m, i) => {
        at(t + i * 450, () => {
          STORE_PAYMENT_METHODS.forEach((mm) => $(`sdPay${mm.id}`)?.classList.remove("selected"));
          $(`sdPay${m.id}`)?.classList.add("selected");
          sdTap(`sdPay${m.id}`);
        });
      });
      t += STORE_PAYMENT_METHODS.length * 450 + 300;
      at(t, () => {
        $(`sdPaycash`)?.classList.add("selected");
        $(`sdPayapplepay`)?.classList.remove("selected");
        $(`sdPaycard`)?.classList.remove("selected");
      });
      t += 500;

      // 7) confirm → order status
      at(t, () => { setCaption("٧ — يأكد الطلب"); sdTap("sdConfirmBtn"); });
      at(t + 450, () => sdShowScreen("status"));
      t += 1200;

      at(t, () => setCaption("٨ — يتابع حالة طلبه لحظة بلحظة"));
      at(t + 700, () => $("sdStep2")?.classList.add("active"));
      t += 2200;

      // Scene 4 — the moment payment succeeds, the order leaves the
      // storefront and connects to the rest of Rakeen — no loading, no
      // manual action, nothing for the owner to do.
      at(t, () => {
        setCaption("٩ — بنفس اللحظة: الطلب يدخل ركين تلقائيًا");
        $("sdFrame")?.classList.add("sent");
        $("sdConnectLine")?.classList.add("show");
      });
      t += 900;
      at(t, () => $("sdConnected")?.classList.add("show"));
      t += 500;

      // Scene 5 — kitchen display
      at(t, () => $("sdConnKitchen")?.classList.add("active"));
      t += 900;
      at(t, () => {
        const s = $("sdKitchenStatus");
        if (s) s.textContent = "جاري التجهيز";
      });
      t += 1300;
      at(t, () => {
        const s = $("sdKitchenStatus");
        if (s) s.textContent = "جاهز ✓";
        $("sdConnKitchen")?.classList.add("done");
      });
      t += 1300;

      // Scene 6 — only the ingredients this order used move
      at(t, () => {
        $("sdConnInventory")?.classList.add("active");
        const el = $("sdInvOnion");
        if (el) {
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / 700);
            el.textContent = (18 - 0.2 * p).toFixed(1);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
      t += 1500;

      // Scene 7 — loyalty, no manual action
      at(t, () => {
        $("sdConnLoyalty")?.classList.add("active");
        const el = $("sdLoyaltyPts");
        if (el) animateCount(el, 0, 25, 700);
      });
      t += 1500;

      // Scene 8 — reports, a few values only
      at(t, () => {
        $("sdConnReports")?.classList.add("active");
        const sales = $("sdRepSales");
        if (sales) animateCount(sales, 18240, 18302, 800);
        const orders = $("sdRepOrders");
        if (orders) animateCount(orders, 248, 249, 500);
        const profit = $("sdRepProfit");
        if (profit) animateCount(profit, 6271, 6289, 800);
      });
      t += 1700;

      // Scene 9 — settle
      at(t, () => {
        setCaption("طلب أونلاين واحد — وكل جزء بمطعمك يتحدّث تلقائيًا");
        $("sdConnectedLine")?.classList.add("show");
      });
      t += 2800;

      // loop
      at(t, () => {
        sdResetVisual();
        storeDemoRunning = false;
        runStoreDemo();
      });
      storeDemoTimers = timers;
    }
    function resetStoreDemo() {
      storeDemoTimers.forEach((tm) => window.clearTimeout(tm));
      storeDemoTimers = [];
      storeDemoRunning = false;
      sdResetVisual();
    }

    const runners: Record<string, () => void> = { invDemoSec: runInvDemo, profitSec: runProfit, posDemoSec: runPosDemo, journeySec: runJourney, loyaltySec: runLoyalty, storeDemoSec: runStoreDemo };
    const resetters: Record<string, () => void> = { invDemoSec: resetInvDemo, profitSec: resetProfit, posDemoSec: resetPosDemo, journeySec: resetJourney, loyaltySec: resetLoyalty, storeDemoSec: resetStoreDemo };

    function revealChildren(el: HTMLElement, on: boolean) {
      el.classList.toggle("in", on);
      el.querySelectorAll<HTMLElement>(".reveal").forEach((c) => c.classList.toggle("in", on));
    }

    // Sections where the nav should always stay visible, idle or not — the
    // inventory demo, net-profit demo, and closing CTA all have their own
    // interactive elements (toggles, the "view plans" reveal) worth keeping
    // the nav's own controls reachable for. Everywhere else, the normal
    // hide-after-5s-idle behavior applies.
    const NAV_PIN_IDS = new Set(["invDemoSec", "profitSec", "close"]);
    const pinnedSectionsInView = new Set<string>();

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          if (NAV_PIN_IDS.has(el.id)) {
            if (entry.isIntersecting) pinnedSectionsInView.add(el.id);
            else pinnedSectionsInView.delete(el.id);
          }
          if (entry.isIntersecting) {
            revealChildren(el, true);
            if (resetters[el.id]) resetters[el.id]();
            if (runners[el.id]) runners[el.id]();
          } else {
            revealChildren(el, false);
            if (resetters[el.id]) resetters[el.id]();
          }
        });
      },
      { threshold: 0.35 }
    );
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => io.observe(el));

    // The hero's own showcase made it taller than one viewport, so the
    // shared observer's 0.35 threshold (tuned for single-screen feature
    // sections) would never trigger it at the top of the page — a
    // dedicated near-zero threshold just tracks "is any part of hero
    // visible", which is what "replay when I scroll back up" needs.
    //
    // Debounced on purpose: mobile Safari's address bar collapses right
    // after page load, changing the viewport height and briefly flipping
    // isIntersecting a couple of times in quick succession. Undebounced,
    // each flip called resetHero()+runHero() again, wiping out whatever had
    // already been scheduled — visually the pillars would rise, then get
    // reset before the collision/reveal timers ever fired, leaving the hero
    // stuck showing two risen-but-uncollided pillars and nothing else.
    // Waiting out a short quiet window before acting filters that out
    // without adding any perceptible delay for a real scroll away and back.
    const heroEl = $("hero");
    // Starts true: the hero is what's on screen at load, before any
    // IntersectionObserver callback has had a chance to fire yet.
    let heroInView = true;
    let heroIoDebounce: number | null = null;
    const heroIo = heroEl
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const isIntersecting = entry.isIntersecting;
              // Read instantly (not debounced) — the nav's own idle-hide
              // timer below needs to know "are we still on the first
              // section" the moment it changes, not 350ms later.
              heroInView = isIntersecting;
              if (heroIoDebounce !== null) window.clearTimeout(heroIoDebounce);
              heroIoDebounce = window.setTimeout(() => {
                // The "back to top" arrow only makes sense once there's
                // somewhere earlier to go back to — hide it while hero (the
                // first section) is on screen, show it as soon as the
                // visitor has scrolled past it in either direction.
                $("navUpBtn")?.classList.toggle("show", !isIntersecting);
                if (isIntersecting) {
                  resetHero();
                  runHero();
                } else {
                  resetHero();
                }
              }, 350);
            });
          },
          { threshold: 0.02 }
        )
      : null;
    if (heroEl && heroIo) heroIo.observe(heroEl);

    // Floating nav hides itself after 5s of no visitor activity (mouse,
    // touch, scroll, or key) and reappears the instant they move again —
    // out of the way while reading, back the moment it might be needed.
    // Not on the hero or the pinned sections above, though — there the nav
    // always stays visible, idle or not.
    let navIdleTimer: number | null = null;
    function armNavIdle() {
      $("navBar")?.classList.remove("idle-hidden");
      if (navIdleTimer !== null) window.clearTimeout(navIdleTimer);
      navIdleTimer = window.setTimeout(() => {
        if (!heroInView && pinnedSectionsInView.size === 0) $("navBar")?.classList.add("idle-hidden");
      }, 5000);
    }
    const activityEvents = ["mousemove", "touchstart", "scroll", "keydown", "wheel"] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, armNavIdle, { passive: true }));
    armNavIdle();

    return () => {
      io.disconnect();
      heroIo?.disconnect();
      if (heroIoDebounce !== null) window.clearTimeout(heroIoDebounce);
      if (navIdleTimer !== null) window.clearTimeout(navIdleTimer);
      activityEvents.forEach((ev) => window.removeEventListener(ev, armNavIdle));
    };
  }, []);

  return (
    <>
      <nav className="nav" id="navBar">
        <div className="nav-pill">
          <button className="nav-cta" onClick={() => document.getElementById("close")?.scrollIntoView({ behavior: "smooth" })}>{lang === "ar" ? "ابدأ مجانًا" : "Start free"}</button>
          <div className="nav-lang-switch" data-active={lang} role="group" aria-label={lang === "ar" ? "اللغة" : "Language"}>
            <span className="nav-lang-thumb" aria-hidden="true" />
            <button className={`nav-lang-opt${lang === "en" ? " active" : ""}`} onClick={() => setLang("en")} aria-pressed={lang === "en"}>
              EN
            </button>
            <button className={`nav-lang-opt${lang === "ar" ? " active" : ""}`} onClick={() => setLang("ar")} aria-pressed={lang === "ar"}>
              AR
            </button>
          </div>
          <span className="nav-brand">
            <img src="/brand/rakeen-wordmark-soft.png" alt="ركين" className="nav-wordmark" />
          </span>
        </div>
      </nav>

      <div className="page-nav-btns">
        <button className="page-nav-btn nav-up" id="navUpBtn" onClick={() => document.getElementById("hero")?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label={lang === "ar" ? "رجوع لأعلى الصفحة" : "Back to top"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
        </button>
        <button className="section-continue-btn" id="sectionContinueBtn" onClick={() => scrollToAdjacentSection(1)} aria-label={lang === "ar" ? "تابع للقسم التالي" : "Continue to next section"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>

      <a
        className="wa-float-btn"
        href="https://wa.me/966557015282"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={lang === "ar" ? "تواصل معنا عبر واتساب" : "Chat with us on WhatsApp"}
      >
        <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <path d="M16.001 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.256.6 4.42 1.73 6.34L3.2 28.8l6.64-1.7a12.74 12.74 0 006.16 1.57h.005c7.06 0 12.8-5.74 12.8-12.8s-5.74-12.67-12.8-12.67zm0 23.36a10.5 10.5 0 01-5.36-1.47l-.385-.23-3.94 1.01 1.05-3.84-.25-.395a10.53 10.53 0 01-1.62-5.63c0-5.82 4.74-10.56 10.57-10.56 2.82 0 5.47 1.1 7.47 3.1a10.49 10.49 0 013.09 7.47c-.01 5.82-4.75 10.56-10.63 10.56zm5.8-7.91c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.71.16-.21.32-.81 1.03-1 1.24-.18.21-.37.24-.68.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.87-1.76-2.19-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.61-.52-.53-.71-.54l-.61-.01c-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.51 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.88-.77 2.14-1.51.26-.74.26-1.38.18-1.51-.08-.13-.29-.21-.61-.37z" />
        </svg>
      </a>

      {/* ============ HERO ============ */}
      <section className="hero" id="hero">
        <div className="pillar-visual" id="pillarVisual">
          <svg className="wall-corner" id="wallCorner" viewBox="0 0 200 190">
            <g id="wallA" className="wall-a">
              <g id="wallAInner" className="wall-a-inner">
                <polygon className="block-side-a" points="80,68 75,60 75,160 80,168" />
                <polygon className="block-top-a" points="80,68 98,68 93,60 75,60" />
                <rect className="block-front-a" x="80" y="68" width="18" height="100" />
                <line className="texture-line-a" x1="80" y1="95" x2="98" y2="95" />
                <line className="texture-line-a" x1="80" y1="130" x2="98" y2="130" />
              </g>
            </g>
            <g id="wallB" className="wall-b">
              <g id="wallBInner" className="wall-b-inner">
                <polygon className="block-side-b" points="114,38 109,30 109,160 114,168" />
                <polygon className="block-top-b" points="114,38 134,38 129,30 109,30" />
                <rect className="block-front-b" x="114" y="38" width="20" height="130" />
                <line className="texture-line-b" x1="114" y1="75" x2="134" y2="75" />
                <line className="texture-line-b" x1="114" y1="110" x2="134" y2="110" />
                <line className="texture-line-b" x1="114" y1="145" x2="134" y2="145" />
              </g>
            </g>
          </svg>
          <div className="wall-word-reveal" id="wallWordReveal">
            <img src={lang === "ar" ? "/brand/rakeen-wordmark-deep.png" : "/brand/rakeen-wordmark-en-deep.png"} alt={lang === "ar" ? "ركين" : "Rakeen"} />
          </div>
        </div>

        <div className="hero-narrative-stack">
        <div className="hero-narrative-phase" id="heroPhaseA">
        <p className="pillar-headline-light" id="pillarHeadlineLight">
          {lang === "ar" ? (
            <>لكل مشروع ناجح، <span className="word-old" id="wordOld">رُكن</span><br />يستند عليه.</>
          ) : (
            <>Every successful business <span className="word-old" id="wordOld">needs</span><br />something to stand on.</>
          )}
        </p>

        <p className="hero-subline" id="heroSubline">
          {lang === "ar" ? <>ليس نظامًا عامًا...<br />بل نظام مصمم لطبيعة عملك.</> : <>Not a generic system...<br />A system built for your business.</>}
        </p>
        </div>

        <div className="dashboard-showcase hero-narrative-phase" id="dashboardShowcase">
          <div className="dash-stage">
            <div className="dash-card dash-restaurant">
              <div className="dash-head"><span className="dash-icon"><JourneyIcon name="chef" /></span><span className="dash-title">{lang === "ar" ? "مطعم" : "Restaurant"}</span></div>
              <div className="dash-grid-2x2">
                <div className="dash-tile"><span className="dash-tile-label">{lang === "ar" ? "الطلبات" : "Orders"}</span><span className="dash-tile-val mono">{lang === "ar" ? "١٢" : "12"}</span></div>
                <div className="dash-tile"><span className="dash-tile-label">{lang === "ar" ? "المطبخ" : "Kitchen"}</span><span className="dash-tile-val mono">{lang === "ar" ? "٤" : "4"}</span></div>
                <div className="dash-tile"><span className="dash-tile-label">{lang === "ar" ? "الطاولات" : "Tables"}</span><span className="dash-tile-val mono">{lang === "ar" ? "٦" : "6"}</span></div>
                <div className="dash-tile"><span className="dash-tile-label">{lang === "ar" ? "الوصفات" : "Recipes"}</span><span className="dash-tile-val mono">{lang === "ar" ? "١٨" : "18"}</span></div>
              </div>
            </div>

            <div className="dash-card dash-clinic">
              <div className="dash-head"><span className="dash-icon"><JourneyIcon name="cross-med" /></span><span className="dash-title">{lang === "ar" ? "عيادة" : "Clinic"}</span></div>
              <div className="dash-queue">
                <div className="dash-queue-row"><span className="dash-queue-num">١</span><span>{lang === "ar" ? "موعد ١٠:٣٠ — سارة أحمد" : "10:30 — Sarah Ahmed"}</span></div>
                <div className="dash-queue-row"><span className="dash-queue-num">٢</span><span>{lang === "ar" ? "بالانتظار — خالد فهد" : "Waiting — Khaled Fahad"}</span></div>
                <div className="dash-queue-row"><span className="dash-queue-num">٣</span><span>{lang === "ar" ? "سجل طبي محدَّث" : "Medical record updated"}</span></div>
              </div>
            </div>

            <div className="dash-card dash-hotel">
              <div className="dash-head"><span className="dash-icon"><JourneyIcon name="bed" /></span><span className="dash-title">{lang === "ar" ? "فندق" : "Hotel"}</span></div>
              <div className="dash-rooms">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span className={"dash-room" + (i % 3 === 0 ? " occupied" : "")} key={i} />
                ))}
              </div>
              <div className="dash-room-legend"><span>{lang === "ar" ? "الحجوزات" : "Bookings"}</span><span>{lang === "ar" ? "التدبير المنزلي" : "Housekeeping"}</span></div>
            </div>

            <div className="dash-card dash-retail">
              <div className="dash-head"><span className="dash-icon"><JourneyIcon name="price-tag" /></span><span className="dash-title">{lang === "ar" ? "تجزئة" : "Retail"}</span></div>
              <div className="dash-barcode"><JourneyIcon name="barcode" /></div>
              <div className="dash-receipt">
                <div className="dash-receipt-row"><span>{lang === "ar" ? "منتج × ٢" : "Item × 2"}</span><span className="mono">48.00</span></div>
                <div className="dash-receipt-row"><span>{lang === "ar" ? "المخزون" : "Stock"}</span><span className="mono">{lang === "ar" ? "١٤٠" : "140"}</span></div>
                <div className="dash-receipt-row total"><span>{lang === "ar" ? "الكاشير" : "Total"}</span><span className="mono">96.00</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-narrative-phase" id="heroPhaseC">
        <h3 className="hero-headline-2" id="heroHeadline2">
          {lang === "ar" ? <>منصة واحدة...<br />تبني نظامًا مختلفًا لكل نشاط.</> : <>One platform...<br />building a different system for every business.</>}
        </h3>
        <p className="hero-rotating-sub" id="heroRotatingSub">
          <span className="hero-rot-word" id="heroRotWord">{lang === "ar" ? HERO_ROTATING_WORDS[0] : HERO_ROTATING_WORDS_EN[0]}</span>
        </p>
        </div>
        </div>
      </section>

      {/* ============ ٠١ الكاشير ============ */}
      <section className="feat feat-full" data-reveal id="posDemoSec">
        <div className="feat-full-inner">
          <div className="reveal">
            <h2 className="feat-title">{lang === "ar" ? "كاشير كامل، يشتغل حتى بدون نت." : "A complete POS that works even offline."}</h2>
            <p className="feat-sub">{lang === "ar" ? "فاتورة ضريبية جاهزة، وطباعة مطبخ منفصلة. تنقطع الشبكة؟ يحفظ طلبك ويزامنه وحده لما ترجع." : "Tax-ready invoices, separate kitchen printing. Connection drops? It saves your order and syncs on its own once you're back."}</p>
          </div>
          <div className="pos-demo reveal d1" id="posDemoRoot">
            <div className="pos-demo-caption" id="posDemoCaption">الأقسام</div>
            <div className="pos-demo-body">
              <div className="screen screen-products active" id="screenProducts">
                <div className="products-zone">
                  <div className="products-toolbar">
                    <div className="search-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      <input type="text" id="demoSearchInput" placeholder="ابحث أو امسح باركود..." readOnly />
                    </div>
                    <button className="fav-toggle" id="demoFavToggle" aria-label="المفضّلة">★</button>
                    <button className="theme-toggle" id="demoThemeToggle" aria-label="الوضع الداكن/الفاتح">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                    </button>
                  </div>
                  <div className="cat-rail">
                    <button className="cat-btn active" id="catAll">الكل</button>
                    <button className="cat-btn" id="catBoxes">البوكسات</button>
                    <button className="cat-btn" id="catSauces">صوصات عنوب</button>
                  </div>
                  <div className="product-grid">
                    {DEMO_ITEMS.map((it, i) => (
                      <div className="product-card" id={`demoProd${i}`} key={it.id}>
                        <div className="product-icon"><img src={it.image} alt={it.name} loading="lazy" /></div>
                        {i === 0 && <span className="fav-star" id="demoFavStar">★</span>}
                        <div className="product-name">{it.name}</div>
                        <div className="product-cat">{it.cat}</div>
                        <span className="product-price mono">{it.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="order-panel">
                  <div className="op-head">الطلب الحالي</div>
                  <div className="order-items" id="demoOrderItems">
                    <div className="order-empty" id="demoOrderEmpty">اضغط على منتج لإضافته</div>
                  </div>
                  <div className="order-summary">
                    <div className="sum-row"><span>المجموع الفرعي</span><span className="mono" id="demoSubtotal">0.00</span></div>
                    <div className="sum-row"><span>ضريبة القيمة المضافة</span><span className="mono" id="demoVat">0.00</span></div>
                    <div className="sum-row total"><span>الإجمالي</span><span className="mono" id="demoTotal">0.00</span></div>
                  </div>
                  <div className="order-actions">
                    <button className="pay-btn" id="demoPayBtn">ادفع</button>
                  </div>
                </div>
              </div>

              <div className="screen screen-tables" id="screenTables">
                <div className="tables-grid">
                  {DEMO_TABLES.map((t) => (
                    <div className={`table-card ${t.status}`} id={`demoTable${t.num}`} key={t.num}>
                      <span className="table-num mono">{t.num}</span>
                      <span className="table-status">{TABLE_STATUS_LABEL[t.status]}</span>
                      {"bill" in t && <span className="table-bill mono">{t.bill}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="screen screen-checkout" id="screenCheckout">
                <div className="method-row">
                  <button className="method-btn active" id="methodCash">💵 كاش</button>
                  <button className="method-btn" id="methodCard">💳 بطاقة</button>
                  <button className="method-btn" id="methodSplit">➗ تقسيم</button>
                </div>
                <div className="split-panel" id="splitPanel">
                  <div className="split-mode-row">
                    <button className="split-mode-btn active" id="splitModePeople">على أشخاص</button>
                    <button className="split-mode-btn" id="splitModeMethod">طريقة الدفع</button>
                  </div>
                  <div className="split-people-view show" id="splitPeopleView">
                    <div className="split-label">تقسيم الفاتورة على</div>
                    <div className="split-people-row">
                      <button className="prep-btn">−</button>
                      <span className="split-count mono" id="splitCount">2</span>
                      <button className="prep-btn">+</button>
                      <span className="split-label">أشخاص</span>
                    </div>
                    <div className="split-each">
                      <span>لكل شخص</span>
                      <span className="mono" id="splitEach">74.10</span>
                    </div>
                  </div>
                  <div className="split-method-view" id="splitMethodView">
                    <div className="split-method-row">
                      <div className="split-method-item" id="splitNetworkRow"><span>شبكة</span><span className="mono" id="splitNetwork">0.00</span></div>
                      <div className="split-method-item" id="splitCashRow"><span>كاش</span><span className="mono" id="splitCash">0.00</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="screen screen-loyalty" id="screenLoyalty">
                <div className="loyalty-card-demo">
                  <div className="loyalty-avatar">ع</div>
                  <div className="loyalty-info">
                    <div className="loyalty-name">عبدالله — عميل</div>
                    <div className="loyalty-phone mono">05●●●●●67</div>
                  </div>
                  <div className="loyalty-points-badge" id="loyaltyPoints">١٢ نقطة</div>
                </div>
                <div className="loyalty-gain" id="loyaltyGain">+1 نقطة على هذا الطلب</div>
              </div>

              <div className="screen screen-delivery" id="screenDelivery">
                <div className="channel-row">
                  <button className="channel-btn active" id="channelPickup">استلام من الفرع</button>
                  <button className="channel-btn" id="channelDelivery">توصيل</button>
                </div>
                <div className="platform-btn-row">
                  {DEMO_PLATFORMS.map((p, i) => (
                    <div className="platform-btn" id={`platform${i}`} key={p.name} style={{ ["--platform-color" as string]: p.color }}>
                      <span className="platform-btn-initial" style={{ background: p.color }}>{p.initial}</span>
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="screen screen-incoming" id="screenIncoming">
                <div className="incoming-order-card" id="incomingCard">
                  <span className="incoming-bell" id="incomingBell">🔔</span>
                  <div className="incoming-title">طلب أونلاين جديد</div>
                  <div className="incoming-sub">متجر عنوب الإلكتروني · طلب #482</div>
                  <div className="incoming-items">بوكس وسط مشكّل × 1 — بوكس كبير مشكّل × 1</div>
                  <div className="incoming-paid" id="incomingPaid">✓ تم الدفع — Apple Pay</div>
                  <div className="prep-row">
                    <button className="prep-btn">−</button>
                    <span className="prep-val mono" id="prepVal">10 دقائق</span>
                    <button className="prep-btn">+</button>
                  </div>
                  <div className="incoming-actions">
                    <button className="reject-btn" id="rejectBtn">رفض</button>
                    <button className="accept-btn" id="acceptBtn">قبول</button>
                  </div>
                </div>
              </div>

              <div className="screen screen-prep" id="screenPrep">
                <div className="delivery-ring-wrap" id="deliveryRingWrap">
                  <svg className="delivery-ring" viewBox="0 0 60 60">
                    <circle className="ring-track" cx="30" cy="30" r="26" />
                    <circle className="ring-fill" id="ringFill" cx="30" cy="30" r="26" />
                  </svg>
                  <span className="delivery-ring-time mono" id="ringTime">12:00</span>
                </div>
                <div className="delivery-ring-label">الوقت المتبقي لتجهيز الطلب</div>
                <button className="ready-btn" id="readyBtn">جاهز</button>
              </div>

              <div className="screen screen-refund" id="screenRefund">
                <div className="refund-card">
                  <div className="refund-head"><span>طلب #479</span><span className="mono">148.00</span></div>
                  <div className="refund-items">بوكس وسط مشكّل × 1 — بوكس كبير مشكّل × 1</div>
                  <button className="refund-btn" id="refundBtn">استرجاع الطلب</button>
                  <div className="refund-done" id="refundDone">✓ تم الاسترجاع وتحديث المخزون</div>
                </div>
              </div>

              <div className="screen screen-shift" id="screenShift">
                <div className="shift-card">
                  <div className="shift-title">إغلاق الوردية والموازنة</div>
                  <div className="shift-row"><span>إجمالي المبيعات</span><span className="mono">2,140.00</span></div>
                  <div className="shift-row"><span>نقدي</span><span className="mono">860.00</span></div>
                  <div className="shift-row"><span>شبكة</span><span className="mono">1,280.00</span></div>
                  <div className="shift-row"><span>عدد الطلبات</span><span className="mono">34</span></div>
                  <div className="shift-row total"><span>الصافي</span><span className="mono">2,140.00</span></div>
                  <button className="shift-btn" id="shiftBtn">طباعة تقرير الإغلاق</button>
                </div>
              </div>

              <div className="screen screen-outro" id="screenOutro">
                <span className="outro-percent mono">60%</span>
                <div className="outro-title">من مميزات الكاشير</div>
                <div className="outro-sub">كمّل تحت لباقي أنظمة ركين</div>
                <svg className="outro-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="pos-demo-connect">
              <span className="connect-node">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                <i>الكاشير</i>
              </span>
              <span className="connect-line"><span className="connect-dot"></span></span>
              <span className="connect-node-group">
                <span className="connect-node">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c-1.8 3.2-5 5-5 9.5a5 5 0 0010 0c0-1.7-.8-2.6-1.7-3.4 0 1.7-.8 2.6-1.7 2.6s-.9-1.7 0-3.4c.9-1.7 0-3.4-1.6-4.7z" /></svg>
                  <i>المطبخ</i>
                </span>
                <span className="connect-node">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="7" /><line x1="18" y1="20" x2="18" y2="14" /><line x1="3" y1="20" x2="21" y2="20" /></svg>
                  <i>لوحة التحكم</i>
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ ٠٢ المخزون والمشتريات ============ */}
      <section className="feat feat-full" data-reveal id="invDemoSec">
        <div className="feat-full-inner">
          <div className="reveal">
            <h2 className="feat-title">{lang === "ar" ? "اعرف وش يصير بمخزونك — قبل ما يصير مشكلة." : "Know what's happening in your stock — before it's a problem."}</h2>
            <p className="feat-sub">{lang === "ar" ? "المخزون يتحدّث تلقائيًا مع كل عملية بيع، وتنبيه قبل ما يخلص أي صنف. صوّر فاتورة المورد وتتحدّث الكمية فورًا — ولو صار فرق بين المسجّل والواقع، ركين ينبّهك." : "Stock updates automatically with every sale, with an alert before anything runs out. Snap the supplier invoice and quantities update instantly — and if the recorded and real amounts ever drift apart, Rakeen flags it."}</p>
          </div>
          <div className="inv-demo reveal d1" id="invDemoRoot">
            <div className="inv-demo-caption" id="invDemoCaption">مخزونك الآن — كل شي تحت السيطرة</div>
            <div className="inv-demo-body">
              <div className="inv-toast-stack" id="invToastStack"></div>

              <div className="stock-spotlight">
                {INV_TILES.map((t) => (
                  <div className="stock-tile" id={`inv${t.key}Tile`} key={t.key}>
                    <div className="stock-ring-wrap" id={`inv${t.key}Ring`}>
                      <svg viewBox="0 0 84 84">
                        <circle className="ring-track" cx="42" cy="42" r="34" />
                        <circle className="ring-fill" id={`inv${t.key}Fill`} cx="42" cy="42" r="34" />
                      </svg>
                      <span className="stock-ring-icon"><JourneyIcon name={t.icon} /></span>
                    </div>
                    <div className="stock-tile-name">{t.name}</div>
                    <div className="stock-tile-meta" id={`inv${t.key}Meta`}>{t.startQty} من {t.par} {t.unit} متبقي</div>
                    <div className="stock-tile-pct mono" id={`inv${t.key}Pct`}>{Math.round((t.startQty / t.par) * 100)}٪</div>
                  </div>
                ))}
              </div>

              <div className="inv-event-slot" id="invEventSlot"></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ ٠٣ كيف يشتغل ركين — محاكاة حيّة ============ */}
      <section className="feat" data-reveal id="journeySec">
        <div className="feat-inner" style={{ gridTemplateColumns: "1fr", maxWidth: "760px" }}>
          <div className="reveal" style={{ textAlign: "center" }}>
            <h2 className="feat-title">{lang === "ar" ? "كل عملية بيع تحرّك مطعمك بالكامل — تلقائيًا." : "Every sale moves your whole restaurant — automatically."}</h2>
            <p className="feat-sub" style={{ margin: "12px auto 0" }}>{lang === "ar" ? "ما تحتاج تسوي شي. شاهد وش يصير لحظة ما يدخل طلب." : "You don't have to do a thing. Watch what happens the moment an order comes in."}</p>
          </div>

          <div className="reveal d1">
            <div className="jr-sim" id="jrSim">
              <div className="jr-sim-head">
                <span className="jr-sim-title">لوحة ركين — الرئيسية</span>
                <span className="jr-sim-live"><span className="jr-sim-live-dot"></span>مباشر</span>
              </div>

              <div className="jr-sim-body">
                <div className="jr-sim-order" id="jrOrderCard">
                  <div className="jr-sim-order-head">
                    <span className="jr-sim-order-num">طلب جديد #١٠٤٢</span>
                    <span className="jr-sim-status" id="jrOrderStatus">قيد الانتظار</span>
                  </div>
                  <div className="jr-sim-order-items">بوكس مشكّل × ١ · مشروب × ١</div>
                  <div className="jr-sim-order-total">الإجمالي <span className="mono">62.00</span></div>
                </div>

                <div className="jr-sim-kitchen" id="jrKitchenRow">
                  <span className="jr-sim-kitchen-icon"><JourneyIcon name="chef" /></span>
                  <span className="jr-sim-kitchen-label">المطبخ</span>
                  <span className="jr-sim-status" id="jrKitchenStatus">بانتظار الطلب</span>
                </div>

                <div className="jr-sim-stats">
                  <div className="jr-sim-stat" id="jrSimInvCell">
                    <span className="jr-sim-stat-label">المخزون</span>
                    <span className="jr-sim-stat-value mono"><span id="jrInvVal">22</span></span>
                  </div>
                  <div className="jr-sim-stat" id="jrSimCostCell">
                    <span className="jr-sim-stat-label">تكلفة الطبق</span>
                    <span className="jr-sim-stat-value mono"><span id="jrCostVal">1,490</span></span>
                  </div>
                  <div className="jr-sim-stat jr-sim-stat-hero" id="jrSimProfitCell">
                    <span className="jr-sim-stat-label">صافي الربح</span>
                    <span className="jr-sim-stat-value mono"><span id="jrProfitVal">5,589</span></span>
                  </div>
                </div>

                <div className="jr-sim-reports" id="jrReportsRow">
                  <span className="jr-sim-reports-icon" id="jrReportsIcon"><JourneyIcon name="bars" /></span>
                  <span className="jr-sim-reports-label">التقارير</span>
                  <span className="jr-sim-status" id="jrReportsStatus">بانتظار التحديث</span>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal d2">
            <div className="jr-integrations">
              <span className="jr-integrations-label">متصل أيضًا مع</span>
              <div className="jr-chip-row">
                {JOURNEY_INTEGRATIONS.map((item, i) => (
                  <span className="jr-chip" key={i}>
                    <span className="jr-chip-icon"><JourneyIcon name={item.icon} /></span>
                    {lang === "ar" ? item.label : item.labelEn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ ٠٤ الأرباح ============ */}
      <section className="feat" data-reveal id="profitSec">
        <div className="feat-inner">
          <div className="reveal" style={{ textAlign: "center" }}>
            <h2 className="feat-title">{lang === "ar" ? "صافي ربحك، محسوب — مو مقدّر." : "Your net profit, calculated — not guessed."}</h2>
            <p className="feat-sub" style={{ marginInline: "auto" }}>{lang === "ar" ? "كل رقم له مصدر: تكلفة الطعام من وصفاتك الفعلية، والضريبة والمصاريف مطروحة تلقائيًا." : "Every number has a source: food cost from your real recipes, tax and expenses deducted automatically."}</p>
          </div>
          <div className="feat-visual reveal d1">
            <div className="wf-panel">
              {WF.map((row) => (
                <div className="wf-row" key={row.id}>
                  <div className="wf-label">{lang === "ar" ? row.label : row.labelEn}</div>
                  <div className="wf-track"><div id={"wf" + row.id + "Fill"} className={"wf-fill " + row.cls}></div></div>
                  <div id={"wf" + row.id + "Val"} className="wf-val">0</div>
                </div>
              ))}
              <div className="wf-row total">
                <div className="wf-label" style={{ fontWeight: 800, color: "var(--ink)" }}>{lang === "ar" ? "صافي الربح" : "Net profit"}</div>
                <div className="wf-track"><div id="wfNetFill" className="wf-fill net"></div></div>
                <div id="wfNetVal" className="wf-val">0</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ ٠٥ بطاقات الولاء ============ */}
      <section className="feat feat-full" data-reveal id="loyaltySec">
        <div className="feat-full-inner">
          <div className="reveal">
            <h2 className="feat-title">{lang === "ar" ? "كل زيارة تخلي عميلك يرجع ثاني." : "Every visit brings your customer back."}</h2>
            <p className="feat-sub">{lang === "ar" ? "يكسب نقاط تلقائيًا، وبطاقته تُحفظ بجواله بدون تطبيق. يستبدل مكافآته بثوانٍ — ولو غاب، ركين يذكّره وحده." : "They earn points automatically, and their card lives on their phone — no app needed. Rewards redeem in seconds — and if they've drifted away, Rakeen brings them back on its own."}</p>
          </div>

          <div className="loy-sim reveal d1">
            <div className="loy-intro-row" id="loyIntroRow">
              {LOYALTY_CARDS.map((c, i) => (
                <div className={"mini-card mini-band-" + c.bandStyle + " loy-intro-card"} id={`loyIntroCard${i}`} key={c.id}>
                  <div className="mini-card-head" style={{ background: c.accent, color: c.onAccent }}>
                    <div className="mini-card-top">
                      <div className="mini-tier-chip" style={{ background: `${c.onAccent}22` }}>{c.tier}</div>
                      <div style={{ flex: 1 }} />
                      <img src={c.logoUrl || undefined} alt="" className="mini-card-logo" />
                    </div>
                    <div className="mini-card-name">{c.name}</div>
                  </div>
                  <div className="mini-card-mid" style={c.bannerUrl ? { backgroundImage: `linear-gradient(rgba(250,249,245,.55),rgba(250,249,245,.55)), url(${c.bannerUrl})` } : undefined}>
                    {c.system === "points" ? (
                      <div style={{ textAlign: "center" }}>
                        <div className="mini-points-label">النقاط</div>
                        <div className="mini-points-val" style={{ color: c.accent }}>{c.points!.toLocaleString("ar-SA")}</div>
                      </div>
                    ) : (
                      <div className="mini-stamp-row">
                        {Array.from({ length: c.visitsThreshold! }).map((_, si) => (
                          <span className={"mini-stamp" + (si < c.visitsFilled! ? " filled" : "")} key={si} style={{ color: c.accent }}>{c.stampIcon}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="loy-hero-wrap" id="loyHeroWrap">
              <div className={"mini-card mini-band-" + LOYALTY_HERO.bandStyle + " loy-hero-card"} id="loyHeroCard">
                <div className="mini-card-head" style={{ background: LOYALTY_HERO.accent, color: LOYALTY_HERO.onAccent }}>
                  <div className="mini-card-top">
                    <div className="mini-tier-chip" id="loyTierChip" style={{ background: `${LOYALTY_HERO.onAccent}22` }}>{LOYALTY_HERO.tier}</div>
                    <div style={{ flex: 1 }} />
                    <img src={LOYALTY_HERO.logoUrl || undefined} alt="" className="mini-card-logo" />
                    <div className="mini-card-name">{LOYALTY_HERO.name}</div>
                  </div>
                  <div className="mini-card-customer">{LOYALTY_HERO.customer}</div>
                  <div className="mini-card-tenure" style={{ color: `${LOYALTY_HERO.onAccent}b3` }}>{LOYALTY_HERO.tenure}</div>
                </div>
                <div className="mini-card-mid" style={LOYALTY_HERO.bannerUrl ? { backgroundImage: `linear-gradient(rgba(250,249,245,.55),rgba(250,249,245,.55)), url(${LOYALTY_HERO.bannerUrl})` } : undefined}>
                  <div style={{ textAlign: "center" }}>
                    <div className="mini-points-label">رصيد النقاط</div>
                    <div className="mini-points-val" id="loyPointsVal" style={{ color: LOYALTY_HERO.accent }}>{LOYALTY_STORY_VALUES.earnStart.toLocaleString("ar-SA")}</div>
                  </div>
                </div>
                <div className="mini-card-foot" style={{ background: LOYALTY_HERO.accent, color: LOYALTY_HERO.onAccent }}>
                  <div className="mini-saved-badge" style={{ background: `${LOYALTY_HERO.onAccent}1f` }}>
                    <span className="mini-saved-badge-icon"><JourneyIcon name="coin" /></span>
                    <span>وفرت {LOYALTY_HERO.saved} ريال</span>
                  </div>
                  <div className="mini-qr">
                    <MiniQR />
                  </div>
                  <div className="mini-powered" style={{ color: `${LOYALTY_HERO.onAccent}59` }}>مدعوم من ركين</div>
                </div>
              </div>
            </div>

            <div className="loy-event-slot" id="loyEventSlot"></div>
          </div>

          <div className="loyalty-features reveal d2">
            {LOYALTY_FEATURES.map((f, i) => (
              <div className="loyalty-feature" id={`loyFeat-${f.id}`} key={i}>
                <span className="loyalty-feature-icon"><JourneyIcon name={f.icon} /></span>
                <span>{lang === "ar" ? f.text : f.textEn}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ٠٦ متجرك الخاص ============ */}
      <section className="feat feat-full" data-reveal id="storeDemoSec">
        <div className="feat-full-inner">
          <div className="reveal">
            <h2 className="feat-title">{lang === "ar" ? "متجرك الخاص، وعميل يرجع لك." : "Your own store, and a customer who comes back."}</h2>
            <p className="feat-sub">{lang === "ar" ? "طلب مباشر بهويتك، بدون عمولة تطبيقات — من فتح الموقع لين تتبّع الطلب لحظة بلحظة. هذا متجر عنوب الحقيقي، حي." : "Direct orders under your own brand, no app commissions — from the site opening to live order tracking. This is Anoob's actual store, live."}</p>
          </div>
          <div className="reveal d1" style={{ textAlign: "center" }}>
            <div className="sd-caption" id="storeDemoCaption">١ — عميلك يفتح متجرك</div>
            <div className="sd-frame" id="sdFrame" style={{ ["--sd-brand" as string]: STORE.brand, ["--sd-ink" as string]: STORE.brandInk }}>
              {/* menu / landing */}
              <div className="sd-screen active" id="sdScreenMenu">
                <div className="sd-header">
                  <img src={STORE.logoUrl} className="sd-logo" alt="" />
                  <div className="sd-brandname">{STORE.name}</div>
                </div>
                <div className="sd-hero" style={{ backgroundImage: `linear-gradient(rgba(22,40,27,.15),rgba(22,40,27,.55)), url(${STORE.bannerUrl})` }}>
                  <div className="sd-hero-card">
                    <img src={STORE.logoUrl} className="sd-hero-logo" alt="" />
                    <div>
                      <div className="sd-hero-name">{STORE.name}</div>
                      <div className="sd-hero-chip">طلب مباشر بدون عمولة تطبيقات</div>
                    </div>
                  </div>
                </div>
                <div className="sd-channel-row">
                  <div className="sd-channel-btn active" id="sdChannelDelivery">توصيل</div>
                  <div className="sd-channel-btn" id="sdChannelPickup">استلام</div>
                </div>
                <div className="sd-cat-rail">
                  {STORE_CATEGORIES.map((c, i) => (
                    <div className={"sd-cat-chip" + (i === 0 ? " active" : "")} key={c} id={i === 0 ? "sdCatBoxes" : undefined}>{c}</div>
                  ))}
                </div>
                <div className="sd-product-list">
                  {STORE_PRODUCTS.map((p) => (
                    <div className="sd-product-card" key={p.id}>
                      <img src={p.img} className="sd-product-photo" alt="" />
                      <div className="sd-product-info">
                        <div className="sd-product-name">{p.name}</div>
                        {p.box && <div className="sd-product-badge">جهّز بوكسك</div>}
                        <div className="sd-product-price mono">{p.price.toFixed(2)}</div>
                      </div>
                      <button className="sd-product-add" id={`sdAdd${p.id}`}>+</button>
                    </div>
                  ))}
                </div>
                <div className="sd-cart-bar" id="sdCartBar">
                  <span>١ صنف</span>
                  <span>عرض السلة</span>
                  <span className="mono">49.00</span>
                </div>
              </div>

              {/* pickup: branch picker — real store only has one branch today,
                  but the picker itself is a real feature for multi-branch owners */}
              <div className="sd-screen" id="sdScreenBranch">
                <div className="sd-sheet-head">
                  <div className="sd-sheet-title">اختر فرعك</div>
                  <div className="sd-sheet-sub">وين تحب تستلم طلبك؟</div>
                </div>
                <div className="sd-branch-list">
                  <div className="sd-branch-row" id="sdBranchMain">
                    <div>
                      <div className="sd-branch-name">الفرع الرئيسي</div>
                      <div className="sd-branch-sub">جاهز خلال ٢٠ دقيقة</div>
                    </div>
                    <div className="sd-branch-check">✓</div>
                  </div>
                </div>
              </div>

              {/* delivery: auto-detected location + draggable pin */}
              <div className="sd-screen" id="sdScreenLocation">
                <div className="sd-sheet-head">
                  <div className="sd-sheet-title">وصّل لي هنا</div>
                  <div className="sd-sheet-sub" id="sdLocationSub">نحدد موقعك تلقائيًا...</div>
                </div>
                <div className="sd-map">
                  <div className="sd-map-grid" />
                  <div className="sd-map-pin" id="sdMapPin">📍</div>
                </div>
                <div className="sd-map-hint">اسحب الدبوس لأي مكان تبيه</div>
                <button className="sd-confirm-btn" id="sdLocationConfirmBtn">تأكيد الموقع</button>
              </div>

              {/* box builder */}
              <div className="sd-screen" id="sdScreenBox">
                <div className="sd-sheet-head">
                  <div className="sd-sheet-title">بوكس وسط مشكّل</div>
                  <div className="sd-sheet-sub">اختر ٣ قطع</div>
                  <div className="sd-box-progress"><div className="sd-box-progress-fill" id="sdBoxProgress" /></div>
                </div>
                <div className="sd-box-list">
                  {STORE_BOX_ITEMS.map((b, i) => (
                    <div className="sd-box-row" key={b}>
                      <span>{b}</span>
                      <div className="sd-stepper">
                        <button className="sd-step-btn" id={`sdStepBtn${i}`}>+</button>
                        <span className="mono" id={`sdBoxQty${i}`}>0</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="sd-confirm-btn" id="sdBoxAddBtn">أضف للسلة — 49.00</button>
              </div>

              {/* checkout */}
              <div className="sd-screen" id="sdScreenCheckout">
                <div className="sd-sheet-head"><div className="sd-sheet-title">إتمام الطلب</div></div>
                <div className="sd-field">
                  <label>الاسم</label>
                  <div className="sd-input" id="sdNameInput" />
                </div>
                <div className="sd-field">
                  <label>رقم الجوال</label>
                  <div className="sd-input mono" id="sdPhoneInput" />
                </div>
                <div className="sd-field">
                  <label>وجّه المندوب لموقعك</label>
                  <div className="sd-input sd-address" id="sdAddressInput" />
                </div>
                <div className="sd-field">
                  <label>طريقة الدفع</label>
                  <div className="sd-payment-row">
                    {STORE_PAYMENT_METHODS.map((m, i) => (
                      <div className={"sd-payment-chip" + (i === 0 ? " selected" : "")} key={m.id} id={`sdPay${m.id}`}>{m.label}</div>
                    ))}
                  </div>
                </div>
                <button className="sd-confirm-btn" id="sdConfirmBtn">تأكيد الطلب — 49.00 ر.س</button>
              </div>

              {/* order status */}
              <div className="sd-screen" id="sdScreenStatus">
                <div className="sd-header">
                  <img src={STORE.logoUrl} className="sd-logo" alt="" />
                  <div className="sd-brandname">{STORE.name}</div>
                </div>
                <div className="sd-status-card">
                  <div className="sd-stepper-row">
                    <div className="sd-step done" id="sdStep1"><span className="sd-step-icon">📥</span><span>استلمنا طلبك</span></div>
                    <div className="sd-step-line" />
                    <div className="sd-step" id="sdStep2"><span className="sd-step-icon">👨‍🍳</span><span>جاري التجهيز</span></div>
                    <div className="sd-step-line" />
                    <div className="sd-step" id="sdStep3"><span className="sd-step-icon">🚴</span><span>خرج للتوصيل</span></div>
                  </div>
                  <div className="sd-status-meta">
                    <span>طلب <span className="mono">#1842</span></span>
                    <span className="mono">49.00 ر.س</span>
                  </div>
                </div>
                <div className="sd-wa-btn">تواصل عبر واتساب</div>
                <div className="sd-powered">مدعوم من ركين</div>
              </div>
            </div>

            {/* Scene 4+ — the moment payment succeeds, the order leaves the
                storefront and connects to the rest of Rakeen: the same
                kitchen/inventory/loyalty/reports mechanics already real
                elsewhere on this page, told here from the online-order
                side of the story. */}
            <div className="sd-connect-line" id="sdConnectLine"><span className="sd-connect-dot" /></div>

            <div className="sd-connected" id="sdConnected">
              <div className="sd-connected-row" id="sdConnKitchen">
                <span className="sd-connected-icon"><JourneyIcon name="chef" /></span>
                <div className="sd-connected-body">
                  <span className="sd-connected-label">المطبخ</span>
                  <span className="sd-connected-status" id="sdKitchenStatus">استلم الطلب #١٠٤٣</span>
                </div>
              </div>
              <div className="sd-connected-row" id="sdConnInventory">
                <span className="sd-connected-icon"><JourneyIcon name="box-down" /></span>
                <div className="sd-connected-body">
                  <span className="sd-connected-label">المخزون</span>
                  <span className="sd-connected-status">البصل <span className="mono" id="sdInvOnion">18.0</span> كجم</span>
                </div>
              </div>
              <div className="sd-connected-row" id="sdConnLoyalty">
                <span className="sd-connected-icon"><JourneyIcon name="sparkle" /></span>
                <div className="sd-connected-body">
                  <span className="sd-connected-label">الولاء</span>
                  <span className="sd-connected-status">+<span className="mono" id="sdLoyaltyPts">0</span> نقطة للعميل</span>
                </div>
              </div>
              <div className="sd-connected-row" id="sdConnReports">
                <span className="sd-connected-icon"><JourneyIcon name="bars" /></span>
                <div className="sd-connected-stats">
                  <span className="sd-connected-stat"><span className="sd-connected-stat-label">المبيعات</span><span className="mono" id="sdRepSales">18,240</span></span>
                  <span className="sd-connected-stat"><span className="sd-connected-stat-label">الطلبات</span><span className="mono" id="sdRepOrders">248</span></span>
                  <span className="sd-connected-stat"><span className="sd-connected-stat-label">الربح</span><span className="mono" id="sdRepProfit">6,271</span></span>
                </div>
              </div>
            </div>

            <p className="sd-connected-line" id="sdConnectedLine">
              طلب أونلاين واحد... وكل جزء بمطعمك يتحدّث تلقائيًا.
            </p>
          </div>
        </div>
      </section>

      {/* ============ CLOSE ============ */}
      <section className="close" data-reveal id="close">
        <h2 className="close-title reveal">{lang === "ar" ? "جاهز تبدأ؟" : "Ready to start?"}</h2>
        <p className="close-desc reveal d1">
          {lang === "ar" ? (
            <>جرّب جميع مزايا ركين مجانًا حتى أول ٣٥٠ طلب أونلاين.<br />بدون بطاقة بنكية.<br />بدون التزام.<br />ابدأ خلال دقيقة.</>
          ) : (
            <>Try every Rakeen feature free for your first 350 online orders.<br />No card required.<br />No commitment.<br />Start in a minute.</>
          )}
        </p>
        <a className="close-cta reveal d1" href="/signup">{lang === "ar" ? "ابدأ مجانًا" : "Start free"}</a>
        <button className="close-plans-link reveal d1" id="closePlansToggle" onClick={() => document.getElementById("closePlansDetail")?.classList.toggle("show")}>{lang === "ar" ? "عرض الباقات" : "View plans"}</button>
        <div className="close-plans-detail" id="closePlansDetail">
          <span className="close-plans-price"><b>149</b> {lang === "ar" ? "ر.س شهريًا — لفرعين" : "SAR/month — for 2 branches"}</span>
          <span className="close-plans-note">{lang === "ar" ? "الأسعار تقديرية للتوضيح، وتُحدد نهائيًا حسب حجم مشروعك." : "Prices shown are illustrative — final pricing depends on the size of your business."}</span>
        </div>
        <div className="close-trust-row reveal d2">
          <span className="close-trust-item"><JourneyIcon name="check" />{lang === "ar" ? "جميع المزايا متاحة" : "All features included"}</span>
          <span className="close-trust-item"><JourneyIcon name="check" />{lang === "ar" ? "٣٥٠ طلب أونلاين مجانًا" : "350 free online orders"}</span>
          <span className="close-trust-item"><JourneyIcon name="check" />{lang === "ar" ? "إعداد خلال دقائق" : "Set up in minutes"}</span>
          <span className="close-trust-item"><JourneyIcon name="check" />{lang === "ar" ? "يمكنك الترقية لاحقًا" : "Upgrade anytime later"}</span>
        </div>
      </section>

      <footer className="site-footer" data-reveal id="siteFooter">
        <div className="footer-card">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="footer-logo-wrap">
                <img src="/brand/rakeen-wordmark.png" alt="ركين" className="footer-logo" />
              </div>
              <p className="footer-tagline">{lang === "ar" ? "أنظمة تشغيل مصممة لكل نشاط." : "Operating systems built for every business."}</p>
            </div>
            <nav className="footer-nav">
              <button onClick={() => document.getElementById("posDemoSec")?.scrollIntoView({ behavior: "smooth" })}>{lang === "ar" ? "المزايا" : "Features"}</button>
              <button
                onClick={() => {
                  document.getElementById("close")?.scrollIntoView({ behavior: "smooth" });
                  document.getElementById("closePlansDetail")?.classList.add("show");
                }}
              >
                {lang === "ar" ? "الأسعار" : "Pricing"}
              </button>
              <a href="/signup">{lang === "ar" ? "سجّل مطعمك" : "Sign up"}</a>
              <a href="https://wa.me/966557015282" target="_blank" rel="noopener noreferrer">{lang === "ar" ? "تواصل معنا" : "Contact us"}</a>
              <a href="/privacy">{lang === "ar" ? "الخصوصية" : "Privacy"}</a>
              <a href="/terms">{lang === "ar" ? "الشروط" : "Terms"}</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>{lang === "ar" ? "© ٢٠٢٦ ركين. جميع الحقوق محفوظة." : "© 2026 Rakeen. All rights reserved."}</span>
            <a className="footer-email" href="mailto:support@rakeenapp.com">support@rakeenapp.com</a>
          </div>
        </div>
      </footer>
    </>
  );
}
