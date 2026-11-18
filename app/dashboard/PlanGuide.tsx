"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GUIDE_GROUPS, PLAN_GUIDE, type GuideFeature } from "./plan-guide";
import { openCta, screenAvailable } from "./WhatsNew";
import type { PlanKey } from "@/lib/plans";
import "./plan-guide.css";

// «دليل باقتك»: بطاقة في الرئيسية (تتقفل بـ×) وصفحة كاملة فيها كل ميزة في
// باقة المشترك: وش كانت المشكلة، وش حلّتها، وكيف يستخدمها، وزر يوديه لها.
// الباقة ومزاياها يكتبها rakeen-dashboard.js (body[data-plan-tier] و
// window.__rkPlanFeatures) ويطلق rk-plan-ready. «جديد ركين» يفتح الصفحة
// بحدث rk-open-plan-guide.

const CLOSED_KEY = "rk-plan-guide-closed";
const PLAN_NAME: Record<PlanKey, string> = { asas: "أساس", emad: "عماد", sarh: "صرح" };

type PlanState = { tier: string; features: Set<string> | null } | null;

function readPlan(): PlanState {
  const tier = document.body.dataset.planTier;
  if (!tier) return null;
  const list = (window as unknown as { __rkPlanFeatures?: string[] | null }).__rkPlanFeatures;
  return { tier, features: Array.isArray(list) ? new Set(list) : null };
}

export function openPlanGuide() {
  window.dispatchEvent(new Event("rk-open-plan-guide"));
}

function FeatureCard({ f, onGo }: { f: GuideFeature; onGo: (f: GuideFeature) => void }) {
  const go = f.cta && screenAvailable(f.cta.screen) ? f.cta : null;
  return (
    <article className="rk-pg-card">
      <header className="rk-pg-card-head">
        <span className="rk-pg-ic" aria-hidden="true">{f.icon}</span>
        <h3>{f.title}</h3>
      </header>
      <div className="rk-pg-ba">
        <p className="rk-pg-before"><span>قبل</span>{f.before}</p>
        <p className="rk-pg-after"><span>الحين</span>{f.after}</p>
      </div>
      <ol className="rk-pg-how">
        {f.how.map((h) => <li key={h}>{h}</li>)}
      </ol>
      {go && (
        <button type="button" className="rk-pg-go" onClick={() => onGo(f)}>
          {go.label}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
    </article>
  );
}

export default function PlanGuide({ homeEl }: { homeEl: HTMLElement | null }) {
  const [plan, setPlan] = useState<PlanState>(null);
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(true);
  const [group, setGroup] = useState<PlanKey | "all">("all");

  useEffect(() => {
    try { setClosed(localStorage.getItem(CLOSED_KEY) === "1"); } catch { setClosed(false); }
    const sync = () => setPlan(readPlan());
    sync();
    const openIt = () => { sync(); setOpen(true); };
    window.addEventListener("rk-plan-ready", sync);
    window.addEventListener("rk-open-plan-guide", openIt);
    return () => {
      window.removeEventListener("rk-plan-ready", sync);
      window.removeEventListener("rk-open-plan-guide", openIt);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // المزايا اللي في باقته فعلاً: الميزة بلا مفتاح تجي مع كل باقة، وبمفتاح
  // لازم تكون في allowed_features (null = تجربة/بلا قفل = كلها).
  const mine = useMemo(() => {
    if (!plan) return [];
    return PLAN_GUIDE.filter((f) => !f.feature || !plan.features || plan.features.has(f.feature));
  }, [plan]);

  if (!plan || mine.length === 0) return null;

  const trial = !(plan.tier in PLAN_NAME);
  const planLabel = trial ? "تجربتك المجانية" : `باقة ${PLAN_NAME[plan.tier as PlanKey]}`;
  const groups = GUIDE_GROUPS.filter((g) => mine.some((f) => f.plan === g.plan));
  const shown = group === "all" ? mine : mine.filter((f) => f.plan === group);
  const highlights = [...mine].reverse().slice(0, 4);

  const closeCard = () => {
    setClosed(true);
    try { localStorage.setItem(CLOSED_KEY, "1"); } catch {}
  };
  const go = (f: GuideFeature) => {
    setOpen(false);
    if (f.cta) openCta(f.cta);
  };

  return (
    <>
      {homeEl && !closed &&
        createPortal(
          <section className="rk-pg-home" aria-label="دليل باقتك">
            <button type="button" className="rk-pg-x" onClick={closeCard} aria-label="إخفاء">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            <div className="rk-pg-home-text">
              <span className="rk-pg-kick">📘 دليل باقتك</span>
              <h2>{planLabel}: عندك {mine.length} ميزة. تعرف تستفيد منها كلها؟</h2>
              <p>كل ميزة، وش المشكلة اللي تحلها، وكيف تستخدمها بخطوتين.</p>
              <div className="rk-pg-chips">
                {highlights.map((f) => <span key={f.id}>{f.icon} {f.title}</span>)}
              </div>
            </div>
            <button type="button" className="rk-pg-open" onClick={() => setOpen(true)}>
              افتح الدليل
            </button>
          </section>,
          homeEl,
        )}

      {open &&
        createPortal(
          <div className="rk-pg-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="rk-pg-sheet" role="dialog" aria-modal="true" aria-label="دليل باقتك">
              <header className="rk-pg-top">
                <div>
                  <span className="rk-pg-plan">{planLabel}</span>
                  <h2>دليل باقتك</h2>
                  <p>{mine.length} ميزة عندك. كل وحدة: وش كانت المشكلة، وكيف حلّتها، ووين تلقاها.</p>
                </div>
                <button type="button" className="rk-pg-x static" onClick={() => setOpen(false)} aria-label="إغلاق">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </header>
              {groups.length > 1 && (
                <nav className="rk-pg-tabs" aria-label="أقسام الدليل">
                  <button type="button" className={group === "all" ? "on" : ""} onClick={() => setGroup("all")}>الكل</button>
                  {groups.map((g) => (
                    <button key={g.plan} type="button" className={group === g.plan ? "on" : ""} onClick={() => setGroup(g.plan)}>
                      {g.title}
                    </button>
                  ))}
                </nav>
              )}
              <div className="rk-pg-body">
                {groups.filter((g) => group === "all" || g.plan === group).map((g) => {
                  const items = shown.filter((f) => f.plan === g.plan);
                  if (!items.length) return null;
                  return (
                    <section key={g.plan} className="rk-pg-group">
                      <div className="rk-pg-group-head">
                        <h3>{g.title}</h3>
                        <span>{g.sub}</span>
                      </div>
                      <div className="rk-pg-grid">
                        {items.map((f) => <FeatureCard key={f.id} f={f} onGo={go} />)}
                      </div>
                    </section>
                  );
                })}
                <p className="rk-pg-foot">أي ميزة ما وضحت لك؟ كلّمنا على واتساب ركين ونمشي معك فيها خطوة بخطوة.</p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
