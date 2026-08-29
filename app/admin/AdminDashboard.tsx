"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import WhatsAppAdminPanel from "./WhatsAppAdminPanel";
import UsagePanel from "./UsagePanel";
import AuditLogPanel from "./AuditLogPanel";

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

export default function AdminDashboard() {
  const [sb] = useState(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
  const [session, setSession] = useState<{ email: string; token: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
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

  const [activeTab, setActiveTab] = useState<"businesses" | "whatsapp" | "usage" | "audit">("businesses");
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
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: aalData } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
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
      setCheckingSession(false);
    });
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

  const selected = useMemo(() => businesses?.find((b) => b.id === selectedId) || null, [businesses, selectedId]);

  function openDrawer(b: Business) {
    setSelectedId(b.id);
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

  const filtered = (businesses || []).filter((b) => !search.trim() || b.name.includes(search.trim()) || (b.owner_name || "").includes(search.trim()));
  const totalCount = businesses?.length ?? 0;
  const subscribedCount = businesses?.filter((b) => b.online_subscribed).length ?? 0;
  const suspendedCount = businesses?.filter((b) => !b.is_active).length ?? 0;
  const nearingEndCount =
    businesses?.filter((b) => !b.online_subscribed && b.online_order_free_limit > 0 && b.online_order_free_count / b.online_order_free_limit >= 0.8).length ?? 0;
  const pendingReviewCount = businesses?.filter((b) => b.verification_status === "pending").length ?? 0;

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>لوحة إدارة ركين</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {pushError && <span style={{ color: "#B0402C", fontSize: "12px", fontWeight: 600 }}>{pushError}</span>}
            <button
              style={{ ...styles.logoutBtn, ...(pushEnabled ? { background: "#E4F3D1", color: "#4C7A0A" } : {}) }}
              onClick={enableAdminPushNotifications}
              disabled={pushBusy || pushEnabled}
            >
              {pushEnabled ? "✓ الإشعارات مفعّلة" : pushBusy ? "جارٍ التفعيل..." : "فعّل إشعارات الجوال"}
            </button>
            <button
              style={styles.logoutBtn}
              onClick={() => {
                setShowPwForm((v) => !v);
                setPwError(null);
                setPwSuccess(false);
              }}
            >
              تغيير كلمة المرور
            </button>
            <button
              style={styles.logoutBtn}
              onClick={() => {
                sb.auth.signOut();
                setSession(null);
                setBusinesses(null);
              }}
            >
              تسجيل خروج
            </button>
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

        <div style={styles.tabRow}>
          <button style={{ ...styles.tabBtn, ...(activeTab === "businesses" ? styles.tabBtnActive : {}) }} onClick={() => setActiveTab("businesses")}>
            المطاعم
          </button>
          <button style={{ ...styles.tabBtn, ...(activeTab === "whatsapp" ? styles.tabBtnActive : {}) }} onClick={() => setActiveTab("whatsapp")}>
            واتساب
          </button>
          <button style={{ ...styles.tabBtn, ...(activeTab === "usage" ? styles.tabBtnActive : {}) }} onClick={() => setActiveTab("usage")}>
            استهلاك البنية التحتية
          </button>
          <button style={{ ...styles.tabBtn, ...(activeTab === "audit" ? styles.tabBtnActive : {}) }} onClick={() => setActiveTab("audit")}>
            سجل التدقيق
          </button>
        </div>

        {activeTab === "whatsapp" && <WhatsAppAdminPanel token={session.token} />}
        {activeTab === "usage" && <UsagePanel token={session.token} />}
        {activeTab === "audit" && <AuditLogPanel token={session.token} />}

        {activeTab === "businesses" && (
        <>
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{totalCount}</div>
            <div style={styles.statLabel}>إجمالي المطاعم</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#7BAD0F" }}>{subscribedCount}</div>
            <div style={styles.statLabel}>مشتركين</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: nearingEndCount > 0 ? "#B0402C" : "inherit" }}>{nearingEndCount}</div>
            <div style={styles.statLabel}>قريبين من نهاية التجربة</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: pendingReviewCount > 0 ? "#C9822C" : "inherit" }}>{pendingReviewCount}</div>
            <div style={styles.statLabel}>بانتظار التوثيق</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: suspendedCount > 0 ? "#B0402C" : "inherit" }}>{suspendedCount}</div>
            <div style={styles.statLabel}>موقوفين</div>
          </div>
        </div>

        <input style={{ ...styles.input, maxWidth: "320px", marginBottom: "16px" }} placeholder="ابحث باسم المطعم أو المالك..." value={search} onChange={(e) => setSearch(e.target.value)} />

        {loadError && <p style={styles.error}>{loadError}</p>}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>المطعم</th>
                <th style={styles.th}>المالك</th>
                <th style={styles.th}>الفترة التجريبية</th>
                <th style={styles.th}>الاشتراك</th>
                <th style={styles.th}>المتجر مفعّل</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} style={{ ...styles.tr, opacity: b.is_active ? 1 : 0.55 }}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                      {b.name}
                      {!b.is_active && <span style={styles.suspendedBadge}>موقوف</span>}
                      {b.verification_status === "pending" && <span style={styles.pendingBadge}>قيد المراجعة</span>}
                      {b.verification_status === "rejected" && <span style={styles.suspendedBadge}>مرفوض</span>}
                      {!RESTAURANT_LIKE_TYPES.includes(b.business_type) && (
                        <span style={styles.pendingBadge}>{BUSINESS_TYPE_LABELS[b.business_type]} — قطاع جديد</span>
                      )}
                    </div>
                    <div style={styles.muted}>
                      #{b.id} — {new Date(b.created_at).toLocaleDateString("ar-SA")}
                    </div>
                  </td>
                  <td style={styles.td}>{b.owner_name || "—"}</td>
                  <td style={styles.td}>
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
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.toggleBtn, background: b.online_subscribed ? "#7BAD0F" : "#EDEADF", color: b.online_subscribed ? "#fff" : "#171717" }}
                      onClick={() => toggle(b, "online_subscribed")}
                      disabled={busyId === b.id}
                    >
                      {b.online_subscribed ? "مشترك ✓" : "غير مشترك"}
                    </button>
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.toggleBtn, background: b.online_ordering_enabled ? "#7BAD0F" : "#B0402C", color: "#fff" }}
                      onClick={() => toggle(b, "online_ordering_enabled")}
                      disabled={busyId === b.id}
                    >
                      {b.online_ordering_enabled ? "مفعّل" : "موقوف"}
                    </button>
                  </td>
                  <td style={styles.td}>
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

      {selected && draft && (
        <div style={styles.overlay} onClick={closeDrawer}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h2 style={{ fontSize: "16px", fontWeight: 800 }}>{selected.name}</h2>
              <button style={styles.closeBtn} onClick={closeDrawer}>
                ✕
              </button>
            </div>
            <div style={styles.drawerBody}>
              <div style={styles.section}>
                <div style={styles.sectionLabel}>الاستخدام الفعلي</div>
                {statsLoading ? (
                  <p style={styles.hint}>جاري التحميل...</p>
                ) : stats ? (
                  <div style={styles.statsGrid}>
                    <div style={styles.statMini}>
                      <div style={styles.statMiniValue}>{stats.orders_count}</div>
                      <div style={styles.statMiniLabel}>إجمالي الطلبات</div>
                    </div>
                    <div style={styles.statMini}>
                      <div style={styles.statMiniValue}>{formatRelative(stats.last_order_at)}</div>
                      <div style={styles.statMiniLabel}>آخر طلب</div>
                    </div>
                    <div style={styles.statMini}>
                      <div style={styles.statMiniValue}>
                        {stats.branch_count}/{selected.branch_limit}
                      </div>
                      <div style={styles.statMiniLabel}>الفروع</div>
                    </div>
                    <div style={styles.statMini}>
                      <div style={styles.statMiniValue}>
                        {stats.staff_count}/{selected.included_seats}
                      </div>
                      <div style={styles.statMiniLabel}>الموظفين</div>
                    </div>
                  </div>
                ) : (
                  <p style={styles.hint}>تعذر تحميل الإحصائيات</p>
                )}
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>الوحدات المفعّلة</div>
                <div style={styles.moduleRow}>
                  <span>شاشة المطبخ</span>
                  <button
                    style={{ ...styles.toggleBtn, background: selected.kitchen_display_enabled ? "#7BAD0F" : "#EDEADF", color: selected.kitchen_display_enabled ? "#fff" : "#171717" }}
                    onClick={() => toggle(selected, "kitchen_display_enabled")}
                    disabled={busyId === selected.id}
                  >
                    {selected.kitchen_display_enabled ? "مفعّلة ✓" : "غير مفعّلة"}
                  </button>
                </div>
                <div style={styles.moduleRow}>
                  <span>المخزون والتكاليف</span>
                  <button
                    style={{ ...styles.toggleBtn, background: selected.inventory_enabled ? "#7BAD0F" : "#EDEADF", color: selected.inventory_enabled ? "#fff" : "#171717" }}
                    onClick={() => toggle(selected, "inventory_enabled")}
                    disabled={busyId === selected.id}
                  >
                    {selected.inventory_enabled ? "مفعّلة ✓" : "غير مفعّلة"}
                  </button>
                </div>
                <div style={styles.moduleRow}>
                  <span>نظام الولاء</span>
                  <button
                    style={{ ...styles.toggleBtn, background: selected.loyalty_enabled ? "#7BAD0F" : "#EDEADF", color: selected.loyalty_enabled ? "#fff" : "#171717" }}
                    onClick={() => toggle(selected, "loyalty_enabled")}
                    disabled={busyId === selected.id}
                  >
                    {selected.loyalty_enabled ? "مفعّل ✓" : "غير مفعّل"}
                  </button>
                </div>
                <p style={styles.hint}>
                  شاشة المطبخ والمخزون تُفعّل من ركين فقط. الولاء المطعم نفسه يقدر يشغّله من إعداداته أيضاً — هذا مفتاح احتياطي لك.
                </p>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>تصميم المتجر الإلكتروني</div>
                {designError && <p style={styles.error}>{designError}</p>}

                <p style={styles.designLabel}>الشعار</p>
                <div style={styles.imageRow}>
                  {stats?.logo_url && <img src={stats.logo_url} alt="" style={styles.imagePreview} />}
                  <label style={styles.fileBtn}>
                    {uploadingField === "logo_url" ? "جاري الرفع..." : "رفع شعار"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingField === "logo_url"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDesignFile("logo_url", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                <p style={styles.designLabel}>بانر المتجر</p>
                <div style={styles.imageRow}>
                  {stats?.online_banner_url && <img src={stats.online_banner_url} alt="" style={styles.imagePreview} />}
                  <label style={styles.fileBtn}>
                    {uploadingField === "online_banner_url" ? "جاري الرفع..." : "رفع بانر"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingField === "online_banner_url"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDesignFile("online_banner_url", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {stats?.online_banner_url && (
                    <button style={styles.detailBtn} onClick={() => removeDesignImage("online_banner_url")} disabled={designSaving === "online_banner_url"}>
                      إزالة
                    </button>
                  )}
                </div>

                <p style={styles.designLabel}>لون المتجر</p>
                <input
                  type="color"
                  style={styles.colorInput}
                  value={stats?.online_theme_color || "#C4FF2B"}
                  onChange={(e) => saveDesignField("online_theme_color", e.target.value)}
                  disabled={designSaving === "online_theme_color"}
                />
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>تصميم بطاقة الولاء</div>

                <p style={styles.designLabel}>لون البطاقة</p>
                <input
                  type="color"
                  style={styles.colorInput}
                  value={stats?.loyalty_accent_color || "#C4FF2B"}
                  onChange={(e) => saveDesignField("loyalty_accent_color", e.target.value)}
                  disabled={designSaving === "loyalty_accent_color"}
                />

                <p style={styles.designLabel}>الطابع</p>
                <select
                  style={styles.input}
                  value={stats?.loyalty_theme || "classic"}
                  onChange={(e) => saveDesignField("loyalty_theme", e.target.value)}
                  disabled={designSaving === "loyalty_theme"}
                >
                  {Object.entries(LOYALTY_THEME_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                <p style={styles.designLabel}>نقشة الخلفية</p>
                <select
                  style={styles.input}
                  value={stats?.loyalty_pattern_style || "none"}
                  onChange={(e) => saveDesignField("loyalty_pattern_style", e.target.value)}
                  disabled={designSaving === "loyalty_pattern_style"}
                >
                  {Object.entries(LOYALTY_PATTERN_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                <p style={styles.designLabel}>الأيقونة</p>
                <select
                  style={styles.input}
                  value={stats?.loyalty_icon_style || "generic"}
                  onChange={(e) => saveDesignField("loyalty_icon_style", e.target.value)}
                  disabled={designSaving === "loyalty_icon_style"}
                >
                  {Object.entries(LOYALTY_ICON_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                {stats?.loyalty_icon_style === "custom" && (
                  <>
                    <p style={styles.designLabel}>أيقونة مخصصة</p>
                    <div style={styles.imageRow}>
                      {stats?.loyalty_custom_icon_url && <img src={stats.loyalty_custom_icon_url} alt="" style={styles.imagePreview} />}
                      <label style={styles.fileBtn}>
                        {uploadingField === "loyalty_custom_icon_url" ? "جاري الرفع..." : "رفع أيقونة"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          disabled={uploadingField === "loyalty_custom_icon_url"}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadDesignFile("loyalty_custom_icon_url", f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}

                <p style={styles.designLabel}>الشعار</p>
                <div style={styles.imageRow}>
                  {stats?.loyalty_logo_url && <img src={stats.loyalty_logo_url} alt="" style={styles.imagePreview} />}
                  <label style={styles.fileBtn}>
                    {uploadingField === "loyalty_logo_url" ? "جاري الرفع..." : "رفع شعار"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingField === "loyalty_logo_url"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDesignFile("loyalty_logo_url", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                <p style={styles.designLabel}>بانر البطاقة</p>
                <div style={styles.imageRow}>
                  {stats?.loyalty_banner_url && <img src={stats.loyalty_banner_url} alt="" style={styles.imagePreview} />}
                  <label style={styles.fileBtn}>
                    {uploadingField === "loyalty_banner_url" ? "جاري الرفع..." : "رفع بانر"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingField === "loyalty_banner_url"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadDesignFile("loyalty_banner_url", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {stats?.loyalty_banner_url && (
                    <button style={styles.detailBtn} onClick={() => removeDesignImage("loyalty_banner_url")} disabled={designSaving === "loyalty_banner_url"}>
                      إزالة
                    </button>
                  )}
                </div>
                <p style={styles.hint}>هذي نفس بيانات التصميم اللي المطعم يعدلها من إعداداته — أي تعديل هنا يظهر له مباشرة.</p>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>بيانات دخول صاحب المطعم</div>
                <p style={styles.hint}>البريد الحالي: {statsLoading ? "..." : stats?.owner_email || "غير معروف"}</p>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="بريد إلكتروني جديد (اختياري)"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                />
                <input
                  style={styles.input}
                  type="text"
                  placeholder="كلمة مرور جديدة (اختياري، ٦ أحرف على الأقل)"
                  value={newOwnerPassword}
                  onChange={(e) => setNewOwnerPassword(e.target.value)}
                />
                {credentialsError && <p style={styles.error}>{credentialsError}</p>}
                {credentialsSuccess && <p style={{ ...styles.hint, color: "#7BAD0F", fontWeight: 700 }}>تم التحديث بنجاح ✓</p>}
                <button
                  style={{
                    ...styles.suspendBtn,
                    background: "#171717",
                    color: "#C4FF2B",
                    opacity: (newOwnerEmail.trim() || newOwnerPassword) && !credentialsBusy ? 1 : 0.5,
                  }}
                  onClick={updateOwnerCredentials}
                  disabled={(!newOwnerEmail.trim() && !newOwnerPassword) || credentialsBusy}
                >
                  {credentialsBusy ? "جاري التحديث..." : "تحديث بيانات الدخول"}
                </button>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>حالة التوثيق</div>
                {selected.verification_status === "pending" && (
                  <>
                    <p style={{ ...styles.hint, color: "#C9822C", fontWeight: 700, marginTop: 0 }}>
                      حساب جديد بانتظار مراجعتك — متجره الإلكتروني ما يقدر يستقبل طلبات حقيقية لين توثّقه.
                    </p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                      <button
                        style={{ ...styles.suspendBtn, marginTop: 0, background: "#7BAD0F", color: "#fff" }}
                        onClick={() => setVerification(selected, "verified")}
                        disabled={busyId === selected.id}
                      >
                        توثيق المطعم
                      </button>
                      <button
                        style={{ ...styles.suspendBtn, marginTop: 0, background: "#FBEDEA", color: "#B0402C" }}
                        onClick={() => setVerification(selected, "rejected")}
                        disabled={busyId === selected.id}
                      >
                        رفض
                      </button>
                    </div>
                  </>
                )}
                {selected.verification_status === "verified" && (
                  <p style={{ ...styles.hint, color: "#4C7A0A", fontWeight: 700, marginTop: 0 }}>موثّق ✓</p>
                )}
                {selected.verification_status === "rejected" && (
                  <>
                    <p style={{ ...styles.hint, color: "#B0402C", fontWeight: 700, marginTop: 0 }}>مرفوض — متجره الإلكتروني متوقف عن استقبال طلبات.</p>
                    <button
                      style={{ ...styles.suspendBtn, background: "#7BAD0F", color: "#fff" }}
                      onClick={() => setVerification(selected, "verified")}
                      disabled={busyId === selected.id}
                    >
                      توثيق المطعم
                    </button>
                  </>
                )}
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>حالة الحساب</div>
                <button
                  style={{
                    ...styles.suspendBtn,
                    background: selected.is_active ? "#FBEDEA" : "#7BAD0F",
                    color: selected.is_active ? "#B0402C" : "#fff",
                  }}
                  onClick={() => toggleSuspend(selected)}
                  disabled={busyId === selected.id}
                >
                  {selected.is_active ? "إيقاف المطعم بالكامل" : "إعادة تفعيل المطعم"}
                </button>
                <p style={styles.hint}>
                  {selected.is_active
                    ? "الإيقاف يقفل الدخول للوحة التحكم، الكاشير، والمطبخ بالكامل لكل فريق المطعم — مو بس المتجر الإلكتروني."
                    : "المطعم موقوف حالياً — فريقه ما يقدر يدخل أي نظام."}
                </p>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>تاريخ انتهاء الاشتراك (اختياري)</div>
                <input
                  style={styles.input}
                  type="date"
                  value={draft.subscription_expires_at}
                  onChange={(e) => setDraft({ ...draft, subscription_expires_at: e.target.value })}
                />
                <p style={styles.hint}>تذكير لك فقط — ما يوقف شي تلقائياً. حدد التاريخ اللي المفروض تتواصل معه للتجديد.</p>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>حد الطلبات المجانية</div>
                <input
                  style={styles.input}
                  type="number"
                  min={0}
                  value={draft.online_order_free_limit}
                  onChange={(e) => setDraft({ ...draft, online_order_free_limit: e.target.value })}
                />
                <p style={styles.hint}>
                  استخدم {selected.online_order_free_count} إلى الآن. ارفع الرقم لمنح طلبات إضافية مجانية (مكافأة أو تمديد تجربة).
                </p>
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>حد الفروع</div>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={draft.branch_limit}
                  onChange={(e) => setDraft({ ...draft, branch_limit: e.target.value })}
                />
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>عدد مقاعد الموظفين</div>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={draft.included_seats}
                  onChange={(e) => setDraft({ ...draft, included_seats: e.target.value })}
                />
              </div>

              <div style={styles.section}>
                <div style={styles.sectionLabel}>ملاحظات إدارية (خاصة بك فقط)</div>
                <textarea
                  style={styles.textarea}
                  rows={4}
                  placeholder="مثال: قال راح يشترك الأسبوع الجاي..."
                  value={draft.admin_notes}
                  onChange={(e) => setDraft({ ...draft, admin_notes: e.target.value })}
                />
              </div>

              {drawerError && <p style={styles.error}>{drawerError}</p>}

              <button style={{ ...styles.btn, opacity: savingDrawer ? 0.6 : 1 }} onClick={saveDrawer} disabled={savingDrawer}>
                {savingDrawer ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>

              <div style={styles.dangerZone}>
                <div style={styles.sectionLabel}>منطقة خطر</div>
                {!showDeleteBox ? (
                  <button style={styles.dangerLinkBtn} onClick={() => setShowDeleteBox(true)}>
                    حذف المطعم نهائياً
                  </button>
                ) : (
                  <div>
                    <p style={styles.hint}>
                      هذا يحذف المطعم وكل بياناته (طلبات، منيو، موظفين، عملاء...) نهائياً — ما يرجع بعدها. اكتب اسم المطعم بالضبط
                      للتأكيد: <b>{selected.name}</b>
                    </p>
                    <input
                      style={styles.input}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={selected.name}
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <button
                        style={{
                          ...styles.suspendBtn,
                          marginTop: 0,
                          background: "#B0402C",
                          color: "#fff",
                          opacity: deleteConfirmText === selected.name && !deleteBusy ? 1 : 0.5,
                        }}
                        onClick={deleteBusiness}
                        disabled={deleteConfirmText !== selected.name || deleteBusy}
                      >
                        {deleteBusy ? "جاري الحذف..." : "تأكيد الحذف نهائياً"}
                      </button>
                      <button
                        style={{ ...styles.detailBtn, flex: "0 0 auto" }}
                        onClick={() => {
                          setShowDeleteBox(false);
                          setDeleteConfirmText("");
                        }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#FBFAF5", color: "#171717", fontFamily: "'IBM Plex Sans Arabic', sans-serif", direction: "rtl" },
  wrap: { maxWidth: "1100px", margin: "0 auto", padding: "32px 20px" },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" },
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
  logoutBtn: { padding: "9px 16px", borderRadius: "10px", background: "#EDEADF", color: "#171717", fontWeight: 700, fontSize: "12px", border: "none", cursor: "pointer" },
  tabRow: { display: "flex", gap: "8px", marginBottom: "20px" },
  tabBtn: { padding: "9px 18px", borderRadius: "999px", border: "1px solid rgba(23,23,23,0.12)", background: "#fff", color: "#171717", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" },
  tabBtnActive: { background: "#171717", color: "#C4FF2B", borderColor: "#171717" },
  statsRow: { display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" },
  statCard: { flex: "1 1 140px", background: "#fff", borderRadius: "14px", padding: "16px", textAlign: "center", boxShadow: "0 4px 14px rgba(23,23,23,0.06)" },
  statValue: { fontSize: "24px", fontWeight: 800, fontFamily: "'IBM Plex Mono',monospace" },
  statLabel: { fontSize: "11px", fontWeight: 700, color: "#8a8375", marginTop: "4px" },
  tableWrap: { background: "#fff", borderRadius: "16px", overflow: "auto", boxShadow: "0 4px 14px rgba(23,23,23,0.06)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" },
  th: { textAlign: "start", padding: "12px 14px", fontWeight: 700, color: "#8a8375", fontSize: "11px", borderBottom: "1px solid rgba(23,23,23,0.08)", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid rgba(23,23,23,0.06)" },
  td: { padding: "12px 14px", verticalAlign: "middle", whiteSpace: "nowrap" },
  muted: { fontSize: "10.5px", color: "#8a8375", fontWeight: 600, marginTop: "2px" },
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
