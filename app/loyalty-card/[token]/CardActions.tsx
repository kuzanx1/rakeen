"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PendingRequest {
  id: number;
  businessName: string;
  expiresAt: string;
}

// Two small floating icon buttons in the corner, not a button stack below the
// card — the card fills the screen now, and "مشاركة" (share) was dropped
// entirely: once someone's saved the card as an app, sharing a link is a
// step backwards, not forwards.
export default function CardActions({ token }: { token: string }) {
  const [notifState, setNotifState] = useState<"idle" | "granted" | "denied" | "unsupported" | "loading">("idle");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [isIos] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isStandalone] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [responding, setResponding] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Polls for a redemption request the cashier started against this card —
  // this, not push, is the real mechanism: it works whether or not the
  // customer ever enabled notifications, as long as the card page is open.
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const sb = createClient(supabaseUrl, anonKey);
    let cancelled = false;
    const poll = async () => {
      const { data } = await sb.rpc("get_pending_loyalty_request", { p_token: token }).maybeSingle();
      if (cancelled) return;
      const row = data as { id: number; business_name: string; expires_at: string } | null;
      if (row) {
        setPending({ id: row.id, businessName: row.business_name, expiresAt: row.expires_at });
      } else {
        setPending((prev) => (prev ? null : prev));
      }
    };
    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(pending.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setPending(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pending]);

  async function respond(approve: boolean) {
    if (!pending || responding) return;
    setResponding(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const sb = createClient(supabaseUrl, anonKey);
      await sb.rpc("respond_loyalty_redemption_request", {
        p_token: token,
        p_request_id: pending.id,
        p_approve: approve,
      });
    } finally {
      setPending(null);
      setResponding(false);
    }
  }

  function flashHint(text: string) {
    setHint(text);
    setTimeout(() => setHint((h) => (h === text ? null : h)), 4500);
  }

  async function handleInstall() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    if (isIos) {
      flashHint('اضغط زر المشاركة بالمتصفح ← "إضافة إلى الشاشة الرئيسية"');
      return;
    }
    flashHint("افتح قائمة المتصفح واختر إضافة إلى الشاشة الرئيسية");
  }

  async function handleEnableNotifications() {
    if (notifState === "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifState("unsupported");
      flashHint(isIos && !isStandalone ? "احفظ البطاقة كتطبيق أول (الزر بجانبه) عشان تقدر تفعّل التنبيهات" : "المتصفح ما يدعم الإشعارات");
      return;
    }
    setNotifState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifState("denied");
        flashHint("ما وافقت على الإشعارات — تقدر تفعّلها من إعدادات المتصفح لاحقًا");
        return;
      }
      const reg = await navigator.serviceWorker.register("/loyalty-sw.js");
      await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const sb = createClient(supabaseUrl, anonKey);
      const subJson = sub.toJSON();
      await sb.rpc("subscribe_loyalty_push", {
        p_token: token,
        p_endpoint: subJson.endpoint,
        p_p256dh: subJson.keys!.p256dh,
        p_auth: subJson.keys!.auth,
      });
      setNotifState("granted");
      flashHint("✓ التنبيهات مفعّلة");
    } catch {
      setNotifState("unsupported");
      flashHint("تعذر تفعيل الإشعارات");
    }
  }

  return (
    <>
      <div style={styles.corner}>
        <button onClick={handleInstall} style={styles.iconBtn} aria-label="أضف للشاشة الرئيسية" title="أضف للشاشة الرئيسية">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FAFAF5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={handleEnableNotifications}
          style={{ ...styles.iconBtn, background: notifState === "granted" ? "#C4FF2B" : styles.iconBtn.background }}
          aria-label="فعّل الإشعارات"
          title="فعّل الإشعارات"
          disabled={notifState === "loading"}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill={notifState === "granted" ? "#171717" : "none"}
            stroke={notifState === "granted" ? "#171717" : "#FAFAF5"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>
      {hint && <div style={styles.hintToast}>{hint}</div>}
      {pending && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmCard}>
            <div style={styles.confirmTitle}>طلب دفع بنقاط الولاء</div>
            <div style={styles.confirmBody}>
              {pending.businessName} يطلب تأكيدك لاستبدال جزء من رصيدك — تأكد إنك فعلاً بالمطعم الحين قبل ما توافق.
            </div>
            <div style={styles.confirmTimer}>{secondsLeft} ثانية متبقية</div>
            <div style={styles.confirmActions}>
              <button onClick={() => respond(true)} disabled={responding} style={styles.confirmYes}>✅ تأكيد</button>
              <button onClick={() => respond(false)} disabled={responding} style={styles.confirmNo}>❌ إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const styles: Record<string, React.CSSProperties> = {
  corner: {
    // sits below the header band (logo/brand + tier chip row, then the
    // customer-name row) rather than overlapping it — a fixed top offset
    // tuned to that band's height, not the header's own flow, since these
    // buttons float above the page rather than sitting inside it
    position: "fixed",
    top: "calc(128px + env(safe-area-inset-top))",
    insetInlineEnd: "max(14px, env(safe-area-inset-right))",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: 20,
  },
  iconBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(23,23,23,0.35)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  hintToast: {
    position: "fixed",
    bottom: "max(18px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "88vw",
    background: "rgba(23,23,23,0.92)",
    color: "#FAFAF5",
    fontSize: "12px",
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: "999px",
    textAlign: "center",
    zIndex: 30,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  confirmOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,10,10,0.72)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: "20px",
  },
  confirmCard: {
    width: "100%",
    maxWidth: "340px",
    background: "#FAFAF5",
    borderRadius: "20px",
    padding: "26px 22px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  confirmTitle: {
    fontSize: "17px",
    fontWeight: 800,
    color: "#171717",
    marginBottom: "10px",
  },
  confirmBody: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#555",
    lineHeight: 1.6,
    marginBottom: "14px",
  },
  confirmTimer: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#999",
    marginBottom: "18px",
  },
  confirmActions: {
    display: "flex",
    gap: "10px",
  },
  confirmYes: {
    flex: 1,
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "#C4FF2B",
    color: "#171717",
    fontWeight: 800,
    fontSize: "14px",
    cursor: "pointer",
  },
  confirmNo: {
    flex: 1,
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "transparent",
    color: "#555",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
};
