"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./wa-invite.css";

// نافذة «جديد ركين على الواتساب»: تطلع مرة وحدة لصاحب اللوحة، تدعوه يرسل لنا
// رسالة واتساب عشان نضيفه لقائمة التنبيهات والتحديثات. «أرسل» أو «تجاهل»
// يقفلها للأبد على هالجهاز (localStorage). ما تطلع فوق نافذة ثانية مفتوحة
// (نوافذ اللوحة .modal-overlay.show، أو تنبيه الاشتراك [data-rk-overlay]).
// كل شي بالأحداث: نراقب data-stage على body بـ MutationObserver، بدون تكرار.

// غيّر الرقم لإعادة إظهار النافذة للكل (حتى اللي أرسلوا أو تجاهلوا).
const DONE_KEY = "rk-wa-invite-done-2";
const WA_NUMBER = "966557015282";
const WA_DISPLAY = "055 701 5282";
const WA_TEXT = "السلام عليكم، أبي توصلني تنبيهات وجديد ركين على الواتساب 🔔";
const DELAY_MS = 4000;

function isDone() {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}
function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {}
}
function otherOverlayOpen() {
  return !!document.querySelector(".modal-overlay.show, [data-rk-overlay], .rk-wn-overlay");
}

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.21 2.19 1.35.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.3z" />
  </svg>
);
const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export default function WaUpdatesInvite() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isDone()) return;
    let timer = 0;
    let fired = false;
    const tryOpen = () => {
      if (fired || isDone()) return;
      if (document.body.dataset.stage !== "dashboard") return;
      if (otherOverlayOpen()) {
        // نافذة ثانية مفتوحة: نستنى لين تنقفل (أي تغيير في الصفحة) ونجرب مرة ثانية.
        return;
      }
      fired = true;
      setOpen(true);
      obs.disconnect();
    };
    const schedule = () => {
      if (fired) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tryOpen, DELAY_MS);
    };
    // نسمع لتغيّر المرحلة (دخول اللوحة) ولفتح/قفل النوافذ الثانية.
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-stage", "class"], childList: true, subtree: false });
    schedule();
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const dismiss = () => {
    markDone();
    setOpen(false);
  };

  if (!open) return null;

  const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_TEXT)}`;

  return createPortal(
    <div className="rk-wa-overlay" dir="rtl" onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="rk-wa-card" role="dialog" aria-modal="true" aria-labelledby="rk-wa-title">
        <div className="rk-wa-head">
          <img src="/brand/rakeen-wordmark.png" alt="ركين" className="rk-wa-wm" />
          <span className="rk-wa-pill">
            <Bell />
            تنبيهات ركين
          </span>
        </div>

        <div className="rk-wa-badge" aria-hidden="true">
          <WaIcon />
        </div>

        <h2 id="rk-wa-title" className="rk-wa-title">جديد ركين يوصلك على الواتساب</h2>
        <p className="rk-wa-body">
          عشان تكون مطّلع أول بأول على جديد ركين، أرسل لنا رسالة على الواتساب ونضيفك لقائمة التنبيهات والتحديثات.
        </p>

        <ul className="rk-wa-list">
          <li>الميزات الجديدة أول ما تنزل</li>
          <li>التحديثات المهمة لتطبيق الكاشير</li>
          <li>العروض والتنبيهات الخاصة بحسابك</li>
        </ul>

        <div className="rk-wa-num">
          <span>رقمنا</span>
          <b dir="ltr">{WA_DISPLAY}</b>
        </div>

        <div className="rk-wa-actions">
          <a className="rk-wa-cta" href={href} target="_blank" rel="noopener noreferrer" onClick={dismiss}>
            <WaIcon />
            أرسل لنا على الواتساب
          </a>
          <button type="button" className="rk-wa-skip" onClick={dismiss}>
            تجاهل
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
