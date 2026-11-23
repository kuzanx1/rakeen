"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import WhatsAppAdminPanel from "./WhatsAppAdminPanel";
import UsagePanel from "./UsagePanel";
import PrintHealthPanel from "./PrintHealthPanel";
import BroadcastPanel from "./BroadcastPanel";
import AuditLogPanel from "./AuditLogPanel";
import ContractsPanel from "./ContractsPanel";
import QuotePanel from "./QuotePanel";
import OfferPanel from "./OfferPanel";
import AddBusinessPanel from "./AddBusinessPanel";
import LandingClientsPanel from "./LandingClientsPanel";
import OverviewPanel from "./OverviewPanel";
import { allowedFeatures, FeatureOverrides, PLANS, planByKey, SELLABLE_FEATURES } from "@/lib/plans";
import type { FeatureKey } from "@/lib/contracts";

type Business = {
  id: number;
  name: string;
  plan: string;
  online_ordering_enabled: boolean;
  online_menu_slug: string | null;
  online_order_free_count: number;
  online_order_free_limit: number;
  online_subscribed: boolean;
  is_active: boolean;
  admin_notes: string | null;
  subscription_expires_at: string | null;
  branch_limit: number;
  included_seats: number;
  kitchen_display_enabled: boolean;
  inventory_enabled: boolean;
  loyalty_enabled: boolean;
  verification_status: "pending" | "verified" | "rejected";
  business_type: "restaurant" | "quick_service" | "cafe" | "cloud_kitchen" | "salon" | "ladies_salon" | "car_wash" | "mobile_car_wash" | "clinic" | "tailoring" | "hotel" | "retail" | "other";
  created_at: string;
  owner_name: string | null;
  owner_id: string | null;
  // All non-cancelled orders, every channel (null = counts unavailable).
  total_orders: number | null;
  online_orders: number | null;
};

type BusinessStats = {
  orders_count: number;
  last_order_at: string | null;
  branch_count: number;
  staff_count: number;
  owner_id: string | null;
  owner_email: string | null;
  logo_url: string | null;
  online_theme_color: string | null;
  online_banner_url: string | null;
  loyalty_logo_url: string | null;
  loyalty_banner_url: string | null;
  loyalty_accent_color: string | null;
  loyalty_pattern_style: string | null;
  loyalty_theme: string | null;
  loyalty_icon_style: string | null;
  loyalty_custom_icon_url: string | null;
  // packages: absent until migration 20261015120000 runs
  plans_ready?: boolean;
  plan_tier?: string | null;
  feature_overrides?: FeatureOverrides | null;
  owner_phone?: string | null;
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: "مطعم/مقهى بجلسات",
  quick_service: "مطعم وجبات سريعة",
  cafe: "مقهى سريع",
  cloud_kitchen: "مطبخ سحابي",
  salon: "صالون رجالي",
  ladies_salon: "صالون نسائي",
  car_wash: "مغسلة سيارات",
  mobile_car_wash: "مغسلة سيارات متنقلة",
  clinic: "عيادة",
  tailoring: "مشغل تفصيل",
  hotel: "فندق",
  retail: "متجر",
  other: "نشاط آخر",
};
// Types functionally identical to 'restaurant' today (same POS/dashboard
// code path, just different default settings — see signup route) don't
// need the "new sector" callout below; only genuinely different-engine or
// not-yet-built types do.
const RESTAURANT_LIKE_TYPES = ["restaurant", "quick_service", "cafe", "cloud_kitchen"];
// رقم سعودي محلي (05xxxxxxxx / 5xxxxxxxx / 00966...) إلى صيغة wa.me الدولية.
function waNumber(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = "966" + d.slice(1);
  else if (d.startsWith("5") && d.length === 9) d = "966" + d;
  return d;
}

const LOYALTY_THEME_LABELS: Record<string, string> = { classic: "كلاسيكي", minimal: "بسيط", bold: "جريء" };
const LOYALTY_PATTERN_LABELS: Record<string, string> = {
  none: "بدون",
  dots: "نقاط",
  diagonal: "قطري",
  waves: "أمواج",
  grid: "شبكة",
  chevron: "شيفرون",
  rings: "حلقات",
  icons: "أيقونات",
};
const LOYALTY_ICON_LABELS: Record<string, string> = {
  generic: "عام",
  coffee: "قهوة",
  burger: "برجر",
  pizza: "بيتزا",
  pastry: "معجنات",
  dessert: "حلويات",
  car: "سيارات",
  pet: "حيوانات أليفة",
  salon: "صالون",
  gym: "نادي رياضي",
  retail: "متجر",
  padel: "بادل",
  sports: "رياضة",
  spa: "سبا",
  clinic: "عيادة",
  custom: "مخصصة",
};

type Draft = {
  admin_notes: string;
  subscription_expires_at: string; // yyyy-mm-dd or ""
  online_order_free_limit: string;
  branch_limit: string;
  included_seats: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function draftFrom(b: Business): Draft {
  return {
    admin_notes: b.admin_notes || "",
    subscription_expires_at: b.subscription_expires_at ? b.subscription_expires_at.slice(0, 10) : "",
    online_order_free_limit: String(b.online_order_free_limit),
    branch_limit: String(b.branch_limit),
    included_seats: String(b.included_seats),
  };
}

type AdminTab = "overview" | "businesses" | "whatsapp" | "broadcast" | "contracts" | "quotes" | "offer" | "usage" | "printHealth" | "audit" | "landing";
const NAV: { label: string; items: { key: AdminTab; label: string; icon: string }[] }[] = [
  {
    label: "الرئيسية",
    items: [
      { key: "overview", label: "نظرة عامة", icon: "M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z" },
      { key: "businesses", label: "المشتركين", icon: "M3 21V8l9-5 9 5v13M9 21v-7h6v7" },
    ],
  },
  {
    label: "المبيعات",
    items: [
      { key: "contracts", label: "العقود والدفعات", icon: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" },
      { key: "quotes", label: "عروض الأسعار", icon: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01" },
      { key: "offer", label: "عرض خاص", icon: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" },
      { key: "landing", label: "عملاء الهبوط", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
    ],
  },
  {
    label: "التواصل",
    items: [
      { key: "whatsapp", label: "واتساب", icon: "M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 21l2.2-5.2A8.4 8.4 0 1 1 21 11.5z" },
      { key: "broadcast", label: "رسائل واتساب", icon: "M22 2 11 13M22 2l-7 20-4-9-9-4z" },
    ],
  },
  {
    label: "النظام",
    items: [
      { key: "usage", label: "استهلاك البنية التحتية", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
      { key: "printHealth", label: "صحة الطباعة", icon: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" },
      { key: "audit", label: "سجل التدقيق", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
    ],
  },
];

export default function AdminDashboard() {
  const [sb] = useState(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
  const [session, setSession] = useState<{ email: string; token: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  // Tells the boot watchdog in page.tsx that the JS bundle ran on this
  // browser; without it the watchdog replaces the blank page with the
  // reason (last error + browser version) after 12s.
  useEffect(() => { (window as unknown as { __rkAdminReady?: boolean }).__rkAdminReady = true; }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // M5 (security hardening phase 2) — step-up MFA (TOTP) is now mandatory
  // for every admin session; a password alone (aal1) no longer reaches the
  // dashboard, and every /api/admin/* route independently rejects an aal1
  // token server-side (lib/adminAuth.ts) regardless of what this UI does.
  const [mfaStep, setMfaStep] = useState<"none" | "challenge" | "enroll">("none");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaQrSvg, setMfaQrSvg] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [accOpen, setAccOpen] = useState(false);
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingDrawer, setSavingDrawer] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [bzTab, setBzTab] = useState<"overview" | "plan" | "account" | "design">("overview");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [credentialsBusy, setCredentialsBusy] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsSuccess, setCredentialsSuccess] = useState(false);
  const [showDeleteBox, setShowDeleteBox] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [designSaving, setDesignSaving] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.getRegistration("/dashboard-sw.js").then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setPushEnabled(true);
    });
  }, []);

  async function enableAdminPushNotifications() {
    if (!session) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("المتصفح لا يدعم الإشعارات");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("لم يتم منح إذن الإشعارات");
      const reg = await navigator.serviceWorker.register("/dashboard-sw.js");
      await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      }
      const json = sub.toJSON();
      const res = await fetch("/api/admin/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "تعذر تفعيل الإشعارات");
      setPushEnabled(true);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "تعذر تفعيل الإشعارات");
    } finally {
      setPushBusy(false);
    }
  }

  // Re-authenticates with the current password before allowing the change —
  // proves whoever's at the keyboard actually knows it, without an email
  // link. An open, unlocked admin session on a shared device shouldn't be
  // enough on its own to hijack the account.
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setPwError(null);
    setPwSuccess(false);
    if (newPw.length < 8) {
      setPwError("كلمة المرور الجديدة لازم تكون ٨ أحرف على الأقل");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("كلمة المرور الجديدة غير متطابقة");
      return;
    }
    setPwBusy(true);
    const { error: reauthError } = await sb.auth.signInWithPassword({ email: session.email, password: currentPw });
    if (reauthError) {
      setPwBusy(false);
      setPwError("كلمة المرور الحالية غير صحيحة");
      return;
    }
    const { error: updateError } = await sb.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (updateError) {
      setPwError(updateError.message || "تعذر تغيير كلمة المرور");
      return;
    }
    setPwSuccess(true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  }

  useEffect(() => {
    // Until this settles the page renders an empty screen. It used to end only
    // on the happy path, so a saved session that failed to refresh (stale
    // token on one browser, MFA call erroring) left that browser blank for
    // good while the phone worked. Now every outcome ends on a usable screen:
    // a failure drops the broken local session and shows the login form, and
    // an auth call that never answers is cut off after 8s.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setCheckingSession(false);
    };
    const giveUp = setTimeout(() => {
      if (settled) return;
      console.error("admin: session check did not answer in 8s");
      sb.auth.signOut({ scope: "local" }).catch(() => {});
      finish();
    }, 8000);
    (async () => {
      try {
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        if (data.session) {
          const { data: aalData, error: aalError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aalError) throw aalError;
          if (aalData?.currentLevel === "aal2") {
            setSession({ email: data.session.user.email || "", token: data.session.access_token });
          } else {
            // A real (aal1-only) session exists but hasn't cleared step-up —
            // e.g. a page reload mid-MFA-flow. Re-enter the challenge/enroll
            // step instead of either granting access or forcing a fresh
            // password entry.
            await beginMfaFlow();
          }
        }
      } catch (err) {
        console.error("admin: saved session unusable, showing login", err);
        await sb.auth.signOut({ scope: "local" }).catch(() => {});
        setSession(null);
      } finally {
        clearTimeout(giveUp);
        finish();
      }
    })();
    return () => clearTimeout(giveUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  // Decides whether this account needs to complete a challenge on an
  // already-enrolled factor, or enroll a factor for the first time —
  // shared by both the fresh-login path and the reload-mid-flow path above.
  async function beginMfaFlow() {
    setMfaError(null);
    const { data: factorsData, error: factorsError } = await sb.auth.mfa.listFactors();
    if (factorsError) {
      setMfaError(factorsError.message);
      return;
    }
    const verifiedTotp = (factorsData?.totp || []).find((f) => f.status === "verified");
    if (verifiedTotp) {
      const { data: challengeData, error: challengeError } = await sb.auth.mfa.challenge({ factorId: verifiedTotp.id });
      if (challengeError) {
        setMfaError(challengeError.message);
        return;
      }
      setMfaFactorId(verifiedTotp.id);
      setMfaChallengeId(challengeData.id);
      setMfaStep("challenge");
    } else {
      const { data: enrollData, error: enrollError } = await sb.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) {
        setMfaError(enrollError.message);
        return;
      }
      setMfaFactorId(enrollData.id);
      setMfaQrSvg(enrollData.totp.qr_code);
      setMfaSecret(enrollData.totp.secret);
      setMfaStep("enroll");
    }
  }

  async function submitMfaCode(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setMfaBusy(true);
    setMfaError(null);
    const { error } =
      mfaStep === "enroll"
        ? await sb.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode })
        : await sb.auth.mfa.verify({ factorId: mfaFactorId, challengeId: mfaChallengeId!, code: mfaCode });
    setMfaBusy(false);
    if (error) {
      setMfaError("الرمز غير صحيح — تأكد من تطبيق المصادقة وحاول مرة ثانية");
      setMfaCode("");
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session) {
      setMfaError("تعذر إكمال الدخول");
      return;
    }
    setMfaStep("none");
    setMfaCode("");
    setSession({ email: sessionData.session.user.email || "", token: sessionData.session.access_token });
  }

  async function loadBusinesses(token: string) {
    setLoadError(null);
    const res = await fetch("/api/admin/businesses", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      setLoadError(data.error || "تعذر التحميل");
      return;
    }
    setBusinesses(data.businesses);
  }

  useEffect(() => {
    if (session) loadBusinesses(session.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Receipts waiting for confirmation → counter on the contracts tab, so a
  // subscriber's upload is visible from anywhere in /admin.
  const [pendingReceipts, setPendingReceipts] = useState(0);
  useEffect(() => {
    if (!session) return;
    const check = () =>
      fetch("/api/admin/contracts", { headers: { Authorization: `Bearer ${session.token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const rows = (d?.contracts || []) as { payments?: { status: string }[] }[];
          setPendingReceipts(rows.reduce((s, c) => s + (c.payments || []).filter((p) => p.status === "submitted").length, 0));
        })
        .catch(() => {});
    const first = window.setTimeout(check, 0);
    const t = window.setInterval(check, 2 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [session, activeTab]);

  const selected = useMemo(() => businesses?.find((b) => b.id === selectedId) || null, [businesses, selectedId]);

  function openDrawer(b: Business) {
    setSelectedId(b.id);
    setBzTab("overview");
    setDraft(draftFrom(b));
    setDrawerError(null);
    setStats(null);
    setShowDeleteBox(false);
    setDeleteConfirmText("");
    setNewOwnerEmail("");
    setNewOwnerPassword("");
    setCredentialsError(null);
    setCredentialsSuccess(false);
    setDesignError(null);
    setUploadingField(null);
    setDesignSaving(null);
    if (session) {
      setStatsLoading(true);
      fetch(`/api/admin/businesses/${b.id}`, { headers: { Authorization: `Bearer ${session.token}` } })
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch(() => {})
        .finally(() => setStatsLoading(false));
    }
  }
  function closeDrawer() {
    setSelectedId(null);
    setDraft(null);
    setDrawerError(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setLoggingIn(false);
      setLoginError("بيانات دخول غير صحيحة");
      return;
    }
    // Password alone is only aal1 — never sets `session` directly. Every
    // successful password login must clear a TOTP step (challenge if
    // already enrolled, enrollment if this is the first login since MFA
    // became mandatory) before the dashboard itself is reachable.
    await beginMfaFlow();
    setLoggingIn(false);
  }

  async function patchBusiness(id: number, updates: Record<string, unknown>): Promise<boolean> {
    if (!session) return false;
    const res = await fetch(`/api/admin/businesses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      setDrawerError(data.error || "تعذر الحفظ");
      return false;
    }
    setBusinesses((prev) => prev && prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    return true;
  }

  type BooleanField = "online_subscribed" | "online_ordering_enabled" | "kitchen_display_enabled" | "inventory_enabled" | "loyalty_enabled";

  async function toggle(business: Business, field: BooleanField) {
    setBusyId(business.id);
    const ok = await patchBusiness(business.id, { [field]: !business[field] });
    setBusyId(null);
    if (ok) setDrawerError(null);
  }

  // Package changes can switch flags off (the DB trigger enforces the
  // package's ceiling) and raise branch_limit, so the list row and the
  // drawer's stats are both reloaded afterwards rather than patched locally.
  async function savePlan(business: Business, updates: { plan_tier?: string | null; feature_overrides?: FeatureOverrides }) {
    if (!session) return;
    setBusyId(business.id);
    const ok = await patchBusiness(business.id, updates);
    if (ok) {
      setDrawerError(null);
      const res = await fetch(`/api/admin/businesses/${business.id}`, { headers: { Authorization: `Bearer ${session.token}` } });
      if (res.ok) setStats(await res.json());
      await loadBusinesses(session.token);
    }
    setBusyId(null);
  }

  // One click flips whether the business may use a feature. The override is
  // only kept when it differs from the package; otherwise it's dropped, so a
  // later package change isn't fighting stale exceptions.
  function toggleFeature(business: Business, key: FeatureKey) {
    const plan = planByKey(stats?.plan_tier);
    if (!plan) return;
    const overrides: FeatureOverrides = { ...(stats?.feature_overrides || {}) };
    const nowAllowed = allowedFeatures(plan.key, overrides).has(key);
    const inPlan = plan.features.includes(key);
    if (nowAllowed === inPlan) overrides[key] = !inPlan;
    else delete overrides[key];
    savePlan(business, { feature_overrides: overrides });
  }

  async function toggleSuspend(business: Business) {
    setBusyId(business.id);
    const ok = await patchBusiness(business.id, { is_active: !business.is_active });
    setBusyId(null);
    if (ok) setDrawerError(null);
  }

  async function setVerification(business: Business, status: "verified" | "rejected" | "pending") {
    setBusyId(business.id);
    const ok = await patchBusiness(business.id, { verification_status: status });
    setBusyId(null);
    if (ok) setDrawerError(null);
  }

  async function saveDesignField(field: string, value: string) {
    if (!selected || !session) return;
    setDesignSaving(field);
    setDesignError(null);
    const res = await fetch(`/api/admin/businesses/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setDesignSaving(null);
    if (!res.ok) {
      setDesignError(data.error || "تعذر الحفظ");
      return;
    }
    setStats((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function uploadDesignFile(field: string, file: File) {
    if (!selected || !session) return;
    setUploadingField(field);
    setDesignError(null);
    const fd = new FormData();
    fd.append("field", field);
    fd.append("file", file);
    const res = await fetch(`/api/admin/businesses/${selected.id}/branding`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: fd,
    });
    const data = await res.json();
    setUploadingField(null);
    if (!res.ok) {
      setDesignError(data.error || "تعذر الرفع");
      return;
    }
    setStats((prev) => (prev ? { ...prev, [field]: data.url } : prev));
  }

  async function removeDesignImage(field: string) {
    if (!selected || !session) return;
    setDesignSaving(field);
    const res = await fetch(`/api/admin/businesses/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ [field]: null }),
    });
    setDesignSaving(null);
    if (res.ok) setStats((prev) => (prev ? { ...prev, [field]: null } : prev));
  }

  async function updateOwnerCredentials() {
    if (!selected || !session) return;
    if (!newOwnerEmail.trim() && !newOwnerPassword) return;
    setCredentialsBusy(true);
    setCredentialsError(null);
    setCredentialsSuccess(false);
    const body: Record<string, string> = {};
    if (newOwnerEmail.trim()) body.email = newOwnerEmail.trim();
    if (newOwnerPassword) body.password = newOwnerPassword;
    const res = await fetch(`/api/admin/businesses/${selected.id}/owner-credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setCredentialsBusy(false);
    if (!res.ok) {
      setCredentialsError(data.error || "تعذر التحديث");
      return;
    }
    setCredentialsSuccess(true);
    setNewOwnerEmail("");
    setNewOwnerPassword("");
    if (body.email) setStats((prev) => (prev ? { ...prev, owner_email: body.email } : prev));
  }

  function formatRelative(iso: string | null): string {
    if (!iso) return "ما فيه طلبات بعد";
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return "اليوم";
    if (days === 1) return "أمس";
    return `قبل ${days} يوم`;
  }

  async function saveDrawer() {
    if (!selected || !draft) return;
    setDrawerError(null);

    const freeLimit = Number(draft.online_order_free_limit);
    const branchLimit = Number(draft.branch_limit);
    const seats = Number(draft.included_seats);
    if (!Number.isInteger(freeLimit) || freeLimit < 0) {
      setDrawerError("حد الطلبات المجانية لازم يكون رقم صحيح ٠ أو أكبر");
      return;
    }
    if (!Number.isInteger(branchLimit) || branchLimit < 1) {
      setDrawerError("حد الفروع لازم يكون ١ على الأقل");
      return;
    }
    if (!Number.isInteger(seats) || seats < 1) {
      setDrawerError("عدد المقاعد لازم يكون ١ على الأقل");
      return;
    }

    setSavingDrawer(true);
    const ok = await patchBusiness(selected.id, {
      admin_notes: draft.admin_notes.trim() || null,
      subscription_expires_at: draft.subscription_expires_at ? new Date(draft.subscription_expires_at).toISOString() : null,
      online_order_free_limit: freeLimit,
      branch_limit: branchLimit,
      included_seats: seats,
    });
    setSavingDrawer(false);
    if (ok) closeDrawer();
  }

  async function deleteBusiness() {
    if (!selected || !session) return;
    if (deleteConfirmText !== selected.name) return;
    setDeleteBusy(true);
    setDrawerError(null);
    const res = await fetch(`/api/admin/businesses/${selected.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ confirm_name: deleteConfirmText }),
    });
    const data = await res.json();
    setDeleteBusy(false);
    if (!res.ok) {
      setDrawerError(data.error || "تعذر الحذف");
      return;
    }
    setBusinesses((prev) => prev && prev.filter((b) => b.id !== selected.id));
    closeDrawer();
  }

  if (checkingSession) return <div style={styles.page} />;

  if (!session && mfaStep === "enroll") {
    return (
      <div style={styles.page}>
        <form style={styles.loginCard} onSubmit={submitMfaCode}>
          <h1 style={styles.title}>فعّل التحقق بخطوتين</h1>
          <p style={styles.subtitle}>مطلوب لكل حساب إداري — امسح الرمز بتطبيق مصادقة (Google Authenticator أو مشابه)</p>
          {mfaQrSvg && <div style={{ background: "#fff", padding: "12px", borderRadius: "10px", margin: "0 auto 12px", width: "fit-content" }} dangerouslySetInnerHTML={{ __html: mfaQrSvg }} />}
          {mfaSecret && <p style={{ fontSize: "11px", color: "#8a8477", textAlign: "center", wordBreak: "break-all" }}>أو أدخل هذا الرمز يدويًا: {mfaSecret}</p>}
          <input
            style={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="رمز التحقق المكوّن من ٦ أرقام"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
          {mfaError && <p style={styles.error}>{mfaError}</p>}
          <button type="submit" style={{ ...styles.btn, opacity: mfaBusy ? 0.6 : 1 }} disabled={mfaBusy || mfaCode.length !== 6}>
            {mfaBusy ? "جاري التفعيل..." : "تفعيل والدخول"}
          </button>
        </form>
      </div>
    );
  }

  if (!session && mfaStep === "challenge") {
    return (
      <div style={styles.page}>
        <form style={styles.loginCard} onSubmit={submitMfaCode}>
          <h1 style={styles.title}>التحقق بخطوتين</h1>
          <p style={styles.subtitle}>اكتب الرمز المعروض بتطبيق المصادقة</p>
          <input
            style={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="رمز التحقق المكوّن من ٦ أرقام"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            required
          />
          {mfaError && <p style={styles.error}>{mfaError}</p>}
          <button type="submit" style={{ ...styles.btn, opacity: mfaBusy ? 0.6 : 1 }} disabled={mfaBusy || mfaCode.length !== 6}>
            {mfaBusy ? "جاري التحقق..." : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <form style={styles.loginCard} onSubmit={handleLogin}>
          <h1 style={styles.title}>لوحة إدارة ركين</h1>
          <p style={styles.subtitle}>دخول أصحاب صلاحية الإدارة فقط</p>
          <input style={styles.input} type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {loginError && <p style={styles.error}>{loginError}</p>}
          {mfaError && <p style={styles.error}>{mfaError}</p>}
          <button type="submit" style={{ ...styles.btn, opacity: loggingIn ? 0.6 : 1 }} disabled={loggingIn}>
            {loggingIn ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  const filtered = (businesses || []).filter(
    (b) => !search.trim() || b.name.includes(search.trim()) || (b.owner_name || "").includes(search.trim()) || String(b.id) === search.trim().replace(/^#/, "")
  );
  const totalCount = businesses?.length ?? 0;
  const totalOrders = businesses && businesses.every((b) => b.total_orders != null) ? businesses.reduce((s, b) => s + (b.total_orders || 0), 0) : null;
  const subscribedCount = businesses?.filter((b) => b.online_subscribed).length ?? 0;
  const suspendedCount = businesses?.filter((b) => !b.is_active).length ?? 0;
  const nearingEndCount =
    businesses?.filter((b) => !b.online_subscribed && b.online_order_free_limit > 0 && b.online_order_free_count / b.online_order_free_limit >= 0.8).length ?? 0;
  const pendingReviewCount = businesses?.filter((b) => b.verification_status === "pending").length ?? 0;

  const tabTitle = NAV.flatMap((g) => g.items).find((i) => i.key === activeTab)?.label || "";
  const accountActions = (
    <>
      <div className="ad-acc-mail">{session.email}</div>
      {pushError && <div className="ad-err">{pushError}</div>}
      <button type="button" className={pushEnabled ? "on" : ""} onClick={enableAdminPushNotifications} disabled={pushBusy || pushEnabled}>
        {pushEnabled ? "✓ إشعارات الجوال مفعّلة" : pushBusy ? "جارٍ التفعيل..." : "فعّل إشعارات الجوال"}
      </button>
      <button
        type="button"
        onClick={() => {
          setShowPwForm((v) => !v);
          setPwError(null);
          setPwSuccess(false);
          setAccOpen(false);
        }}
      >
        تغيير كلمة المرور
      </button>
      <button
        type="button"
        onClick={() => {
          sb.auth.signOut();
          setSession(null);
          setBusinesses(null);
        }}
      >
        تسجيل خروج
      </button>
    </>
  );

  return (
    <div className="ad">
      <aside className="ad-side">
        <div className="ad-mtop">
          <div className="ad-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/rakeen-wordmark.png" alt="ركين" />
            <span>لوحة الإدارة</span>
          </div>
          <button type="button" className="ad-mtop-acc" onClick={() => setAccOpen((v) => !v)} aria-expanded={accOpen}>
            الحساب
          </button>
        </div>
        <nav className="ad-nav" aria-label="أقسام لوحة الإدارة">
          {NAV.map((g) => (
            <div key={g.label} className="ad-group">
              <div className="ad-group-label">{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`ad-link${activeTab === it.key ? " on" : ""}`}
                  aria-current={activeTab === it.key ? "page" : undefined}
                  onClick={(e) => {
                    setActiveTab(it.key);
                    e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={it.icon} />
                  </svg>
                  {it.label}
                  {it.key === "contracts" && pendingReceipts > 0 && <span className="ad-badge">{pendingReceipts}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={`ad-acc${accOpen ? " mobile" : ""}`}>{accountActions}</div>
      </aside>

      <main className="ad-main">
        <div className="ad-main-inner">
        <div className="ad-pagehead">
          <div>
            <h1>{tabTitle}</h1>
            <p>{new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" })}</p>
          </div>
        </div>

        {showPwForm && (
          <form
            onSubmit={changePassword}
            style={{ background: "#fff", borderRadius: "16px", padding: "18px 20px", marginBottom: "20px", boxShadow: "0 8px 24px rgba(23,23,23,0.06)", maxWidth: "360px" }}
          >
            <p style={{ fontSize: "13px", fontWeight: 800, marginBottom: "4px" }}>تغيير كلمة المرور</p>
            <p style={styles.subtitle}>التأكيد بإدخال كلمة المرور الحالية فقط — بدون بريد إلكتروني</p>
            <input style={styles.input} type="password" placeholder="كلمة المرور الحالية" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            <input style={styles.input} type="password" placeholder="كلمة المرور الجديدة" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
            <input style={styles.input} type="password" placeholder="تأكيد كلمة المرور الجديدة" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={8} />
            {pwError && <p style={styles.error}>{pwError}</p>}
            {pwSuccess && <p style={{ fontSize: "11.5px", fontWeight: 700, color: "#4C7A0A", marginTop: "10px" }}>تم تغيير كلمة المرور بنجاح ✓</p>}
            <button type="submit" style={{ ...styles.btn, opacity: pwBusy ? 0.6 : 1 }} disabled={pwBusy}>
              {pwBusy ? "جاري التغيير..." : "تغيير كلمة المرور"}
            </button>
          </form>
        )}

        {activeTab === "overview" && (
          <OverviewPanel
            token={session.token}
            onGoContracts={() => setActiveTab("contracts")}
            onOpenBusiness={(id) => {
              const b = businesses?.find((x) => x.id === id);
              if (b) openDrawer(b);
            }}
          />
        )}
        {activeTab === "whatsapp" && <WhatsAppAdminPanel token={session.token} />}
        {activeTab === "broadcast" && <BroadcastPanel token={session.token} />}
        {activeTab === "contracts" && <ContractsPanel token={session.token} />}
        {activeTab === "quotes" && <QuotePanel />}
        {activeTab === "offer" && <OfferPanel />}
        {activeTab === "usage" && <UsagePanel token={session.token} />}
        {activeTab === "printHealth" && <PrintHealthPanel token={session.token} />}
        {activeTab === "audit" && <AuditLogPanel token={session.token} />}
        {activeTab === "landing" && <LandingClientsPanel token={session.token} />}

        {activeTab === "businesses" && (
        <>
        <div style={styles.statsRow}>
          <div style={{ ...styles.statCard, background: "#171717", color: "#FBFAF5" }}>
            <div style={{ ...styles.statLabel, color: "rgba(251,250,245,0.55)" }}>إجمالي الطلبات</div>
            <div style={{ ...styles.statValue, color: "#C4FF2B" }}>{totalOrders == null ? "—" : totalOrders.toLocaleString("en-US")}</div>
          </div>
          {(
            [
              ["الحسابات", totalCount, null],
              ["مشتركين", subscribedCount, "#7BAD0F"],
              ["قريبين من نهاية التجربة", nearingEndCount, nearingEndCount > 0 ? "#B0402C" : null],
              ["بانتظار التوثيق", pendingReviewCount, pendingReviewCount > 0 ? "#C9822C" : null],
              ["موقوفين", suspendedCount, suspendedCount > 0 ? "#B0402C" : null],
            ] as const
          ).map(([text, value, accent]) => (
            <div key={text} style={{ ...styles.statCard, ...(accent ? { boxShadow: `inset 0 3px 0 ${accent}, 0 1px 2px rgba(23,23,23,0.04), 0 8px 24px rgba(23,23,23,0.05)` } : {}) }}>
              <div style={styles.statLabel}>{text}</div>
              <div style={{ ...styles.statValue, color: accent || "#171717" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "0 1 360px" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8a8375" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", insetInlineStart: "14px", top: "50%", transform: "translateY(-50%)" }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              style={{ ...styles.input, marginTop: 0, paddingInlineStart: "40px", borderRadius: "999px", background: "#fff" }}
              placeholder="ابحث بالاسم أو المالك أو رقم المعرف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ fontSize: "11.5px", color: "#8a8375", fontWeight: 700 }}>{filtered.length} حساب</span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ marginInlineStart: "auto", padding: "9px 16px", borderRadius: "999px", background: "#171717", color: "#C4FF2B", fontWeight: 800, fontSize: "12px", border: "none", cursor: "pointer" }}
          >
            + إضافة مشترك
          </button>
          {addOpen && session && (
            <AddBusinessPanel token={session.token} onClose={() => setAddOpen(false)} onCreated={() => loadBusinesses(session.token)} />
          )}
        </div>

        {loadError && <p style={styles.error}>{loadError}</p>}

        <div style={styles.tableWrap} className="ad-btable-wrap">
          <table style={styles.table} className="ad-btable">
            <thead>
              <tr>
                <th style={styles.th}>المطعم</th>
                <th style={styles.th}>المالك</th>
                <th style={styles.th}>الطلبات الفعلية</th>
                <th style={styles.th}>الفترة التجريبية</th>
                <th style={styles.th}>الاشتراك</th>
                <th style={styles.th}>المتجر مفعّل</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} style={{ ...styles.tr, opacity: b.is_active ? 1 : 0.55 }}>
                  <td style={styles.td} className="ad-c-biz">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={styles.avatar}>{Array.from(b.name.trim())[0] || "؟"}</span>
                    <div>
                    <div style={{ fontWeight: 800, fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                      {b.name}
                      {!b.is_active && <span style={styles.suspendedBadge}>موقوف</span>}
                      {b.verification_status === "pending" && <span style={styles.pendingBadge}>قيد المراجعة</span>}
                      {b.verification_status === "rejected" && <span style={styles.suspendedBadge}>مرفوض</span>}
                      {!RESTAURANT_LIKE_TYPES.includes(b.business_type) && (
                        <span style={styles.pendingBadge}>{BUSINESS_TYPE_LABELS[b.business_type]} — قطاع جديد</span>
                      )}
                    </div>
                    <div style={{ ...styles.muted, display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, background: "#171717", color: "#C4FF2B", borderRadius: "6px", padding: "1px 7px" }}>
                        معرف الحساب {b.id}
                      </span>
                      {new Date(b.created_at).toLocaleDateString("ar-SA")}
                    </div>
                    </div>
                    </div>
                  </td>
                  <td style={styles.td} data-label="المالك">{b.owner_name || "—"}</td>
                  <td style={styles.td} data-label="الطلبات">
                    {b.total_orders == null ? (
                      "—"
                    ) : (
                      <>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800 }}>{b.total_orders.toLocaleString("en-US")}</span>
                        <div style={styles.muted}>أونلاين {(b.online_orders ?? 0).toLocaleString("en-US")}</div>
                      </>
                    )}
                  </td>
                  <td style={styles.td} data-label="التجربة">
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontWeight: 700,
                        color: b.online_order_free_count >= b.online_order_free_limit ? "#B0402C" : "inherit",
                      }}
                    >
                      {b.online_order_free_count}/{b.online_order_free_limit}
                    </span>
                  </td>
                  <td style={styles.td} data-label="الاشتراك">
                    <button
                      style={{ ...styles.toggleBtn, background: b.online_subscribed ? "#7BAD0F" : "#EDEADF", color: b.online_subscribed ? "#fff" : "#171717" }}
                      onClick={() => toggle(b, "online_subscribed")}
                      disabled={busyId === b.id}
                    >
                      {b.online_subscribed ? "مشترك ✓" : "غير مشترك"}
                    </button>
                  </td>
                  <td style={styles.td} data-label="المتجر">
                    <button
                      style={{ ...styles.toggleBtn, background: b.online_ordering_enabled ? "#7BAD0F" : "#B0402C", color: "#fff" }}
                      onClick={() => toggle(b, "online_ordering_enabled")}
                      disabled={busyId === b.id}
                    >
                      {b.online_ordering_enabled ? "مفعّل" : "موقوف"}
                    </button>
                  </td>
                  <td style={styles.td} className="ad-c-act">
                    <button style={styles.detailBtn} onClick={() => openDrawer(b)}>
                      تفاصيل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && businesses && <p style={{ ...styles.muted, padding: "20px", textAlign: "center" }}>ما فيه نتائج</p>}
        </div>
        </>
        )}
        </div>
      </main>

      {selected && draft && (
        <div className="bz-overlay" onClick={closeDrawer}>
          <div className="bz" role="dialog" aria-modal="true" aria-label={selected.name} onClick={(e) => e.stopPropagation()}>
            <header className="bz-head">
              <div className="bz-id">
                {stats?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="bz-logo" src={stats.logo_url} alt="" />
                ) : (
                  <span className="bz-logo bz-logo-letter">{Array.from(selected.name.trim())[0] || "؟"}</span>
                )}
                <div className="bz-id-text">
                  <h2>{selected.name}</h2>
                  <div className="bz-chips">
                    <span className="bz-chip mono">#{selected.id}</span>
                    {planByKey(stats?.plan_tier) && <span className="bz-chip lime">{planByKey(stats?.plan_tier)!.name}</span>}
                    <span className={`bz-chip ${selected.online_subscribed ? "ok" : ""}`}>{selected.online_subscribed ? "مشترك" : "تجربة"}</span>
                    {!selected.is_active && <span className="bz-chip bad">موقوف</span>}
                    {selected.verification_status === "pending" && <span className="bz-chip warn">بانتظار التوثيق</span>}
                    {selected.verification_status === "rejected" && <span className="bz-chip bad">مرفوض</span>}
                  </div>
                </div>
              </div>
              <button type="button" className="bz-x" onClick={closeDrawer} aria-label="إغلاق">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <div className="bz-quick">
                {stats?.owner_phone && (
                  <a className="bz-qbtn lime" href={`https://wa.me/${waNumber(stats.owner_phone)}`} target="_blank" rel="noopener noreferrer">
                    واتساب المالك
                  </a>
                )}
                {selected.online_menu_slug && (
                  <a className="bz-qbtn" href={`https://${selected.online_menu_slug}.rakeenapp.com`} target="_blank" rel="noopener noreferrer">
                    المتجر
                  </a>
                )}
                <span className="bz-owner">
                  {selected.owner_name || "—"}
                  {stats?.owner_email && <small>{stats.owner_email}</small>}
                </span>
              </div>
              <nav className="bz-tabs" role="tablist">
                {(
                  [
                    ["overview", "نظرة"],
                    ["plan", "الباقة والمزايا"],
                    ["account", "الحساب"],
                    ["design", "التصميم"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={bzTab === k} className={bzTab === k ? "on" : ""} onClick={() => setBzTab(k)}>
                    {label}
                  </button>
                ))}
              </nav>
            </header>

            <div className="bz-body">
              {drawerError && <p className="bz-err">{drawerError}</p>}

              {bzTab === "overview" && (
                <>
                  <section className="bz-stats">
                    {(
                      [
                        ["إجمالي الطلبات", statsLoading || !stats ? "…" : stats.orders_count.toLocaleString("en-US")],
                        ["آخر طلب", statsLoading || !stats ? "…" : formatRelative(stats.last_order_at)],
                        ["الفروع", statsLoading || !stats ? "…" : `${stats.branch_count}/${selected.branch_limit}`],
                        ["الموظفين", statsLoading || !stats ? "…" : `${stats.staff_count}/${selected.included_seats}`],
                      ] as const
                    ).map(([l, v]) => (
                      <div key={l} className="bz-stat">
                        <b>{v}</b>
                        <span>{l}</span>
                      </div>
                    ))}
                  </section>

                  <section className="bz-card">
                    <div className="bz-row">
                      <div>
                        <b>الاشتراك</b>
                        <small>{selected.online_subscribed ? "مشترك، بدون حد للطلبات" : `في التجربة · استخدم ${selected.online_order_free_count} من ${selected.online_order_free_limit}`}</small>
                      </div>
                      <button type="button" role="switch" aria-checked={selected.online_subscribed} className="bz-sw" onClick={() => toggle(selected, "online_subscribed")} disabled={busyId === selected.id} aria-label="مشترك" />
                    </div>
                    {!selected.online_subscribed && (
                      <div className="bz-meter" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, (selected.online_order_free_count / Math.max(1, selected.online_order_free_limit)) * 100)}%` }} />
                      </div>
                    )}
                    <div className="bz-row">
                      <div>
                        <b>المتجر الإلكتروني</b>
                        <small>{selected.online_ordering_enabled ? "يستقبل طلبات" : "متوقف عن الطلبات"}</small>
                      </div>
                      <button type="button" role="switch" aria-checked={selected.online_ordering_enabled} className="bz-sw" onClick={() => toggle(selected, "online_ordering_enabled")} disabled={busyId === selected.id} aria-label="المتجر الإلكتروني" />
                    </div>
                  </section>

                  <section className="bz-card">
                    <h3>ملاحظاتك عن المطعم</h3>
                    <textarea className="bz-input" rows={4} placeholder="مثال: قال راح يشترك الأسبوع الجاي..." value={draft.admin_notes} onChange={(e) => setDraft({ ...draft, admin_notes: e.target.value })} />
                    <p className="bz-hint">خاصة فيك، المطعم ما يشوفها.</p>
                  </section>
                </>
              )}

              {bzTab === "plan" && (
                <>
                  {!stats ? (
                    <p className="bz-hint">جاري التحميل...</p>
                  ) : !stats.plans_ready ? (
                    <p className="bz-hint">الباقات تحتاج تشغيل migration ‎20261015120000 في سوبابيس أولاً.</p>
                  ) : (
                    <>
                      <section className="bz-plans" role="radiogroup" aria-label="الباقة">
                        {[{ key: "", name: "بدون باقة", monthly: 0 }, ...PLANS].map((p) => {
                          const on = (stats.plan_tier || "") === p.key;
                          return (
                            <button
                              key={p.key || "none"}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              className={`bz-plan${on ? " on" : ""}`}
                              disabled={busyId === selected.id}
                              onClick={() => !on && savePlan(selected, { plan_tier: p.key || null })}
                            >
                              <b>{p.name}</b>
                              <span>{p.key ? `${p.monthly} ر.س/شهر` : "كل المزايا مسموحة"}</span>
                            </button>
                          );
                        })}
                      </section>
                      {planByKey(stats.plan_tier) ? (
                        <section className="bz-card">
                          <h3>المزايا</h3>
                          {(() => {
                            const plan = planByKey(stats.plan_tier)!;
                            const allowed = allowedFeatures(plan.key, stats.feature_overrides);
                            return SELLABLE_FEATURES.map((f) => {
                              const on = allowed.has(f.key);
                              const inPlan = plan.features.includes(f.key);
                              const note = on && !inPlan ? "أضفتها أنت" : !on && inPlan ? "قفلتها أنت" : on ? "من الباقة" : "خارج الباقة";
                              const custom = on !== inPlan;
                              return (
                                <div key={f.key} className="bz-row">
                                  <div>
                                    <b>{f.label}</b>
                                    <small className={custom ? "bz-custom" : ""}>{note}</small>
                                  </div>
                                  <button type="button" role="switch" aria-checked={on} className="bz-sw" onClick={() => toggleFeature(selected, f.key)} disabled={busyId === selected.id} aria-label={f.label} />
                                </div>
                              );
                            });
                          })()}
                          <p className="bz-hint">الباقة تحدد وش يقدر المطعم يستخدم، وأنت تفك له أو تقفل أي ميزة. المقفل ينطفي تلقائياً حتى لو حاول صاحب المطعم يشغّله.</p>
                        </section>
                      ) : (
                        <p className="bz-hint">بدون باقة: المطعم يقدر يستخدم كل المزايا. اختر له باقة عشان تتحكم فيها.</p>
                      )}
                    </>
                  )}

                  <section className="bz-card">
                    <h3>الوحدات</h3>
                    {(
                      [
                        ["kitchen_display_enabled", "شاشة المطبخ"],
                        ["inventory_enabled", "المخزون والتكاليف"],
                        ["loyalty_enabled", "نظام الولاء"],
                      ] as const
                    ).map(([k, label]) => (
                      <div key={k} className="bz-row">
                        <div>
                          <b>{label}</b>
                          <small>{selected[k] ? "مفعّلة" : "مقفلة"}</small>
                        </div>
                        <button type="button" role="switch" aria-checked={selected[k]} className="bz-sw" onClick={() => toggle(selected, k)} disabled={busyId === selected.id} aria-label={label} />
                      </div>
                    ))}
                    <p className="bz-hint">شاشة المطبخ والمخزون تتفعّل من ركين بس. الولاء يقدر المطعم يشغّله من إعداداته، وهذا مفتاح احتياطي لك.</p>
                  </section>
                </>
              )}

              {bzTab === "account" && (
                <>
                  <section className="bz-card">
                    <h3>الحدود والتجديد</h3>
                    <div className="bz-fields">
                      <label>
                        <span>حد الطلبات المجانية</span>
                        <input className="bz-input" type="number" min={0} value={draft.online_order_free_limit} onChange={(e) => setDraft({ ...draft, online_order_free_limit: e.target.value })} />
                        <small>استخدم {selected.online_order_free_count}</small>
                      </label>
                      <label>
                        <span>حد الفروع</span>
                        <input className="bz-input" type="number" min={1} value={draft.branch_limit} onChange={(e) => setDraft({ ...draft, branch_limit: e.target.value })} />
                      </label>
                      <label>
                        <span>مقاعد الموظفين</span>
                        <input className="bz-input" type="number" min={1} value={draft.included_seats} onChange={(e) => setDraft({ ...draft, included_seats: e.target.value })} />
                      </label>
                      <label>
                        <span>تاريخ التجديد (تذكير لك)</span>
                        <input className="bz-input" type="date" value={draft.subscription_expires_at} onChange={(e) => setDraft({ ...draft, subscription_expires_at: e.target.value })} />
                      </label>
                    </div>
                    <p className="bz-hint">التاريخ تذكير لك بس، ما يوقف شي تلقائياً.</p>
                  </section>

                  <section className="bz-card">
                    <h3>التوثيق</h3>
                    {selected.verification_status === "verified" && (
                      <div className="bz-row">
                        <div>
                          <b className="bz-okt">موثّق ✓</b>
                          <small>متجره يستقبل طلبات حقيقية</small>
                        </div>
                      </div>
                    )}
                    {selected.verification_status !== "verified" && (
                      <>
                        <p className="bz-hint" style={{ marginTop: 0 }}>
                          {selected.verification_status === "pending"
                            ? "حساب جديد بانتظار مراجعتك. متجره ما يستقبل طلبات حقيقية لين توثّقه."
                            : "مرفوض. متجره متوقف عن استقبال الطلبات."}
                        </p>
                        <div className="bz-btns">
                          <button type="button" className="bz-btn" onClick={() => setVerification(selected, "verified")} disabled={busyId === selected.id}>
                            توثيق المطعم
                          </button>
                          {selected.verification_status === "pending" && (
                            <button type="button" className="bz-btn danger" onClick={() => setVerification(selected, "rejected")} disabled={busyId === selected.id}>
                              رفض
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </section>

                  <section className="bz-card">
                    <h3>بيانات دخول صاحب المطعم</h3>
                    <p className="bz-hint" style={{ marginTop: 0 }}>
                      البريد الحالي: <b dir="ltr">{statsLoading ? "..." : stats?.owner_email || "غير معروف"}</b>
                    </p>
                    <div className="bz-fields">
                      <label>
                        <span>بريد جديد</span>
                        <input className="bz-input" type="email" placeholder="اختياري" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} />
                      </label>
                      <label>
                        <span>كلمة مرور جديدة</span>
                        <input className="bz-input" type="text" placeholder="اختياري، ٦ أحرف أو أكثر" value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} />
                      </label>
                    </div>
                    {credentialsError && <p className="bz-err">{credentialsError}</p>}
                    {credentialsSuccess && <p className="bz-ok">تم التحديث ✓</p>}
                    <button type="button" className="bz-btn" onClick={updateOwnerCredentials} disabled={(!newOwnerEmail.trim() && !newOwnerPassword) || credentialsBusy}>
                      {credentialsBusy ? "جاري التحديث..." : "تحديث بيانات الدخول"}
                    </button>
                  </section>

                  <section className="bz-card bz-danger">
                    <h3>حالة الحساب</h3>
                    <div className="bz-row">
                      <div>
                        <b>{selected.is_active ? "الحساب شغّال" : "الحساب موقوف"}</b>
                        <small>
                          {selected.is_active
                            ? "الإيقاف يقفل اللوحة والكاشير والمطبخ لكل فريق المطعم."
                            : "فريق المطعم ما يقدر يدخل أي نظام."}
                        </small>
                      </div>
                      <button type="button" className={`bz-btn ${selected.is_active ? "danger" : ""}`} onClick={() => toggleSuspend(selected)} disabled={busyId === selected.id}>
                        {selected.is_active ? "إيقاف المطعم" : "إعادة التفعيل"}
                      </button>
                    </div>
                    <div className="bz-del">
                      {!showDeleteBox ? (
                        <button type="button" className="bz-link-danger" onClick={() => setShowDeleteBox(true)}>
                          حذف المطعم نهائياً
                        </button>
                      ) : (
                        <>
                          <p className="bz-hint" style={{ marginTop: 0 }}>
                            يحذف المطعم وكل بياناته (طلبات، منيو، موظفين، عملاء) نهائياً، وما يرجع. اكتب اسم المطعم بالضبط للتأكيد: <b>{selected.name}</b>
                          </p>
                          <input className="bz-input" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={selected.name} />
                          <div className="bz-btns">
                            <button type="button" className="bz-btn danger" onClick={deleteBusiness} disabled={deleteConfirmText !== selected.name || deleteBusy}>
                              {deleteBusy ? "جاري الحذف..." : "احذفه نهائياً"}
                            </button>
                            <button
                              type="button"
                              className="bz-btn ghost"
                              onClick={() => {
                                setShowDeleteBox(false);
                                setDeleteConfirmText("");
                              }}
                            >
                              تراجع
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                </>
              )}

              {bzTab === "design" && (
                <>
                  {designError && <p className="bz-err">{designError}</p>}
                  <section className="bz-card">
                    <h3>المتجر الإلكتروني</h3>
                    {(
                      [
                        ["logo_url", "الشعار", false],
                        ["online_banner_url", "بانر المتجر", true],
                      ] as const
                    ).map(([field, label, removable]) => (
                      <div key={field} className="bz-row">
                        <div className="bz-imgrow">
                          {stats?.[field] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={stats[field] as string} alt="" className="bz-thumb" />
                          ) : (
                            <span className="bz-thumb empty" />
                          )}
                          <b>{label}</b>
                        </div>
                        <div className="bz-btns">
                          <label className="bz-btn ghost">
                            {uploadingField === field ? "جاري الرفع..." : stats?.[field] ? "تغيير" : "رفع"}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={uploadingField === field}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadDesignFile(field, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {removable && stats?.[field] && (
                            <button type="button" className="bz-btn ghost" onClick={() => removeDesignImage(field)} disabled={designSaving === field}>
                              إزالة
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="bz-row">
                      <b>لون المتجر</b>
                      <input type="color" className="bz-color" value={stats?.online_theme_color || "#C4FF2B"} onChange={(e) => saveDesignField("online_theme_color", e.target.value)} disabled={designSaving === "online_theme_color"} />
                    </div>
                  </section>

                  <section className="bz-card">
                    <h3>بطاقة الولاء</h3>
                    <div className="bz-row">
                      <b>لون البطاقة</b>
                      <input type="color" className="bz-color" value={stats?.loyalty_accent_color || "#C4FF2B"} onChange={(e) => saveDesignField("loyalty_accent_color", e.target.value)} disabled={designSaving === "loyalty_accent_color"} />
                    </div>
                    <div className="bz-fields">
                      {(
                        [
                          ["loyalty_theme", "الطابع", LOYALTY_THEME_LABELS, "classic"],
                          ["loyalty_pattern_style", "نقشة الخلفية", LOYALTY_PATTERN_LABELS, "none"],
                          ["loyalty_icon_style", "الأيقونة", LOYALTY_ICON_LABELS, "generic"],
                        ] as const
                      ).map(([field, label, opts, def]) => (
                        <label key={field}>
                          <span>{label}</span>
                          <select className="bz-input" value={(stats?.[field] as string) || def} onChange={(e) => saveDesignField(field, e.target.value)} disabled={designSaving === field}>
                            {Object.entries(opts).map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    {(
                      [
                        ...(stats?.loyalty_icon_style === "custom" ? ([["loyalty_custom_icon_url", "أيقونة مخصصة", false]] as const) : []),
                        ["loyalty_logo_url", "الشعار", false],
                        ["loyalty_banner_url", "بانر البطاقة", true],
                      ] as const
                    ).map(([field, label, removable]) => (
                      <div key={field} className="bz-row">
                        <div className="bz-imgrow">
                          {stats?.[field] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={stats[field] as string} alt="" className="bz-thumb" />
                          ) : (
                            <span className="bz-thumb empty" />
                          )}
                          <b>{label}</b>
                        </div>
                        <div className="bz-btns">
                          <label className="bz-btn ghost">
                            {uploadingField === field ? "جاري الرفع..." : stats?.[field] ? "تغيير" : "رفع"}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={uploadingField === field}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadDesignFile(field, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {removable && stats?.[field] && (
                            <button type="button" className="bz-btn ghost" onClick={() => removeDesignImage(field)} disabled={designSaving === field}>
                              إزالة
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="bz-hint">نفس التصميم اللي يعدّله المطعم من إعداداته، وأي تعديل هنا يظهر له على طول.</p>
                  </section>
                </>
              )}
            </div>

            {(bzTab === "overview" || bzTab === "account") && (
              <footer className="bz-foot">
                <button type="button" className="bz-btn ghost" onClick={closeDrawer}>
                  إغلاق
                </button>
                <button type="button" className="bz-btn" onClick={saveDrawer} disabled={savingDrawer}>
                  {savingDrawer ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // colorScheme light (inherited): a dark-mode device would otherwise draw
  // native controls (select lists, date pickers) in dark-mode colours on
  // this light page — e.g. a contract's account list looking empty.
  page: { minHeight: "100dvh", background: "#F6F4EC", color: "#171717", colorScheme: "light", fontFamily: "'IBM Plex Sans Arabic', sans-serif", direction: "rtl" },
  wrap: { maxWidth: "1180px", margin: "0 auto", padding: "20px 16px 48px" },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" },
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    background: "radial-gradient(120% 140% at 100% 0%, #2a2a2a 0%, #171717 55%)",
    color: "#FBFAF5",
    borderRadius: "22px",
    padding: "20px 22px",
    marginBottom: "16px",
    boxShadow: "0 18px 40px rgba(23,23,23,0.18)",
  },
  heroTitle: { fontSize: "18px", fontWeight: 800, color: "#FBFAF5", lineHeight: 1.3 },
  title: { fontSize: "19px", fontWeight: 800 },
  subtitle: { fontSize: "12.5px", fontWeight: 600, color: "#8a8375", marginBottom: "18px" },
  loginCard: {
    maxWidth: "360px",
    margin: "80px auto",
    background: "#fff",
    borderRadius: "20px",
    padding: "30px 24px",
    boxShadow: "0 18px 40px rgba(23,23,23,0.10)",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
  },
  input: {
    width: "100%",
    background: "#FBFAF5",
    border: "1px solid rgba(23,23,23,0.1)",
    borderRadius: "10px",
    padding: "11px 13px",
    // 16px avoids iOS Safari's auto-zoom-on-focus for text inputs under
    // that size — the same bug that broke the WhatsApp reply box on mobile.
    fontSize: "16px",
    fontWeight: 600,
    color: "#171717",
    fontFamily: "inherit",
    marginTop: "10px",
  },
  textarea: {
    width: "100%",
    background: "#FBFAF5",
    border: "1px solid rgba(23,23,23,0.1)",
    borderRadius: "10px",
    padding: "11px 13px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#171717",
    fontFamily: "inherit",
    marginTop: "10px",
    resize: "vertical",
  },
  error: { fontSize: "11.5px", fontWeight: 700, color: "#B0402C", marginTop: "10px" },
  btn: { marginTop: "18px", padding: "13px", borderRadius: "12px", background: "#171717", color: "#C4FF2B", fontWeight: 800, fontSize: "13px", border: "none", cursor: "pointer", width: "100%" },
  logoutBtn: { padding: "9px 15px", borderRadius: "999px", background: "rgba(251,250,245,0.08)", color: "#FBFAF5", fontWeight: 700, fontSize: "12px", border: "1px solid rgba(251,250,245,0.14)", cursor: "pointer", fontFamily: "inherit" },
  tabRow: {
    display: "flex",
    gap: "4px",
    marginBottom: "18px",
    background: "#fff",
    borderRadius: "999px",
    padding: "5px",
    overflowX: "auto",
    width: "fit-content",
    maxWidth: "100%",
    boxShadow: "0 1px 2px rgba(23,23,23,0.04), 0 8px 24px rgba(23,23,23,0.05)",
  },
  tabBtn: { padding: "9px 18px", borderRadius: "999px", border: "none", background: "transparent", color: "#6b6559", fontWeight: 700, fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" },
  tabBtnActive: { background: "#171717", color: "#C4FF2B" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "18px" },
  statCard: { background: "#fff", borderRadius: "18px", padding: "16px 18px", boxShadow: "0 1px 2px rgba(23,23,23,0.04), 0 8px 24px rgba(23,23,23,0.05)" },
  statValue: { fontSize: "26px", fontWeight: 800, fontFamily: "'IBM Plex Mono',monospace", marginTop: "6px", lineHeight: 1.1 },
  statLabel: { fontSize: "11.5px", fontWeight: 700, color: "#8a8375" },
  tableWrap: { background: "#fff", borderRadius: "20px", overflow: "auto", boxShadow: "0 1px 2px rgba(23,23,23,0.04), 0 8px 24px rgba(23,23,23,0.05)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" },
  th: { textAlign: "start", padding: "14px 16px", fontWeight: 700, color: "#8a8375", fontSize: "11px", background: "#FBFAF5", borderBottom: "1px solid rgba(23,23,23,0.06)", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid rgba(23,23,23,0.05)" },
  td: { padding: "14px 16px", verticalAlign: "middle", whiteSpace: "nowrap" },
  muted: { fontSize: "10.5px", color: "#8a8375", fontWeight: 600, marginTop: "2px" },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "12px",
    background: "#171717",
    color: "#C4FF2B",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: "16px",
    flexShrink: 0,
  },
  link: { color: "#7BAD0F", fontWeight: 700, textDecoration: "none", fontFamily: "'IBM Plex Mono',monospace", fontSize: "11.5px" },
  toggleBtn: { padding: "7px 14px", borderRadius: "999px", border: "none", fontWeight: 800, fontSize: "11px", cursor: "pointer" },
  detailBtn: { padding: "7px 14px", borderRadius: "999px", border: "1px solid rgba(23,23,23,0.15)", background: "transparent", color: "#171717", fontWeight: 700, fontSize: "11px", cursor: "pointer" },
  suspendedBadge: { fontSize: "9.5px", fontWeight: 800, color: "#B0402C", background: "#FBEDEA", borderRadius: "999px", padding: "2px 8px" },
  pendingBadge: { fontSize: "9.5px", fontWeight: 800, color: "#C9822C", background: "#FBF0DE", borderRadius: "999px", padding: "2px 8px" },
  overlay: { position: "fixed", inset: 0, background: "rgba(23,23,23,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50 },
  drawer: { width: "min(420px, 100%)", height: "100%", background: "#FBFAF5", overflowY: "auto", boxShadow: "-10px 0 30px rgba(23,23,23,0.15)" },
  drawerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: "1px solid rgba(23,23,23,0.08)",
    background: "#fff",
    position: "sticky",
    top: 0,
  },
  closeBtn: { background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#8a8375" },
  drawerBody: { padding: "20px" },
  section: { marginBottom: "22px" },
  sectionLabel: { fontSize: "12px", fontWeight: 800, marginBottom: "2px" },
  hint: { fontSize: "10.5px", color: "#8a8375", fontWeight: 600, marginTop: "6px", lineHeight: 1.6 },
  suspendBtn: { width: "100%", padding: "12px", borderRadius: "10px", border: "none", fontWeight: 800, fontSize: "12.5px", cursor: "pointer", marginTop: "8px" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" },
  statMini: { background: "#fff", borderRadius: "10px", padding: "10px", textAlign: "center" },
  statMiniValue: { fontSize: "15px", fontWeight: 800, fontFamily: "'IBM Plex Mono',monospace" },
  statMiniLabel: { fontSize: "10px", fontWeight: 700, color: "#8a8375", marginTop: "2px" },
  dangerZone: { marginTop: "28px", paddingTop: "18px", borderTop: "1px dashed rgba(176,64,44,0.3)" },
  moduleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", fontSize: "12.5px", fontWeight: 700 },
  designLabel: { fontSize: "11.5px", fontWeight: 700, color: "#8a8375", marginTop: "14px", marginBottom: "2px" },
  imageRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  imagePreview: { width: "48px", height: "48px", borderRadius: "8px", objectFit: "cover", background: "#fff", border: "1px solid rgba(23,23,23,0.08)" },
  fileBtn: { padding: "8px 14px", borderRadius: "999px", background: "#EDEADF", color: "#171717", fontWeight: 700, fontSize: "11px", cursor: "pointer" },
  colorInput: { width: "64px", height: "38px", padding: "2px", border: "1px solid rgba(23,23,23,0.1)", borderRadius: "8px", cursor: "pointer" },
  dangerLinkBtn: { background: "none", border: "none", color: "#B0402C", fontWeight: 700, fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 },
};
