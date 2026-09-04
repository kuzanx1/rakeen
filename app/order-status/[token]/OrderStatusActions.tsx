"use client";

import { useEffect, useRef, useState } from "react";
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

// Flat stroke icons for every stage/status marker on this page — replaces
// an earlier emoji-based version (📥/👨‍🍳/🎉/🚴/💳/✕/↩), which looked
// inconsistent next to the rest of the page's own vector icon language
// (WhatsApp/location pin below) and rendered as a different glyph per OS.
function iconProps(size: number) {
  return { viewBox: "0 0 24 24", width: size, height: size, fill: "none" as const, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}
function IconInbox({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}
function IconChef({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M4 13h16l-1.4 6.7a2 2 0 0 1-2 1.3H7.4a2 2 0 0 1-2-1.3L4 13Z" />
      <path d="M4 13a8 8 0 0 1 16 0" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="7.5" y1="3.2" x2="8.5" y2="5.5" />
      <line x1="16.5" y1="3.2" x2="15.5" y2="5.5" />
    </svg>
  );
}
function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconBike({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M12 17.5V14l-3-3 3.8-3.2L15 11h3" />
      <circle cx="15" cy="5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconX({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconUndo({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}
function IconCard({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <rect x="1" y="4" width="22" height="16" rx="2.5" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconCash({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <rect x="2" y="6" width="20" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconClock({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Every online order now requires an explicit cashier accept/reject before
// it's a real order — 'pending' is the new step-0 state, 'rejected' is a new
// terminal state distinct from 'cancelled'. Everything from 'completed'
// onward keeps the original 3-stage progress model (prepping -> ready).
type Stage =
  | { kind: "terminal"; icon: React.ReactNode; title: string; body: string }
  | { kind: "awaiting_payment" }
  | { kind: "progress"; step: 0 | 1 | 2 | 3 };

function stageFor(order: OrderStatus): Stage {
  // Card checkout that hasn't been confirmed by Geidea's webhook yet — the
  // webhook is the sole writer of payment_status; this page's 3s poll
  // (get_order_status) just keeps checking until status flips to 'pending'
  // on its own, exactly like a cash online order from that point on.
  if (order.status === "awaiting_payment") return { kind: "awaiting_payment" };
  if (order.status === "rejected") {
    return {
      kind: "terminal",
      icon: <IconX size={30} />,
      title: "تعذر قبول الطلب",
      body: order.rejection_reason ? `السبب: ${order.rejection_reason}` : "تواصل مع المطعم لمزيد من التفاصيل.",
    };
  }
  if (order.status === "cancelled") {
    return { kind: "terminal", icon: <IconX size={30} />, title: "تم إلغاء الطلب", body: "تواصل مع المطعم لمزيد من التفاصيل." };
  }
  if (order.status === "refunded") {
    return { kind: "terminal", icon: <IconUndo size={30} />, title: "تم استرجاع مبلغ الطلب", body: "راجع كشف حسابك البنكي خلال أيام قليلة." };
  }
  if (order.status === "pending") return { kind: "progress", step: 0 };
  // status === "completed" from here on. delivered_at is the real close of
  // the loop — a fully picked-up/delivered order shouldn't just sit forever
  // on the last progress step with nothing more to say.
  if (order.delivered_at) {
    return {
      kind: "terminal",
      icon: <IconCheck size={30} />,
      title: "تم تسليم طلبك بنجاح!",
      body: order.channel === "pickup" ? "نتمنى لك تجربة شهية، نورتنا وبالعافية عليك!" : "وصلك طلبك بالسلامة، نورتنا وبالعافية عليك!",
    };
  }
  if (order.channel === "delivery" && order.out_for_delivery_at) return { kind: "progress", step: 3 };
  if (order.ready_at) return { kind: "progress", step: 2 };
  return { kind: "progress", step: 1 };
}

// Delivery gets a real 4th step (rider actually left) — pickup and dine_in
// stop at 2 (ready), since "out for delivery" has no pickup equivalent.
function totalStepsFor(channel: OrderStatus["channel"]): number {
  return channel === "delivery" ? 4 : 3;
}

function progressStepLabel(channel: OrderStatus["channel"], step: number): { icon: React.ReactNode; label: string } {
  if (step === 0) return { icon: <IconInbox />, label: "الطلب جاري استلامه من المطعم" };
  if (step === 1) return { icon: <IconChef />, label: "طلبك قيد التجهيز" };
  if (step === 2) {
    return channel === "pickup" ? { icon: <IconCheck />, label: "جاهز للاستلام" } : { icon: <IconCheck />, label: "جاهز، بانتظار خروج المندوب" };
  }
  return { icon: <IconBike />, label: "المندوب في الطريق إليك" };
}

function progressBody(order: OrderStatus, step: 0 | 1 | 2 | 3): string {
  if (step === 0) return "بنراجع طلبك ونأكده خلال لحظات.";
  if (step === 1) {
    if (order.channel === "pickup" && order.scheduled_for) return `الوقت المتوقع ${timeLabel(order.scheduled_for)}`;
    return order.channel === "pickup" ? "بيتم تجهيز طلبك وإشعارك هنا فور ما يجهز." : "بيتم تجهيز طلبك وبعدها يخرج للتوصيل.";
  }
  if (step === 2) return order.channel === "pickup" ? "تفضّل بزيارة الفرع لاستلام طلبك." : "طلبك جاهز، بانتظار خروج المندوب للتوصيل.";
  return "المندوب في الطريق إليك الآن.";
}

// Ticks down to order.scheduled_for independently of the 3s status poll —
// the order flips to step 2 on its own once the auto-ready sweep (or the
// cashier) sets ready_at, this is purely the customer-facing "X:XX دقيقة"
// clock so waiting doesn't feel like nothing is happening.
function remainingLabel(scheduledFor: string, nowMs: number): string | null {
  const remainingMs = new Date(scheduledFor).getTime() - nowMs;
  if (remainingMs <= 0) return null;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function Stepper({ channel, step, accent, onAccent }: { channel: OrderStatus["channel"]; step: 0 | 1 | 2 | 3; accent: string; onAccent: string }) {
  const steps = Array.from({ length: totalStepsFor(channel) }, (_, i) => progressStepLabel(channel, i));
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
                {state === "done" ? <IconCheck /> : s.icon}
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

  // Separate, faster tick just for the countdown clock — the 3s poll above
  // is what actually advances the stage (via ready_at flipping), this only
  // redraws the "X:XX دقيقة" text every second in between.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const accent = order.theme_color || "#C7FF4D";
  const onAccent = inkColorFor(accent);
  const stage = stageFor(order);

  // Real reported feedback: a long tracking page with no way back to the
  // top once scrolled down. Physical right side, not left — the owner
  // flagged the left as awkward/in-the-way on this page.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > window.innerHeight * 0.5);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const receiptCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = receiptCanvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    drawReceiptCard(canvas, order, accent, onAccent, () => cancelled);
    // order_id is enough to key the redraw — items/total/customer_name never
    // change after an order is placed, only status/ready_at (already
    // reflected live elsewhere) do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      cancelled = true;
    };
  }, [order.order_id, accent, onAccent]);

  function saveReceiptImage() {
    const canvas = receiptCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.business_name}-طلب-${order.order_id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <div style={styles.page}>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes os-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0.12);}50%{box-shadow:0 0 0 10px rgba(0,0,0,0);}}@keyframes os-number-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.06);}}" }} />
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
            <div style={{ ...styles.iconCircle, background: accent, color: onAccent }}>
              {stage.icon}
            </div>
            <h1 style={styles.title}>{stage.title}</h1>
            {stage.body && <p style={styles.body}>{stage.body}</p>}
            {order.status === "rejected" && (
              <p style={styles.noChargeNote}>لم يتم خصم أي مبلغ — الدفع يكون فقط عند الاستلام أو التوصيل.</p>
            )}
          </>
        ) : stage.kind === "awaiting_payment" ? (
          <>
            <div style={{ ...styles.iconCircle, background: accent, color: onAccent, ...styles.iconPulse }}>
              <IconCard size={26} />
            </div>
            <h1 style={styles.title}>بانتظار تأكيد الدفع</h1>
            <p style={styles.body}>إذا أتممت الدفع للتو، الصفحة بتحدث تلقائيًا خلال لحظات.</p>
          </>
        ) : (
          <>
            <Stepper channel={order.channel} step={stage.step} accent={accent} onAccent={onAccent} />
            <p style={styles.body}>{progressBody(order, stage.step)}</p>
            {stage.step === 1 && order.channel === "pickup" && order.scheduled_for && (() => {
              const remaining = remainingLabel(order.scheduled_for, nowMs);
              return remaining ? (
                <div style={{ ...styles.prepTimer, background: `${accent}22`, borderColor: `${accent}55` }}>
                  <div style={{ ...styles.prepTimerIcon, background: accent, color: onAccent }}><IconClock size={17} /></div>
                  <div style={styles.prepTimerText}>
                    <div style={styles.prepTimerLabel}>جاري تجهيز طلبك</div>
                    <div style={{ ...styles.prepTimerClock, direction: "ltr", unicodeBidi: "isolate" }}>{remaining}</div>
                  </div>
                </div>
              ) : null;
            })()}
          </>
        )}

        <div style={styles.metaRow}>
          <div style={styles.metaBlock}>
            <div style={styles.metaLabel}>رقم الطلب</div>
            <div style={styles.metaValueBig}>#{order.order_id}</div>
          </div>
          <div style={styles.metaDivider} />
          <div style={styles.metaBlock}>
            <div style={styles.metaLabel}>الإجمالي</div>
            <div style={styles.metaValue}><RkMoney amount={Number(order.total)} /></div>
          </div>
        </div>
        <p style={styles.timeHint}>الطلب — {timeLabel(order.created_at)}</p>
        <div style={{ ...styles.paymentBadge, background: `${accent}22` }}>
          {order.payment_method === "card" ? <IconCard size={14} /> : <IconCash size={14} />}
          {paymentMethodLabel(order)}
        </div>

        {order.items.length > 0 && (
          <div style={styles.detailsSection}>
            <div style={styles.detailsLabel}>تفاصيل الطلب</div>
            {order.items.map((it, i) => (
              <div key={i} style={styles.detailsRow}>
                <span style={styles.detailsItemText}>
                  {it.qty}× {it.name}
                  {it.note && <span style={styles.detailsItemNote}> — {it.note}</span>}
                </span>
                <span style={styles.detailsItemPrice}><RkMoney amount={Number(it.line_total)} /></span>
              </div>
            ))}
          </div>
        )}

        <div style={styles.noteSection}>
          <div style={styles.detailsLabel}>ملاحظتك</div>
          <div style={styles.noteRow}>
            <p style={styles.noteText}>{order.online_customer_note || "لا توجد ملاحظة"}</p>
          </div>
        </div>

        {stage.kind !== "awaiting_payment" && (
          <div style={styles.receiptSection}>
            <div style={styles.detailsLabel}>فاتورة طلبك</div>
            <div style={styles.receiptCanvasWrap}>
              <canvas ref={receiptCanvasRef} style={styles.receiptCanvas} />
            </div>
            <p style={styles.receiptHint}>
              {order.channel === "pickup" ? "اعرض هذه الفاتورة للكاشير عند الاستلام" : "احتفظ بهذه الفاتورة كإثبات لطلبك"}
            </p>
            <button type="button" onClick={saveReceiptImage} style={{ ...styles.saveReceiptBtn, background: accent, color: onAccent }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>حفظ فاتورة الطلب</span>
            </button>
          </div>
        )}
      </div>

      {order.channel === "pickup" && (order.branch_lat != null || order.branch_address) && (() => {
        const mapQuery = order.branch_lat != null && order.branch_lng != null ? `${order.branch_lat},${order.branch_lng}` : order.branch_address || "";
        const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
        return (
          <div style={styles.mapCard}>
            <div style={styles.mapCardHead}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={accent} strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span style={styles.mapCardName}>{order.branch_name || "الفرع"}</span>
            </div>
            {order.branch_address && <div style={styles.mapCardAddress}>{order.branch_address}</div>}
            <iframe style={styles.mapCardFrame} src={embedSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <a href={mapsUrl(order.branch_lat, order.branch_lng, order.branch_address)} target="_blank" rel="noopener noreferrer" style={{ ...styles.mapCardLink, color: accent }}>
              فتح في خرائط جوجل ↗
            </a>
          </div>
        );
      })()}

      {order.contact_whatsapp && (
        <a href={whatsappUrl(order.contact_whatsapp, order.order_id)} target="_blank" rel="noopener noreferrer" style={styles.waBtn}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.5.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.4c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.6-.4z"/><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 20.2 12 8.2 8.2 0 0 1 12 20.2z"/></svg>
          <span>تواصل معنا عبر واتساب</span>
        </a>
      )}

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="رجوع لأعلى الصفحة"
          style={{ ...styles.backToTopBtn, background: accent, color: onAccent }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// "card" here always means paid-in-full through Geidea's hosted checkout —
// that page itself offers Apple Pay as one of its own payment options, but
// submit_online_order only ever stores 'cash' or 'card' (see its
// p_payment_method check), so there's no way to tell Apple Pay apart from
// a plain card charge at this layer. Labeling it as "card/Apple Pay" is
// accurate either way and tells the cashier what actually matters: this
// order is already paid, don't collect cash.
function paymentMethodLabel(order: OrderStatus): string {
  if (order.payment_method === "card") return "مدفوع إلكترونيًا (بطاقة/Apple Pay)";
  const channelLabel = order.channel === "pickup" ? "الاستلام" : order.channel === "delivery" ? "التوصيل" : "الطلب";
  return `الدفع نقدًا عند ${channelLabel}`;
}

function mapsUrl(lat: number | null, lng: number | null, address: string | null): string {
  const query = lat != null && lng != null ? `${lat},${lng}` : address || "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function whatsappUrl(rawPhone: string, orderId: number): string {
  const digits = rawPhone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("966") ? digits : "966" + digits.replace(/^0/, "");
  const message = `مرحبًا، أتواصل بخصوص طلبي رقم #${orderId}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

// A shareable "order confirmation card" image, drawn on <canvas> and offered
// as a PNG download — a real screen-capture isn't something a web page can
// trigger itself (no browser API lets a site screenshot its own tab without
// an explicit, visible user permission each time), so this is the practical
// substitute: same purpose (proof of the order, in the merchant's own
// branding, saved before the tab/page can get lost), no permission prompt.
// media.rakeenapp.com already sets access-control-allow-origin:* (see
// worker-entrypoint.js's serveMediaBucket), so the logo can be drawn into
// the canvas without tainting it for toBlob()/toDataURL().
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const RECEIPT_WIDTH = 680;
const RIYAL_CHAR = "⃁"; // U+20C1 — see the 'saudi_riyal' @font-face in page.tsx

// Draws a left-aligned amount as "12.34" then the real Saudi Riyal sign, as
// two separate fillText calls (a canvas font can't mix two font-families in
// one call) — same visual pairing as the rest of the app's rkMoney(), just
// done with 2D canvas draws instead of nested HTML spans.
function fillAmountWithRiyal(ctx: CanvasRenderingContext2D, amount: number, x: number, y: number, numberFont: string, riyalFontSize: number, color: string) {
  const text = amount.toFixed(2);
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.font = numberFont;
  ctx.fillText(text, x, y);
  const numberWidth = ctx.measureText(text).width;
  const riyalX = x + numberWidth + riyalFontSize * 0.25;
  // Real reported bug: this webfont's glyph renders mirrored compared to
  // the real symbol (checked against iOS's own rendering) — same fix as
  // .rk-riyal's CSS transform:scaleX(-1), but canvas has no CSS transform
  // to reach for, so mirror it manually via a flipped coordinate space
  // instead (translate to the anchor, scale(-1,1), draw with textAlign
  // flipped to "right" so it still reads left-to-right from that anchor).
  ctx.save();
  ctx.translate(riyalX, y);
  ctx.scale(-1, 1);
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.font = `700 ${riyalFontSize}px 'saudi_riyal'`;
  ctx.fillText(RIYAL_CHAR, 0, 0);
  ctx.restore();
}

// HTML equivalent of fillAmountWithRiyal, for the plain page text (not the
// canvas receipt) — same real Saudi Riyal sign instead of "ر.س" text.
function RkMoney({ amount }: { amount: number }) {
  const [whole, frac] = amount.toFixed(2).split(".");
  return (
    <span style={{ direction: "ltr", unicodeBidi: "isolate", display: "inline-flex", alignItems: "baseline", gap: "3px", fontFamily: "'IBM Plex Mono', monospace" }}>
      {whole}
      <span style={{ fontSize: "0.72em", opacity: 0.82 }}>.{frac}</span>
      {/* Real reported bug: this webfont's glyph renders mirrored compared
          to the real symbol (checked against iOS's own rendering) — flip
          it back on display, same fix as rakeen-dashboard.css/rakeen-pos.css's .rk-riyal. */}
      <span style={{ fontFamily: "'saudi_riyal', sans-serif", display: "inline-block", transform: "scaleX(-1)" }}>{RIYAL_CHAR}</span>
    </span>
  );
}

// ============ ZATCA Simplified Tax Invoice QR (Phase 1) ============
// Identical TLV encoding to zatcaQrBase64 in public/pos/rakeen-pos.js — kept
// in sync deliberately, not shared, since one is a vanilla-JS bundle and
// this is a bundled TS module. Only drawn when the business has an actual
// VAT number on file (see loadReceiptQr below) — a QR encoding an empty
// VAT number would be actively wrong, not just incomplete, exactly like the
// POS's own reasoning.
function zatcaQrBase64(sellerName: string, vatNumber: string, timestampISO: string, totalWithVat: string, vatAmount: string): string {
  const enc = new TextEncoder();
  const tlv = (tag: number, value: string) => {
    const bytes = enc.encode(String(value));
    const out = new Uint8Array(2 + bytes.length);
    out[0] = tag; out[1] = bytes.length; out.set(bytes, 2);
    return out;
  };
  const fields = [tlv(1, sellerName), tlv(2, vatNumber), tlv(3, timestampISO), tlv(4, totalWithVat), tlv(5, vatAmount)];
  const totalLen = fields.reduce((s, f) => s + f.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach((f) => { combined.set(f, offset); offset += f.length; });
  let binary = "";
  combined.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function loadReceiptQr(order: OrderStatus): Promise<HTMLImageElement | null> {
  if (!order.business_vat_number) return null;
  try {
    const payload = zatcaQrBase64(order.business_name, order.business_vat_number, order.created_at, Number(order.total).toFixed(2), Number(order.vat_amount).toFixed(2));
    const resp = await fetch("/api/qr?data=" + encodeURIComponent(payload));
    if (!resp.ok) return null;
    const svgText = await resp.text();
    // data: URI, not blob: — same CSP reasoning as the POS's own
    // loadZatcaQrImage (this page's img-src is 'self' data: https:, no
    // blob:).
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    return await loadImage(dataUrl);
  } catch {
    return null;
  }
}

// isCancelled: guards every await point — without it, React StrictMode's
// deliberate double-invoke of effects in dev (and any real re-render before
// the first draw's image/font loading finishes) starts a second concurrent
// draw on the same canvas while the first is mid-flight, and their
// canvas.width resets + fillText calls interleave into visibly corrupted
// output (seen live: garbled digits where the order-id/date row should be).
async function drawReceiptCard(canvas: HTMLCanvasElement, order: OrderStatus, accent: string, onAccent: string, isCancelled: () => boolean) {
  if (isCancelled()) return;

  // Both async steps (font/image loading) happen BEFORE any canvas mutation
  // on purpose — a superseded call must bail before touching canvas.width
  // (which invalidates any context another, newer call may have already
  // started drawing with), not after.
  //
  // Google Fonts serves each family+weight as several @font-face rules split
  // by unicode-range (latin/latin-ext/arabic/...), and the browser only
  // fetches the subset(s) a LOADED text sample actually needs.
  // `document.fonts.load(font)` with no second argument only probes a
  // default latin sample — it resolves "loaded" without the Arabic subset
  // ever being fetched, and fillText() then silently falls back to a system
  // font for the Arabic run (seen live: a whole word clipped/mis-shaped on
  // first paint). Passing the real Arabic text as the second argument forces
  // the correct subset to load before any drawing happens.
  const arabicSample = ["إيصال تأكيد الطلب", "فاتورة ضريبية مبسطة", "رقم الطلب", "التاريخ", "المجموع الفرعي", "ضريبة القيمة المضافة", "الرقم الضريبي", "الإجمالي", "استلام من الفرع توصيل طلب في المطعم", paymentMethodLabel(order), order.business_vat_number || "", order.business_name, order.customer_name, ...order.items.map((it) => it.name)].join(" ");
  try {
    await Promise.all([
      document.fonts.load("800 24px Alexandria", arabicSample),
      document.fonts.load("800 21px Alexandria", arabicSample),
      document.fonts.load("700 14px Alexandria", arabicSample),
      document.fonts.load("700 13px Alexandria", arabicSample),
      document.fonts.load("700 12.5px Alexandria", arabicSample),
      document.fonts.load("700 12px Alexandria", arabicSample),
      document.fonts.load("700 11.5px Alexandria", arabicSample),
      document.fonts.load("700 11px Alexandria", arabicSample),
      document.fonts.load("600 13.5px Alexandria", arabicSample),
      document.fonts.load("600 13px Alexandria", arabicSample),
      document.fonts.load("600 12.5px Alexandria", arabicSample),
      document.fonts.load("600 12px Alexandria", arabicSample),
      document.fonts.load("800 15px Alexandria", arabicSample),
      document.fonts.load("800 16px Alexandria", arabicSample),
      document.fonts.load("800 12.5px Alexandria", arabicSample),
      document.fonts.load("800 15px 'IBM Plex Mono'"),
      document.fonts.load("800 44px 'IBM Plex Mono'"),
      document.fonts.load("700 12.5px 'IBM Plex Mono'"),
      document.fonts.load("700 13px 'IBM Plex Mono'"),
      document.fonts.load("800 18px 'IBM Plex Mono'"),
      document.fonts.load("700 13px 'saudi_riyal'", RIYAL_CHAR),
      document.fonts.load("700 12.5px 'saudi_riyal'", RIYAL_CHAR),
      document.fonts.load("700 16px 'saudi_riyal'", RIYAL_CHAR),
      document.fonts.ready,
    ]);
  } catch {}
  if (isCancelled()) return;

  const logoImg = order.business_logo_url ? await loadImage(order.business_logo_url) : null;
  if (isCancelled()) return;
  const qrImg = await loadReceiptQr(order);
  if (isCancelled()) return;

  const headerH = 226;
  const bigNumberH = 118;
  const rowH = 34;
  const items = order.items.length > 0 ? order.items : [{ name: "—", qty: 1, line_total: order.total, note: null }];
  const hasVatNumber = !!order.business_vat_number;
  // Must comfortably cover everything drawn after the items loop: subtotal
  // (+30) + vat (+26, only when order.vat_registered) + divider (+26) +
  // total (+32) + channel/customer (+40) + payment pill (+30, its own
  // ~33px height centered on that y) + bottom padding ≈ 220 with no VAT
  // amount row (no credit row anymore — see the comment at the end of the
  // draw function); add the vat-number row (+34) + 100px QR block (+126)
  // when hasVatNumber ≈ 380. Re-derive this from the actual y reached at
  // the last fillText call if footer content
  // changes again — it's been clipped short more than once already from
  // guessing instead.
  const footerH = 220 - (order.vat_registered ? 0 : 26) + (hasVatNumber ? 160 : 0);
  const height = headerH + bigNumberH + items.length * rowH + footerH;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = RECEIPT_WIDTH * dpr;
  canvas.height = height * dpr;
  // Real reported bug: setting canvas.style.width/height here to the full
  // native 680px size overrode styles.receiptCanvas's own "width:100%;
  // height:auto" (an imperative inline style always wins over one set via
  // React's style prop, since both ultimately write the same element.style
  // property) — the small 140px preview thumbnail was clipped to a narrow
  // sliver of a full-size, un-scaled receipt instead of shrinking to fit,
  // which is what actually produced the oversized-looking mess. Leaving
  // canvas.width/height (the pixel buffer — still full native resolution,
  // so saveReceiptImage() keeps exporting the real, non-shrunk file) alone
  // and NOT touching .style here lets the CSS do the intended proportional
  // scale-down.
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  // Deliberately NOT setting ctx.direction="rtl": every textAlign used below
  // is a PHYSICAL value ("left"/"right"/"center", never "start"/"end"), and
  // Arabic glyph shaping/joining is determined by the text's own Unicode
  // script, not by this property. Setting it anyway triggered a real bug
  // here — combined with textAlign="left"/"center" it silently misplaced
  // text (a whole label rendered off-canvas, another's centering skewed
  // until it clipped past the right edge) despite matching the spec on
  // paper. Physical alignment values need no direction hint at all.

  const cx = RECEIPT_WIDTH / 2;

  // background
  ctx.fillStyle = "#FDFCF7";
  ctx.fillRect(0, 0, RECEIPT_WIDTH, height);

  // header band
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, RECEIPT_WIDTH, headerH);

  const logoSize = 60;
  const logoCy = 26 + logoSize / 2;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, logoCy, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, cx - logoSize / 2, logoCy - logoSize / 2, logoSize, logoSize);
    ctx.restore();
  } else {
    ctx.fillStyle = onAccent;
    ctx.beginPath();
    ctx.arc(cx, logoCy, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = "800 24px Alexandria";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(order.business_name.trim().charAt(0), cx, logoCy + 1);
  }

  ctx.fillStyle = onAccent;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 21px Alexandria";
  ctx.fillText(order.business_name, cx, logoCy + logoSize / 2 + 32);
  ctx.globalAlpha = 0.85;
  ctx.font = "600 12.5px Alexandria";
  ctx.fillText(hasVatNumber ? "فاتورة ضريبية مبسطة" : "إيصال تأكيد الطلب", cx, logoCy + logoSize / 2 + 54);
  ctx.globalAlpha = 1;

  const marginX = 34;

  // BIG order number, front and center right under the header — this is
  // meant to be the first thing the eye lands on when the card opens (a
  // cashier glancing at a customer's phone needs the order number before
  // anything else), so it's drawn far larger than any other text here.
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8375";
  ctx.font = "700 12px Alexandria";
  ctx.fillText("رقم الطلب", cx, headerH + 30);
  ctx.fillStyle = "#18170F";
  ctx.font = "800 44px 'IBM Plex Mono'";
  ctx.fillText("#" + order.order_id, cx, headerH + 80);
  ctx.fillStyle = "#8a8375";
  ctx.font = "700 11px Alexandria";
  ctx.fillText(timeLabel(order.created_at), cx, headerH + 100);

  let y = headerH + bigNumberH;
  ctx.strokeStyle = "rgba(24,20,10,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(RECEIPT_WIDTH - marginX, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // items
  y += 30;
  ctx.font = "600 13.5px Alexandria";
  for (const it of items) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#18170F";
    const qtyLabel = toArabicDigits(String(it.qty)) + "×";
    ctx.fillText(`${qtyLabel} ${it.name}`, RECEIPT_WIDTH - marginX, y);
    fillAmountWithRiyal(ctx, Number(it.line_total), marginX, y, "700 13px 'IBM Plex Mono'", 13, "#18170F");
    ctx.font = "600 13.5px Alexandria";
    y += rowH;
  }

  // divider
  ctx.strokeStyle = "rgba(24,20,10,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(RECEIPT_WIDTH - marginX, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // subtotal
  y += 30;
  ctx.textAlign = "right";
  ctx.fillStyle = "#8a8375";
  ctx.font = "700 12.5px Alexandria";
  ctx.fillText("المجموع الفرعي", RECEIPT_WIDTH - marginX, y);
  fillAmountWithRiyal(ctx, Number(order.subtotal), marginX, y, "700 12.5px 'IBM Plex Mono'", 12.5, "#18170F");

  // VAT — real reported fix: this used to draw unconditionally (even
  // "0.00" for a business that isn't VAT-registered at all) — now gated on
  // order.vat_registered (from businesses.vat_registered), a real flag
  // separate from hasVatNumber below (that one only governs whether a real
  // VAT NUMBER is on file to call this a "simplified tax invoice"; a
  // business can be VAT-registered and genuinely charge VAT without having
  // entered its VAT number yet — hiding the row in that case would hide
  // real tax being charged, not just an incomplete label).
  if (order.vat_registered) {
    y += 26;
    ctx.textAlign = "right";
    ctx.fillStyle = "#8a8375";
    ctx.font = "700 12.5px Alexandria";
    ctx.fillText("ضريبة القيمة المضافة", RECEIPT_WIDTH - marginX, y);
    fillAmountWithRiyal(ctx, Number(order.vat_amount), marginX, y, "700 12.5px 'IBM Plex Mono'", 12.5, "#18170F");
  }

  // divider
  y += 26;
  ctx.strokeStyle = "rgba(24,20,10,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(RECEIPT_WIDTH - marginX, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // total
  y += 32;
  ctx.textAlign = "right";
  ctx.fillStyle = "#18170F";
  ctx.font = "800 15px Alexandria";
  ctx.fillText("الإجمالي", RECEIPT_WIDTH - marginX, y);
  fillAmountWithRiyal(ctx, Number(order.total), marginX, y, "800 16px Alexandria", 16, "#18170F");

  // ZATCA-required fields — only claim "simplified tax invoice" (see the
  // subtitle above) when there's an actual VAT number to back it up.
  if (hasVatNumber) {
    y += 34;
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8375";
    ctx.font = "700 11px Alexandria";
    ctx.fillText("الرقم الضريبي: " + order.business_vat_number, cx, y);
    if (qrImg) {
      const qrSize = 100;
      y += 16;
      ctx.drawImage(qrImg, cx - qrSize / 2, y, qrSize, qrSize);
      y += qrSize + 10;
    } else {
      y += 10;
    }
  }

  // channel / customer footer
  y += 40;
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8375";
  ctx.font = "600 12px Alexandria";
  const channelLabel = order.channel === "pickup" ? "استلام من الفرع" : order.channel === "delivery" ? "توصيل" : "طلب في المطعم";
  ctx.fillText(`${channelLabel} — ${order.customer_name}`, cx, y);

  // payment method — the whole point of showing this card to the cashier is
  // so they know at a glance whether to collect cash or not.
  y += 30;
  const paymentText = paymentMethodLabel(order);
  ctx.font = "800 12.5px Alexandria";
  const paymentWidth = ctx.measureText(paymentText).width;
  const paymentPadX = 14, paymentPadY = 9;
  const pillW = paymentWidth + paymentPadX * 2, pillH = 24 + paymentPadY;
  const pillX = cx - pillW / 2, pillY = y - pillH / 2 - 6;
  ctx.fillStyle = order.payment_method === "card" ? color_mix(accent, 0.25) : "#F0EDE4";
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#18170F";
  ctx.fillText(paymentText, cx, y + 5);
  // bottom padding only past here — no footer credit line (merchant asked
  // for Rakeen's own branding off both this card and the page around it).
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Lightweight #rrggbb + alpha-over-white mix — canvas fillStyle doesn't
// accept CSS color-mix(), and this only ever runs against a light card
// background, so blending toward white is a safe stand-in for a translucent
// tint without pulling in a color library.
function color_mix(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#F0EDE4";
  const r = Math.round(parseInt(m[1], 16) * alpha + 255 * (1 - alpha));
  const g = Math.round(parseInt(m[2], 16) * alpha + 255 * (1 - alpha));
  const b = Math.round(parseInt(m[3], 16) * alpha + 255 * (1 - alpha));
  return `rgb(${r},${g},${b})`;
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
  prepTimer: {
    display: "flex", alignItems: "center", gap: "12px", border: "1px solid",
    borderRadius: "16px", padding: "12px 16px", marginTop: "-8px", marginBottom: "20px", textAlign: "start",
  },
  prepTimerIcon: {
    width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px",
  },
  prepTimerText: { flex: 1, minWidth: 0 },
  prepTimerLabel: { fontSize: "11px", fontWeight: 700, color: "#8a8375", marginBottom: "2px" },
  prepTimerClock: { fontSize: "20px", fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" },
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
  // The order number is the one thing the eye should land on the instant
  // this page opens — the receipt/invoice image below takes a beat to draw
  // and needs a scroll to reach, this is what's visible immediately.
  metaValueBig: { fontSize: "26px", fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", animation: "os-number-pulse 2.4s ease-in-out infinite" },
  timeHint: { fontSize: "10.5px", fontWeight: 600, color: "#8a8375", marginTop: "12px" },
  paymentBadge: {
    display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 800,
    borderRadius: "999px", padding: "6px 12px", marginTop: "10px",
  },
  detailsSection: { textAlign: "start", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(24,20,10,0.08)" },
  detailsLabel: { fontSize: "10.5px", fontWeight: 700, color: "#8a8375", marginBottom: "8px" },
  detailsRow: { display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", fontWeight: 600, padding: "5px 0" },
  detailsItemText: { flex: 1 },
  detailsItemNote: { color: "#8a8375", fontWeight: 500 },
  detailsItemPrice: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, flexShrink: 0 },
  noteSection: { textAlign: "start", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(24,20,10,0.08)" },
  noteRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" },
  noteText: { fontSize: "12px", fontWeight: 600, color: "#3a3628", lineHeight: 1.6, flex: 1 },
  receiptSection: { textAlign: "center", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(24,20,10,0.08)" },
  // A small on-page preview, not the real file — canvas.toBlob() in
  // saveReceiptImage() always exports the full native resolution regardless
  // of how small this is displayed, so shrinking the CSS box costs nothing
  // in the actual saved PNG's quality/detail.
  receiptCanvasWrap: {
    borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 18px rgba(24,20,10,0.14)", border: "1px solid rgba(24,20,10,0.08)",
    marginInline: "auto", marginBottom: "10px", lineHeight: 0, maxWidth: "140px",
  },
  receiptCanvas: { width: "100%", height: "auto", display: "block" },
  receiptHint: { fontSize: "11px", fontWeight: 700, color: "#8a8375", marginBottom: "12px" },
  saveReceiptBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", maxWidth: "260px", marginInline: "auto",
    padding: "13px", borderRadius: "16px", fontWeight: 800, fontSize: "13px", border: "none",
  },
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
  // Physical "right", not a logical inset-inline-end — explicit owner
  // feedback that the left side is awkward/in-the-way on this page, so this
  // needs to stay on the right regardless of RTL logical-property
  // conventions used elsewhere.
  backToTopBtn: {
    position: "fixed",
    bottom: "24px",
    right: "20px",
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 18px rgba(24,20,10,0.22)",
    cursor: "pointer",
    zIndex: 50,
  },
  mapCard: {
    width: "100%", maxWidth: "420px", marginTop: "14px", background: "#ffffff", borderRadius: "16px",
    border: "1px solid rgba(24,20,10,0.08)", boxShadow: "0 2px 14px rgba(24,20,10,0.06)", overflow: "hidden", textAlign: "start",
  },
  mapCardHead: { display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px 8px" },
  mapCardName: { fontSize: "12.5px", fontWeight: 800, flex: 1, minWidth: 0 },
  mapCardAddress: { fontSize: "11px", fontWeight: 600, color: "#8a8375", padding: "0 14px 10px", marginTop: "-6px" },
  mapCardFrame: { display: "block", width: "100%", height: "160px", border: "none" },
  mapCardLink: { display: "block", padding: "10px 14px", fontSize: "11.5px", fontWeight: 800, textDecoration: "none", textAlign: "center" },
};
