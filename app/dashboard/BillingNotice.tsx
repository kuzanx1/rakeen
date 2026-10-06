"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// The owner's subscription notice on the dashboard (/api/billing):
//   - a card pinned at the top of the home screen with a live countdown,
//     that stays until the admin confirms the payment (a receipt under
//     review keeps it, calmer, without the countdown);
//   - a full-page alert once per visit (closable; the home card stays);
//   - a full-page "account paused" screen when /admin suspended the
//     business (the dashboard can't load its data then anyway).
// The countdown is a reminder only: nothing here locks anything. Pausing
// is done by hand from /admin («إيقاف المطعم بالكامل»).

type Payment = {
  id: string;
  seq: number;
  amount: number;
  due_date: string;
  status: "due" | "submitted" | "rejected";
  review_note: string | null;
  contract_number: string;
};
type Billing = {
  suspended?: boolean;
  to_sign: { contract_number: string; token: string } | null;
  payments: Payment[];
  bank: { name: string; iban: string; holder: string };
};

const C = { ink: "#171717", paper: "#FBFAF5", lime: "#C4FF2B", deep: "#7BAD0F", danger: "#E5533D", muted: "rgba(251,250,245,.6)" };
const GRACE_DAYS = 7;
const NOTICE_DAYS = 7;
const DAY = 86_400_000;
const WHATSAPP = "966557015282";

// End of a Riyadh calendar day, as a timestamp.
function endOfDay(isoDate: string): number {
  return Date.parse(`${isoDate}T23:59:59+03:00`);
}
function sar(n: number) {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

type Stage = "upcoming" | "grace" | "expired" | "review" | "rejected";
type Focus = { p: Payment; stage: Stage; target: number | null };

// The one payment the notice is about: a rejected receipt first, then the
// earliest payment due within the notice window (or late), then a receipt
// under review. Null = nothing to say yet.
function pickFocus(payments: Payment[], now: number): Focus | null {
  const open = [...payments].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const rejected = open.find((p) => p.status === "rejected");
  if (rejected) return { p: rejected, stage: "rejected", target: endOfDay(rejected.due_date) + GRACE_DAYS * DAY };
  const due = open.find((p) => p.status === "due" && endOfDay(p.due_date) - now <= NOTICE_DAYS * DAY);
  if (due) {
    const dueEnd = endOfDay(due.due_date);
    const graceEnd = dueEnd + GRACE_DAYS * DAY;
    if (now < dueEnd) return { p: due, stage: "upcoming", target: dueEnd };
    if (now < graceEnd) return { p: due, stage: "grace", target: graceEnd };
    return { p: due, stage: "expired", target: null };
  }
  const review = open.find((p) => p.status === "submitted");
  return review ? { p: review, stage: "review", target: null } : null;
}

function headline(f: Focus): string {
  const what = `الدفعة ${f.p.seq} من اشتراكك في ركين`;
  switch (f.stage) {
    case "upcoming":
      return `${what} تستحق بتاريخ ${fmtDate(f.p.due_date)}`;
    case "grace":
      return `${what} متأخرة. إذا ما انسددت خلال المهلة تتوقف لوحة التحكم والكاشير`;
    case "expired":
      return `${what} متأخرة وانتهت المهلة. لوحة التحكم والكاشير معرّضة للإيقاف في أي وقت`;
    case "rejected":
      return `ما قبلنا إيصال ${what}${f.p.review_note ? `: ${f.p.review_note}` : ""}. ارفع إيصال جديد`;
    case "review":
      return `استلمنا إيصال ${what}، ونأكده لك بأقرب وقت`;
  }
}
function countdownLabel(stage: Stage): string {
  return stage === "upcoming" ? "باقي على موعد السداد" : "باقي على إيقاف اللوحة";
}

export default function BillingNotice() {
  const [token, setToken] = useState<string | null>(null);
  // Tagged with the token it was loaded for, so a different login never
  // sees the previous account's payments.
  const [loaded, setLoaded] = useState<{ token: string; billing: Billing } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [homeEl, setHomeEl] = useState<HTMLElement | null>(null);
  const [alertClosed, setAlertClosed] = useState<string | null>(() => {
    try {
      return typeof window !== "undefined" ? sessionStorage.getItem("rk-billing-alert") : null;
    } catch {
      return null;
    }
  });
  const [paying, setPaying] = useState<Payment | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The dashboard creates window.supabaseClient in its own effect; wait for
  // it, then follow the session (login, logout, token refresh).
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let tries = 0;
    const timer = window.setInterval(() => {
      const sb = window.supabaseClient;
      if (!sb && ++tries < 100) return;
      window.clearInterval(timer);
      if (!sb) return;
      sb.auth.getSession().then(({ data: d }: { data: { session: Session | null } }) => setToken(d.session?.access_token || null));
      const { data: sub } = sb.auth.onAuthStateChange((_e: AuthChangeEvent, session: Session | null) => setToken(session?.access_token || null));
      unsub = () => sub.subscription.unsubscribe();
    }, 300);
    return () => {
      window.clearInterval(timer);
      unsub?.();
    };
  }, []);

  const load = useCallback(() => {
    if (!token) return;
    fetch("/api/billing", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLoaded(d && !d.error ? { token, billing: d } : null))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

  // Live countdown.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Pin a slot at the top of the home screen. The dashboard script owns
  // that markup, so re-attach the slot if a re-render ever drops it.
  useEffect(() => {
    const ensure = () => {
      const home = document.getElementById("screen-home");
      if (!home) return;
      let slot = document.getElementById("rk-billing-home");
      if (!slot || !home.contains(slot)) {
        slot = document.createElement("div");
        slot.id = "rk-billing-home";
        home.prepend(slot);
      }
      setHomeEl((cur) => (cur === slot ? cur : slot));
    };
    const first = window.setTimeout(ensure, 0);
    const t = window.setInterval(ensure, 1500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  async function submit() {
    if (!paying || !file || !token) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("payment_id", paying.id);
      fd.append("file", file);
      const res = await fetch("/api/billing", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(d.error || "تعذر رفع الإيصال");
      setPaying(null);
      setFile(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  const data = loaded && loaded.token === token ? loaded.billing : null;
  if (!data) return null;

  const focus = pickFocus(data.payments, now);
  const payable = focus && focus.stage !== "review" ? focus.p : data.payments.find((p) => p.status !== "submitted") || null;
  const alertKey = focus ? `${focus.p.id}:${focus.stage}` : data.to_sign ? `sign:${data.to_sign.token}` : null;
  const showAlert = !data.suspended && !!alertKey && alertClosed !== alertKey && !paying && focus?.stage !== "review";

  const closeAlert = () => {
    setAlertClosed(alertKey);
    try {
      if (alertKey) sessionStorage.setItem("rk-billing-alert", alertKey);
    } catch {}
  };
  const openPay = (p: Payment) => {
    setPaying(p);
    setFile(null);
    setMsg(null);
  };

  const late = focus && (focus.stage === "grace" || focus.stage === "expired" || focus.stage === "rejected");
  const accent = late ? C.danger : C.lime;

  const signRow = data.to_sign && (
    <div style={{ ...row, marginTop: focus ? 12 : 0, paddingTop: focus ? 12 : 0, borderTop: focus ? "1px solid rgba(251,250,245,.1)" : "none" }}>
      <span style={{ flex: 1, minWidth: 180 }}>عقد اشتراكك ({data.to_sign.contract_number}) جاهز للتوقيع.</span>
      <a href={`/contract/${data.to_sign.token}`} target="_blank" rel="noreferrer" style={btn(C.lime, C.ink)}>افتح العقد ووقّع</a>
    </div>
  );

  // Shared body of the home card and the full-page alert.
  const body = (big: boolean) => (
    <>
      {focus && (
        <>
          <div style={{ fontSize: big ? 17 : 15, fontWeight: 800, lineHeight: 1.6 }}>{headline(focus)}</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <div style={{ color: C.muted, fontSize: 12 }}>المبلغ</div>
              <div style={{ fontWeight: 800, fontSize: big ? 24 : 20, fontFamily: "'IBM Plex Mono',monospace" }}>{sar(focus.p.amount)}</div>
            </div>
            {focus.target && <Countdown target={focus.target} now={now} label={countdownLabel(focus.stage)} accent={accent} big={big} />}
          </div>
          {focus.stage !== "review" && (
            <div style={{ ...row, marginTop: 14 }}>
              <button type="button" style={{ ...btn(accent, C.ink), padding: "11px 20px", fontSize: 14 }} onClick={() => openPay(focus.p)}>
                سداد ورفع الإيصال
              </button>
              <span style={{ color: C.muted, fontSize: 12 }}>
                {data.bank.name} · <span style={{ direction: "ltr", unicodeBidi: "isolate", fontFamily: "'IBM Plex Mono',monospace" }}>{data.bank.iban}</span>
              </span>
            </div>
          )}
        </>
      )}
      {signRow}
    </>
  );

  const hasCard = !!focus || !!data.to_sign;

  return (
    <>
      {hasCard &&
        homeEl &&
        createPortal(
          <div dir="rtl" style={{ ...card, borderInlineStart: `5px solid ${accent}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: accent, fontWeight: 800, fontSize: 12.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: accent, boxShadow: `0 0 0 4px ${accent}33` }} />
              اشتراكك في ركين
            </div>
            {body(false)}
          </div>,
          homeEl
        )}

      {showAlert && hasCard && (
        <div dir="rtl" style={overlay(940)}>
          <div style={{ ...card, maxWidth: 520, width: "100%", margin: 0, borderInlineStart: `5px solid ${accent}`, boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ color: accent, fontWeight: 800, fontSize: 13, flex: 1 }}>تنبيه اشتراكك في ركين</span>
              <button type="button" onClick={closeAlert} aria-label="إغلاق" style={{ ...btn("rgba(251,250,245,.1)", C.paper), padding: "6px 12px" }}>
                إغلاق
              </button>
            </div>
            {body(true)}
            <div style={{ color: C.muted, fontSize: 11.5, marginTop: 12 }}>تقدر تقفل هالتنبيه، والتذكير يبقى في الصفحة الرئيسية لين {focus ? "نأكد السداد" : "توقّع العقد"}.</div>
          </div>
        </div>
      )}

      {data.suspended && !paying && (
        <div dir="rtl" style={{ ...overlay(980), background: "rgba(10,10,10,.92)" }}>
          <div style={{ ...card, maxWidth: 520, width: "100%", margin: 0, borderInlineStart: `5px solid ${C.danger}`, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>حسابك موقوف مؤقتاً</div>
            <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, marginBottom: 16 }}>
              توقفت لوحة التحكم والكاشير بسبب اشتراك غير مسدد. سدّد وارفع الإيصال، ونرجّع الحساب بعد ما نأكد الدفعة.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {payable && (
                <button type="button" style={{ ...btn(C.lime, C.ink), padding: "11px 20px", fontSize: 14 }} onClick={() => openPay(payable)}>
                  سداد ورفع الإيصال
                </button>
              )}
              <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer" style={{ ...btn("rgba(251,250,245,.1)", C.paper), padding: "11px 20px", fontSize: 14 }}>
                تواصل معنا
              </a>
            </div>
          </div>
        </div>
      )}

      {paying && (
        <div dir="rtl" onClick={() => !busy && setPaying(null)} style={overlay(1000)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: C.ink, borderRadius: 22, padding: 22, width: "100%", maxWidth: 440, fontSize: 14, lineHeight: 1.7, colorScheme: "light" }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>سداد الدفعة {paying.seq}</div>
            <div style={{ color: "rgba(23,23,23,.6)", fontSize: 12.5, marginBottom: 12 }}>عقد {paying.contract_number} · تستحق {fmtDate(paying.due_date)}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12, fontFamily: "'IBM Plex Mono',monospace" }}>{sar(paying.amount)}</div>

            <div style={{ background: C.ink, color: C.paper, borderRadius: 16, padding: "14px 16px", marginBottom: 14, fontSize: 13 }}>
              <div style={{ color: C.muted, marginBottom: 4 }}>حوّل المبلغ على حساب ركين</div>
              <div style={kv}><span style={{ color: C.muted }}>البنك</span><b>{data.bank.name}</b></div>
              <div style={kv}><span style={{ color: C.muted }}>اسم صاحب الحساب</span><b>{data.bank.holder}</b></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <b style={{ color: C.lime, direction: "ltr", unicodeBidi: "isolate", fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, flex: 1 }}>
                  {data.bank.iban.replace(/(.{4})/g, "$1 ").trim()}
                </b>
                <button
                  type="button"
                  style={btn(copied ? C.lime : "rgba(255,255,255,.12)", copied ? C.ink : C.paper)}
                  onClick={() =>
                    navigator.clipboard?.writeText(data.bank.iban).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? "انتسخ ✓" : "نسخ الآيبان"}
                </button>
              </div>
            </div>

            <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>صورة إيصال التحويل</label>
            <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 6 }} />
            <div style={{ color: "rgba(23,23,23,.6)", fontSize: 12, marginBottom: 12 }}>الإيصال يوصلنا مباشرة، ونأكد الدفعة من عندنا.</div>
            {msg && <div style={{ color: "#B0402C", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={!file || busy} onClick={submit} style={{ ...btn(C.ink, C.lime), flex: 1, padding: "12px 16px", fontSize: 14, opacity: !file || busy ? 0.5 : 1 }}>
                {busy ? "جاري الرفع..." : "إرسال الإيصال"}
              </button>
              <button type="button" disabled={busy} onClick={() => setPaying(null)} style={{ ...btn("#EDEADF", C.ink), padding: "12px 16px", fontSize: 14 }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Countdown({ target, now, label, accent, big }: { target: number; now: number; label: string; accent: string; big: boolean }) {
  const left = Math.max(0, target - now);
  const parts: [number, string][] = [
    [Math.floor(left / DAY), "يوم"],
    [Math.floor((left % DAY) / 3_600_000), "ساعة"],
    [Math.floor((left % 3_600_000) / 60_000), "دقيقة"],
    [Math.floor((left % 60_000) / 1000), "ثانية"],
  ];
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, direction: "rtl" }}>
        {parts.map(([v, u]) => (
          <div key={u} style={{ background: "rgba(251,250,245,.07)", border: `1px solid ${accent}40`, borderRadius: 12, padding: big ? "8px 10px" : "6px 8px", minWidth: big ? 58 : 50, textAlign: "center" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, fontSize: big ? 22 : 18, color: accent, lineHeight: 1.2 }}>{String(v).padStart(2, "0")}</div>
            <div style={{ fontSize: 10.5, color: C.muted }}>{u}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "radial-gradient(120% 140% at 100% 0%, #2a2a2a 0%, #171717 60%)",
  color: C.paper,
  borderRadius: 20,
  padding: "18px 20px",
  margin: "0 0 18px",
  boxShadow: "0 14px 34px rgba(0,0,0,.18)",
  fontFamily: "inherit",
  lineHeight: 1.6,
};
const row: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const kv: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };

function overlay(z: number): React.CSSProperties {
  return { position: "fixed", inset: 0, zIndex: z, background: "rgba(0,0,0,.55)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, overflowY: "auto" };
}
function btn(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit", display: "inline-block" };
}
