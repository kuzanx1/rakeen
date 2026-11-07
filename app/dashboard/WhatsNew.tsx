"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RAKEEN_UPDATES, type RakeenUpdate } from "./rakeen-updates";
import "./whats-new.css";

// «جديد ركين» في اللوحة:
//   - بنر فخم أعلى الرئيسية لأحدث بوست ما شافه صاحب الجهاز (يتقفل بـ×)؛
//   - زر «جديد» في الشريط العلوي جنب التنبيهات، عليه نقطة ليمونية لو فيه
//     بوست ما انفتح؛
//   - لوحة جانبية فيها كل البوستات.
// البيانات في rakeen-updates.ts. «شافه» في localStorage حسب id.
// البنر يطلع ٤٥ يوم من تاريخ البوست بس، بعدها يبقى في القائمة.

const SEEN_KEY = "rk-wn-seen";
const CLOSED_KEY = "rk-wn-hero-closed";
const HERO_DAYS = 45;

function readSet(key: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {}
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
// الشاشة متاحة لهذا الحساب؟ (القائمة الجانبية تخفي اللي ما له صلاحية)
function screenAvailable(screen: string) {
  const nav = document.querySelector<HTMLElement>(`.nav-item[data-screen="${screen}"]`);
  return !!nav && nav.offsetParent !== null && !nav.classList.contains("hidden");
}
function openCta(cta: NonNullable<RakeenUpdate["cta"]>) {
  const nav = document.querySelector<HTMLElement>(`.nav-item[data-screen="${cta.screen}"]`);
  if (!nav) return;
  nav.click();
  let tries = 0;
  const step = () => {
    if (cta.tab) {
      const tab = document.querySelector<HTMLElement>(`#screen-${cta.screen} button[data-tab="${cta.tab}"], #onlineMenuTabs button[data-tab="${cta.tab}"], #acctScreenTabs button[data-tab="${cta.tab}"]`);
      if (!tab && ++tries < 20) return void setTimeout(step, 150);
      if (tab && !tab.classList.contains("active")) tab.click();
    }
    if (cta.focus) {
      let t2 = 0;
      const focus = () => {
        const el = document.getElementById(cta.focus!);
        if (!el && ++t2 < 30) return void setTimeout(focus, 200);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.classList.add("rk-wn-flash");
        setTimeout(() => el?.classList.remove("rk-wn-flash"), 2400);
      };
      setTimeout(focus, 250);
    }
  };
  setTimeout(step, 60);
}

const Spark = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.8 4.7 2.8 6.7 7.5 7.5-4.7.8-6.7 2.8-7.5 7.5-.8-4.7-2.8-6.7-7.5-7.5C9.2 8.7 11.2 6.7 12 2zM19 15c.4 2 1.1 2.6 3 3-1.9.4-2.6 1.1-3 3-.4-1.9-1.1-2.6-3-3 1.9-.4 2.6-1 3-3z" />
  </svg>
);
const Close = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

export default function WhatsNew() {
  const [stage, setStage] = useState<string>("");
  const [homeEl, setHomeEl] = useState<HTMLElement | null>(null);
  const [btnEl, setBtnEl] = useState<HTMLElement | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setSeen(readSet(SEEN_KEY));
    setClosed(readSet(CLOSED_KEY));
    setReady(true);
  }, []);

  // اللوحة نفسها (rakeen-dashboard.js) تملك الترميز، فنثبّت مكاننا فيها
  // ونرجّعه لو انمسح.
  useEffect(() => {
    const ensure = () => {
      setStage(document.body.dataset.stage || "");
      const home = document.getElementById("screen-home");
      if (home) {
        let slot = document.getElementById("rk-whatsnew-home");
        if (!slot || !home.contains(slot)) {
          slot = document.createElement("div");
          slot.id = "rk-whatsnew-home";
          const billing = document.getElementById("rk-billing-home");
          if (billing && home.contains(billing)) billing.after(slot);
          else home.prepend(slot);
        }
        setHomeEl((cur) => (cur === slot ? cur : slot));
      }
      const notif = document.getElementById("topbarNotifBtn");
      if (notif && notif.parentElement) {
        let b = document.getElementById("rk-whatsnew-btn-slot");
        if (!b || !notif.parentElement.contains(b)) {
          b = document.createElement("span");
          b.id = "rk-whatsnew-btn-slot";
          b.className = "rk-wn-btn-slot";
          notif.before(b);
        }
        setBtnEl((cur) => (cur === b ? cur : b));
      }
      setTick((t) => t + 1);
    };
    const first = window.setTimeout(ensure, 0);
    const t = window.setInterval(ensure, 1500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  const markSeen = useCallback((ids: string[]) => {
    setSeen((cur) => {
      const n = new Set(cur);
      ids.forEach((i) => n.add(i));
      writeSet(SEEN_KEY, n);
      return n;
    });
  }, []);

  const openPanel = useCallback(() => {
    setOpen(true);
    markSeen(RAKEEN_UPDATES.map((u) => u.id));
  }, [markSeen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready || stage !== "dashboard") return null;

  const unseen = RAKEEN_UPDATES.filter((u) => !seen.has(u.id));
  const now = Date.now();
  const hero = RAKEEN_UPDATES.find(
    (u) => !closed.has(u.id) && now - Date.parse(u.date + "T00:00:00+03:00") < HERO_DAYS * 864e5,
  );
  const closeHero = (id: string) => {
    setClosed((cur) => {
      const n = new Set(cur);
      n.add(id);
      writeSet(CLOSED_KEY, n);
      return n;
    });
    markSeen([id]);
  };
  const ctaFor = (u: RakeenUpdate) => (u.cta && screenAvailable(u.cta.screen) ? u.cta : null);

  return (
    <>
      {btnEl &&
        createPortal(
          <button
            type="button"
            className="topbar-notif-btn rk-wn-btn"
            onClick={openPanel}
            title="جديد ركين"
            aria-label={unseen.length ? `جديد ركين، ${unseen.length} تحديث جديد` : "جديد ركين"}
          >
            <Spark />
            <span className="rk-wn-btn-label">جديد</span>
            {unseen.length > 0 && <span className="rk-wn-dot" aria-hidden="true" />}
          </button>,
          btnEl,
        )}

      {homeEl &&
        hero &&
        createPortal(
          <section className="rk-wn-hero" aria-label="جديد ركين">
            <button type="button" className="rk-wn-x" onClick={() => closeHero(hero.id)} aria-label="إخفاء">
              <Close />
            </button>
            <div className="rk-wn-hero-text">
              <div className="rk-wn-kick">
                <span className="rk-wn-pill"><Spark />جديد ركين</span>
                <span className="rk-wn-date">{fmtDate(hero.date)}</span>
              </div>
              <h2 className="rk-wn-title">{hero.title}</h2>
              <p className="rk-wn-body">{hero.body}</p>
              {hero.points && (
                <ol className="rk-wn-points">
                  {hero.points.map((p, i) => (
                    <li key={p.title}>
                      <span className="rk-wn-n">{String(i + 1).padStart(2, "0")}</span>
                      <b>{p.title}</b>
                    </li>
                  ))}
                </ol>
              )}
              <div className="rk-wn-actions">
                {ctaFor(hero) && (
                  <button type="button" className="rk-wn-cta" onClick={() => { markSeen([hero.id]); openCta(hero.cta!); }}>
                    {hero.cta!.label}
                    <Arrow />
                  </button>
                )}
                <button type="button" className="rk-wn-ghost" onClick={openPanel}>
                  التفاصيل وكل الجديد
                </button>
              </div>
            </div>
            {hero.image && (
              <div className="rk-wn-hero-art">
                <img src={hero.image} alt="" loading="lazy" decoding="async" />
              </div>
            )}
          </section>,
          homeEl,
        )}

      {open &&
        createPortal(
          <div className="rk-wn-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
            <aside className="rk-wn-panel" role="dialog" aria-modal="true" aria-label="جديد ركين">
              <header className="rk-wn-panel-head">
                <div>
                  <img src="/brand/rakeen-wordmark.png" alt="ركين" className="rk-wn-wm" />
                  <div className="rk-wn-panel-title">جديد ركين</div>
                  <div className="rk-wn-panel-sub">كل ميزة وتحسين ينزل، أول بأول</div>
                </div>
                <button type="button" className="rk-wn-x static" onClick={() => setOpen(false)} aria-label="إغلاق">
                  <Close />
                </button>
              </header>
              <div className="rk-wn-feed">
                {RAKEEN_UPDATES.map((u) => {
                  const cta = ctaFor(u);
                  return (
                    <article className="rk-wn-post" key={u.id}>
                      {u.image && <img className="rk-wn-post-img" src={u.image} alt="" loading="lazy" decoding="async" />}
                      <div className="rk-wn-post-body">
                        <div className="rk-wn-kick">
                          <span className="rk-wn-tag">{u.tag}</span>
                          <span className="rk-wn-date">{fmtDate(u.date)}</span>
                        </div>
                        <h3>{u.title}</h3>
                        <p>{u.body}</p>
                        {u.points && (
                          <ol className="rk-wn-post-points">
                            {u.points.map((p, i) => (
                              <li key={p.title}>
                                <span className="rk-wn-n">{String(i + 1).padStart(2, "0")}</span>
                                <div>
                                  <b>{p.title}</b>
                                  <span>{p.text}</span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                        {cta && (
                          <button type="button" className="rk-wn-cta" onClick={() => { setOpen(false); openCta(cta); }}>
                            {cta.label}
                            <Arrow />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
