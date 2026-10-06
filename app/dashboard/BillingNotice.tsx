"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// Owner-only banner on the dashboard for their Rakeen subscription contract
// (/api/billing): a contract waiting for their signature, a payment due
// within 7 days or late, a rejected receipt, or a receipt under review.
// "سداد" opens the bank details and a receipt upload; the platform admin
// confirms every payment by hand. Purely a reminder: nothing here (or in
// the API) locks the dashboard.

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
  to_sign: { contract_number: string; token: string } | null;
  payments: Payment[];
  bank: { name: string; iban: string; holder: string };
};

const C = { ink: "#171717", paper: "#FBFAF5", lime: "#C4FF2B", deep: "#7BAD0F", danger: "#B0402C", muted: "rgba(23,23,23,.6)" };
const GRACE_DAYS = 7;
const DISMISS_KEY = "rk-billing-dismissed";

function riyadhToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysUntil(isoDate: string): number {
  return Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(riyadhToday() + "T00:00:00Z")) / 86_400_000);
}
function sar(n: number) {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function days(n: number) {
  return n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوم`;
}

// What to say about one open payment, or null when it's not time yet.
function describe(p: Payment): { text: string; tone: "warn" | "late" | "info"; canPay: boolean } | null {
  const label = `الدفعة ${p.seq} (${sar(p.amount)})`;
  if (p.status === "submitted") return { text: `استلمنا إيصال ${label}، وهو تحت المراجعة.`, tone: "info", canPay: false };
  if (p.status === "rejected") return { text: `ما قبلنا إيصال ${label}${p.review_note ? `: ${p.review_note}` : ""}. ارفع إيصال جديد.`, tone: "late", canPay: true };
  const d = daysUntil(p.due_date);
  if (d > GRACE_DAYS) return null;
  if (d > 0) return { text: `${label} تستحق بعد ${days(d)}، بتاريخ ${fmtDate(p.due_date)}.`, tone: "warn", canPay: true };
  if (d === 0) return { text: `${label} مستحقة اليوم.`, tone: "warn", canPay: true };
  const late = -d;
  const left = GRACE_DAYS - late;
  return {
    text: left > 0 ? `${label} متأخرة ${days(late)}. باقي لك ${days(left)}، وإذا ما انسددت تتوقف لوحة التحكم.` : `${label} متأخرة ${days(late)}. سدّدها الحين عشان ما تتوقف لوحة التحكم.`,
    tone: "late",
    canPay: true,
  };
}

export default function BillingNotice() {
  const [token, setToken] = useState<string | null>(null);
  // Tagged with the token it was loaded for, so a different login never
  // sees the previous account's payments.
  const [loaded, setLoaded] = useState<{ token: string; billing: Billing } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
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
    const t = window.setInterval(load, 15 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

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
  const items = data.payments.map((p) => ({ p, d: describe(p) })).filter((x): x is { p: Payment; d: NonNullable<ReturnType<typeof describe>> } => !!x.d);
  if (!items.length && !data.to_sign) return null;
  // A late payment can't be dismissed; anything else can, for this session.
  const late = items.some((x) => x.d.tone === "late");
  if (dismissed && !late && !paying) return null;
  return (
    <>
      <div
        dir="rtl"
        style={{
          position: "fixed", top: 12, insetInline: 12, margin: "0 auto", maxWidth: 560, zIndex: 900,
          background: C.ink, color: C.paper, borderRadius: 16, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          borderInlineStart: `4px solid ${late ? C.danger : C.lime}`, fontSize: 13.5, lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 4, color: late ? "#ffb4a6" : C.lime }}>اشتراكك في ركين</div>
        {data.to_sign && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ flex: 1 }}>عقد اشتراكك ({data.to_sign.contract_number}) جاهز للتوقيع.</span>
            <a href={`/contract/${data.to_sign.token}`} target="_blank" rel="noreferrer" style={btn(C.lime, C.ink)}>افتح العقد ووقّع</a>
          </div>
        )}
        {items.map(({ p, d }) => (
          <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ flex: 1, minWidth: 200 }}>{d.text}</span>
            {d.canPay && (
              <button type="button" style={btn(C.lime, C.ink)} onClick={() => { setPaying(p); setFile(null); setMsg(null); }}>
                سداد
              </button>
            )}
          </div>
        ))}
        {!late ? (
          <button
            type="button"
            style={{ background: "none", border: "none", color: "rgba(251,250,245,.6)", font: "inherit", fontSize: 12, cursor: "pointer", padding: 0 }}
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {}
            }}
          >
            لاحقاً
          </button>
        ) : null}
      </div>

      {paying && (
        <div dir="rtl" onClick={() => !busy && setPaying(null)} style={{ position: "fixed", inset: 0, zIndex: 950, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: C.ink, borderRadius: 20, padding: 20, width: "100%", maxWidth: 420, fontSize: 14, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>سداد الدفعة {paying.seq}</div>
            <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 12 }}>عقد {paying.contract_number} · تستحق {fmtDate(paying.due_date)}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>{sar(paying.amount)}</div>

            <div style={{ background: C.ink, color: C.paper, borderRadius: 14, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
              <div style={{ color: "rgba(251,250,245,.6)" }}>حوّل المبلغ على حساب ركين</div>
              <div>{data.bank.name} · باسم {data.bank.holder}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <b style={{ color: C.lime, direction: "ltr", unicodeBidi: "isolate", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, flex: 1 }}>
                  {data.bank.iban.replace(/(.{4})/g, "$1 ").trim()}
                </b>
                <button
                  type="button"
                  style={btn(copied ? C.lime : "rgba(255,255,255,.12)", copied ? C.ink : C.paper)}
                  onClick={() => navigator.clipboard?.writeText(data.bank.iban).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
                >
                  {copied ? "انتسخ ✓" : "نسخ"}
                </button>
              </div>
            </div>

            <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>صورة إيصال التحويل</label>
            <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ width: "100%", marginBottom: 6 }} />
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>نراجع الإيصال ونأكد الدفعة من عندنا.</div>
            {msg && <div style={{ color: C.danger, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{msg}</div>}
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

function btn(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap", fontFamily: "inherit" };
}
