"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { OrderStatus } from "./page";

// Guest order tracking — no login, ever. The random tracking_token in the
// URL is the sole gate (mirrors the loyalty-card token pattern), and this
// polls the same way CardActions.tsx polls for a pending redemption request
// rather than using a Realtime subscription — a simpler, already-proven
// mechanism in this codebase that needs no extra anon-RLS-on-Realtime setup.
function inkColorFor(hex: string | null): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return "#16281B";
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#16281B" : "#FDFCF7";
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(s: string): string {
  return s.replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}
// Deliberately not using toLocaleTimeString/Intl here — this component is
// server-rendered on a Cloudflare Worker then hydrated in the customer's
// browser, and the two environments' bundled ICU data render 'ar-SA'
// differently (even with an explicit timeZone), which trips a React
// hydration mismatch (error #418). Riyadh has no DST (fixed UTC+3), so a
// plain UTC offset plus hand-rolled Arabic-Indic digits is fully
// environment-independent and guaranteed byte-identical everywhere.
function timeLabel(iso: string): string {
  const riyadh = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  let h = riyadh.getUTCHours();
  const m = riyadh.getUTCMinutes();
  const suffix = h >= 12 ? "م" : "ص";
  h = h % 12 || 12;
  return `${toArabicDigits(String(h).padStart(2, "0"))}:${toArabicDigits(String(m).padStart(2, "0"))} ${suffix}`;
}

// Every online order now requires an explicit cashier accept/reject before
// it's a real order — 'pending' is the new step-0 state, 'rejected' is a new
// terminal state distinct from 'cancelled'. Everything from 'completed'
// onward keeps the original 3-stage progress model (prepping -> ready).
type Stage =
  | { kind: "terminal"; emoji: string; title: string; body: string }
  | { kind: "awaiting_payment" }
  | { kind: "progress"; step: 0 | 1 | 2 };

function stageFor(order: OrderStatus): Stage {
  // Card checkout that hasn't been confirmed by Geidea's webhook yet — the
  // webhook is the sole writer of payment_status; this page's 3s poll
  // (get_order_status) just keeps checking until status flips to 'pending'
  // on its own, exactly like a cash online order from that point on.
  if (order.status === "awaiting_payment") return { kind: "awaiting_payment" };
  if (order.status === "rejected") {
    return {
      kind: "terminal",
      emoji: "✕",
      title: "تعذر قبول الطلب",
      body: order.rejection_reason ? `السبب: ${order.rejection_reason}` : "تواصل مع المطعم لمزيد من التفاصيل.",
    };
  }
  if (order.status === "cancelled") {
    return { kind: "terminal", emoji: "✕", title: "تم إلغاء الطلب", body: "تواصل مع المطعم لمزيد من التفاصيل." };
  }
  if (order.status === "refunded") {
    return { kind: "terminal", emoji: "↩", title: "تم استرجاع مبلغ الطلب", body: "راجع كشف حسابك البنكي خلال أيام قليلة." };
  }
  if (order.status === "pending") return { kind: "progress", step: 0 };
  // status === "completed" from here on
  if (order.ready_at) return { kind: "progress", step: 2 };
  return { kind: "progress", step: 1 };
}

function progressStepLabel(channel: OrderStatus["channel"], step: number): { emoji: string; label: string } {
  if (step === 0) return { emoji: "📥", label: "الطلب جاري استلامه من المطعم" };
  if (step === 1) return { emoji: "👨‍🍳", label: "طلبك قيد التجهيز" };
  return channel === "pickup" ? { emoji: "🎉", label: "جاهز للاستلام" } : { emoji: "🚴", label: "جاري توصيله" };
}

function progressBody(order: OrderStatus, step: 0 | 1 | 2): string {
  if (step === 0) return "بنراجع طلبك ونأكده خلال لحظات.";
  if (step === 1) {
    if (order.channel === "pickup" && order.scheduled_for) return `الوقت المتوقع ${timeLabel(order.scheduled_for)}`;
    return order.channel === "pickup" ? "بيتم تجهيز طلبك وإشعارك هنا فور ما يجهز." : "بيتم تجهيز طلبك وبعدها يخرج للتوصيل.";
  }
  return order.channel === "pickup" ? "تفضّل بزيارة الفرع لاستلام طلبك." : "المندوب في الطريق إليك الآن.";
}

function Stepper({ channel, step, accent, onAccent }: { channel: OrderStatus["channel"]; step: 0 | 1 | 2; accent: string; onAccent: string }) {
  const steps = [0, 1, 2].map((i) => progressStepLabel(channel, i));
  return (
    <div style={styles.stepperRow}>
      {steps.map((s, i) => {
        const state = i < step ? "done" : i === step ? "active" : "upcoming";
        return (
          <div key={i} style={styles.stepItem}>
            <div style={styles.stepCircleWrap}>
              {i > 0 && <div style={{ ...styles.stepLine, background: i <= step ? accent : "#E5E1D5" }} />}
              <div
                style={{
                  ...styles.stepCircle,
                  background: state === "upcoming" ? "#EDEADF" : accent,
                  color: state === "upcoming" ? "#8a8375" : onAccent,
                  ...(state === "active" ? styles.iconPulse : {}),
                }}
              >
                {state === "done" ? "✓" : s.emoji}
              </div>
            </div>
            <p style={{ ...styles.stepLabel, opacity: state === "upcoming" ? 0.45 : 1, fontWeight: state === "active" ? 800 : 600 }}>{s.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderStatusActions({ token, initial }: { token: string; initial: OrderStatus }) {
  const [order, setOrder] = useState<OrderStatus>(initial);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(initial.online_customer_note || "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState(false);

  const [sb] = useState(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(supabaseUrl, anonKey);
  });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const { data } = await sb.rpc("get_order_status", { p_token: token }).maybeSingle();
      if (!cancelled && data) setOrder(data as OrderStatus);
    };
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, sb]);

  async function saveNote() {
    setSavingNote(true);
    setNoteError(false);
    const { data, error } = await sb.rpc("update_order_note", { p_token: token, p_note: noteDraft });
    setSavingNote(false);
    if (error || !data) {
      setNoteError(true);
      return;
    }
    setOrder((o) => ({ ...o, online_customer_note: noteDraft.trim() || null }));
    setEditingNote(false);
  }

  const accent = order.theme_color || "#C7FF4D";
  const onAccent = inkColorFor(accent);
  const stage = stageFor(order);
  const canEditNote = order.status === "pending";

  return (
    <div style={styles.page}>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes os-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0.12);}50%{box-shadow:0 0 0 10px rgba(0,0,0,0);}}" }} />
      <div style={styles.header}>
        {order.business_logo_url ? (
          <img src={order.business_logo_url} alt="" style={styles.logoImg} />
        ) : (
          <div style={{ ...styles.logo, background: accent, color: onAccent }}>{order.business_name.trim().charAt(0)}</div>
        )}
        <div style={styles.brandName}>{order.business_name}</div>
      </div>

      <div style={styles.card}>
        {stage.kind === "terminal" ? (
          <>
            <div style={{ ...styles.iconCircle, background: accent }}>
              <span style={{ fontSize: 30 }}>{stage.emoji}</span>
            </div>
            <h1 style={styles.title}>{stage.title}</h1>
            {stage.body && <p style={styles.body}>{stage.body}</p>}
            {order.status === "rejected" && (
              <p style={styles.noChargeNote}>لم يتم خصم أي مبلغ — الدفع يكون فقط عند الاستلام أو التوصيل.</p>
            )}
          </>
        ) : stage.kind === "awaiting_payment" ? (
          <>
            <div style={{ ...styles.iconCircle, background: accent, ...styles.iconPulse }}>
              <span style={{ fontSize: 26 }}>💳</span>
            </div>
            <h1 style={styles.title}>بانتظار تأكيد الدفع</h1>
            <p style={styles.body}>إذا أتممت الدفع للتو، الصفحة بتحدث تلقائيًا خلال لحظات.</p>
          </>
        ) : (
          <>
            <Stepper channel={order.channel} step={stage.step} accent={accent} onAccent={onAccent} />
            <p style={styles.body}>{progressBody(order, stage.step)}</p>
          </>
        )}

        <div style={styles.metaRow}>
          <div style={styles.metaBlock}>
            <div style={styles.metaLabel}>رقم الطلب</div>
            <div style={styles.metaValue}>#{order.order_id}</div>
          </div>
          <div style={styles.metaDivider} />
          <div style={styles.metaBlock}>
            <div style={styles.metaLabel}>الإجمالي</div>
            <div style={styles.metaValue}>{Number(order.total).toFixed(2)} ر.س</div>
          </div>
        </div>
        <p style={styles.timeHint}>الطلب — {timeLabel(order.created_at)}</p>

        {order.items.length > 0 && (
          <div style={styles.detailsSection}>
            <div style={styles.detailsLabel}>تفاصيل الطلب</div>
            {order.items.map((it, i) => (
              <div key={i} style={styles.detailsRow}>
                <span style={styles.detailsItemText}>
                  {it.qty}× {it.name}
                  {it.note && <span style={styles.detailsItemNote}> — {it.note}</span>}
                </span>
                <span style={styles.detailsItemPrice}>{Number(it.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={styles.noteSection}>
          <div style={styles.detailsLabel}>ملاحظتك</div>
          {editingNote ? (
            <>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="أضف ملاحظة على طلبك..."
                style={styles.noteTextarea}
                rows={2}
              />
              {noteError && <p style={styles.noteError}>تعذر الحفظ — جرّب مرة ثانية.</p>}
              <div style={styles.noteBtnRow}>
                <button onClick={saveNote} disabled={savingNote} style={{ ...styles.noteSaveBtn, background: accent, color: onAccent }}>
                  {savingNote ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button
                  onClick={() => {
                    setEditingNote(false);
                    setNoteDraft(order.online_customer_note || "");
                    setNoteError(false);
                  }}
                  style={styles.noteCancelBtn}
                >
                  إلغاء
                </button>
              </div>
            </>
          ) : (
            <div style={styles.noteRow}>
              <p style={styles.noteText}>{order.online_customer_note || "لا توجد ملاحظة"}</p>
              {canEditNote && (
                <button onClick={() => setEditingNote(true)} style={styles.noteEditBtn}>
                  تعديل
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {order.contact_whatsapp && (
        <a href={whatsappUrl(order.contact_whatsapp, order.order_id)} target="_blank" rel="noopener noreferrer" style={styles.waBtn}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.4c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.6-.4z"/><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 20.2 12 8.2 8.2 0 0 1 12 20.2z"/></svg>
          <span>تواصل معنا عبر واتساب</span>
        </a>
      )}

      <p style={styles.poweredBy}>مدعوم من ركين</p>
    </div>
  );
}

function whatsappUrl(rawPhone: string, orderId: number): string {
  const digits = rawPhone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("966") ? digits : "966" + digits.replace(/^0/, "");
  const message = `مرحبًا، أتواصل بخصوص طلبي رقم #${orderId}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "#F7F5EF",
    color: "#18170F",
    fontFamily: "'Alexandria', sans-serif",
    direction: "rtl",
    padding: "calc(20px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    maxWidth: "420px",
    marginBottom: "22px",
  },
  logo: {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "14px",
    flexShrink: 0,
  },
  logoImg: { width: "34px", height: "34px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 },
  brandName: { fontWeight: 800, fontSize: "14px" },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "32px 24px 26px",
    textAlign: "center",
    boxShadow: "0 18px 40px rgba(30,24,10,0.10)",
  },
  iconCircle: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 18px",
  },
  iconPulse: { animation: "os-pulse 1.8s ease-in-out infinite" },
  title: { fontSize: "18px", fontWeight: 800, marginBottom: "8px", lineHeight: 1.4 },
  body: { fontSize: "12.5px", fontWeight: 600, color: "#8a8375", lineHeight: 1.7, marginBottom: "20px" },
  noChargeNote: { fontSize: "12px", fontWeight: 700, color: "#16281B", lineHeight: 1.7, marginTop: "-8px", marginBottom: "20px" },
  stepperRow: { display: "flex", alignItems: "flex-start", justifyContent: "center", gap: "4px", marginBottom: "10px" },
  stepItem: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0 },
  stepCircleWrap: { position: "relative", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  stepCircle: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "17px",
    flexShrink: 0,
    position: "relative",
    zIndex: 1,
  },
  // left:50% (not right) — in this RTL row, the "previous" step sits
  // physically to the right of the current one, so the line must extend
  // rightward from this item's center to reach it. Using right:50% instead
  // extends it leftward and off the edge past the last (leftmost) step.
  stepLine: { position: "absolute", top: "50%", left: "50%", width: "100%", height: "2px", transform: "translateY(-50%)", zIndex: 0 },
  stepLabel: { fontSize: "10px", lineHeight: 1.4, textAlign: "center", marginTop: "6px", padding: "0 2px" },
  metaRow: { display: "flex", alignItems: "center", background: "#F7F5EF", borderRadius: "16px", padding: "14px 0", marginTop: "10px" },
  metaBlock: { flex: 1 },
  metaDivider: { width: "1px", height: "28px", background: "rgba(24,20,10,0.1)" },
  metaLabel: { fontSize: "10.5px", fontWeight: 700, color: "#8a8375", marginBottom: "4px" },
  metaValue: { fontSize: "15px", fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" },
  timeHint: { fontSize: "10.5px", fontWeight: 600, color: "#8a8375", marginTop: "12px" },
  detailsSection: { textAlign: "start", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(24,20,10,0.08)" },
  detailsLabel: { fontSize: "10.5px", fontWeight: 700, color: "#8a8375", marginBottom: "8px" },
  detailsRow: { display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", fontWeight: 600, padding: "5px 0" },
  detailsItemText: { flex: 1 },
  detailsItemNote: { color: "#8a8375", fontWeight: 500 },
  detailsItemPrice: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, flexShrink: 0 },
  noteSection: { textAlign: "start", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(24,20,10,0.08)" },
  noteRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" },
  noteText: { fontSize: "12px", fontWeight: 600, color: "#3a3628", lineHeight: 1.6, flex: 1 },
  noteEditBtn: { fontSize: "11px", fontWeight: 700, color: "#16281B", background: "#F7F5EF", border: "none", borderRadius: "10px", padding: "6px 12px", flexShrink: 0, cursor: "pointer" },
  noteTextarea: {
    width: "100%",
    background: "#F7F5EF",
    border: "1px solid rgba(24,20,10,0.1)",
    borderRadius: "12px",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: "'Alexandria', sans-serif",
    color: "#18170F",
    resize: "vertical",
  },
  noteError: { fontSize: "10.5px", fontWeight: 700, color: "#B0402C", marginTop: "6px" },
  noteBtnRow: { display: "flex", gap: "8px", marginTop: "8px" },
  noteSaveBtn: { flex: 1, border: "none", borderRadius: "10px", padding: "9px", fontWeight: 800, fontSize: "11.5px", cursor: "pointer" },
  noteCancelBtn: { border: "none", borderRadius: "10px", padding: "9px 14px", fontWeight: 700, fontSize: "11.5px", background: "#F7F5EF", color: "#8a8375", cursor: "pointer" },
  waBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    maxWidth: "420px",
    marginTop: "14px",
    padding: "14px",
    borderRadius: "16px",
    background: "#25D366",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: "13.5px",
    textDecoration: "none",
  },
  poweredBy: { fontSize: "9.5px", fontWeight: 700, color: "#b8b2a3", marginTop: "22px" },
};
