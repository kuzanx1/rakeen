"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./admin-overview.css";

// «نظرة عامة» — أول شاشة في /admin. كل الأرقام من /api/admin/overview.
// تتحدث لما تفتح الشاشة أو تضغط «تحديث» (بدون تحديث تلقائي).

type Pair = { orders: number; sales: number };
type Row = {
  id: number;
  name: string;
  type: string;
  createdAt: string;
  plan: string | null;
  subscribed: boolean;
  verification: string;
  expiresAt: string | null;
  trial: { used: number; limit: number } | null;
  owner: { name: string | null; phone: string | null; email: string | null };
  status: "active" | "slowing" | "idle" | "new" | "suspended";
  lastOrderAt: string | null;
  lifetimeOrders: number;
  today: Pair;
  yesterday: Pair;
  d7: Pair;
  d30: Pair;
  online30: number;
  activeDays30: number;
  series: number[];
  contract: { status: string; plan: string | null; price: number; period: string } | null;
  payments: { overdue: number; overdueCount: number; nextDue: string | null; nextAmount: number; pending: number; paid: number } | null;
};
type Data = {
  generatedAt: string;
  today: string;
  truncated: boolean;
  platform: {
    today: Pair;
    yesterday: Pair;
    d7: Pair;
    prev7: Pair;
    d30: Pair;
    prev30: Pair;
    series: { day: string; orders: number; sales: number }[];
    counts: Record<"total" | "active" | "slowing" | "idle" | "new" | "suspended" | "subscribed" | "trial" | "orderedToday", number>;
    plans: Record<"asas" | "emad" | "sarh" | "none", number>;
  };
  money: { paidThisMonth: number; paidTotal: number; overdue: number; overdueCount: number; due14: number; due14Count: number; pendingReview: number; mrr: number };
  businesses: Row[];
};

// حدود الفرص (تعدّل هنا)
const UPGRADE_ASAS_ORDERS_30D = 300; // أساس يبيع كثير → اعرض عليه عماد
const UPGRADE_EMAD_ORDERS_30D = 900; // عماد يبيع كثير → اعرض عليه صرح
const TRIAL_HOT_DAYS = 5; // تجربة شغّالة فعلاً
const TRIAL_NEAR_END = 0.7; // استهلك ٧٠٪ من التجربة
const NEW_GRACE_DAYS = 2; // ما بدأ بعد يومين من التسجيل
const EXPIRY_SOON_DAYS = 14;

const STATUS: Record<Row["status"], { label: string; cls: string; hint: string }> = {
  active: { label: "نشط", cls: "ok", hint: "آخر طلب خلال يومين" },
  slowing: { label: "هادي", cls: "warn", hint: "آخر طلب من ٣ إلى ٧ أيام" },
  idle: { label: "خامل", cls: "bad", hint: "ما فيه طلبات من أكثر من ٧ أيام" },
  new: { label: "ما بدأ", cls: "mute", hint: "ما سوّى ولا طلب" },
  suspended: { label: "موقوف", cls: "off", hint: "الحساب موقوف" },
};
const PLAN_LABEL: Record<string, string> = { asas: "أساس", emad: "عماد", sarh: "صرح" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const sar = (v: number) => (v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + "K" : n0(v));
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0);
function ago(iso: string | null) {
  if (!iso) return "ما فيه";
  const m = (Date.now() - Date.parse(iso)) / 60000;
  if (m < 60) return `قبل ${Math.max(1, Math.round(m))} د`;
  const h = m / 60;
  if (h < 24) return `قبل ${Math.round(h)} س`;
  const d = Math.floor(h / 24);
  return d === 1 ? "أمس" : `قبل ${d} يوم`;
}
function waLink(phone: string | null, text?: string) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05")) d = "966" + d.slice(1);
  else if (d.startsWith("5") && d.length === 9) d = "966" + d;
  if (d.length < 10) return null;
  return `https://wa.me/${d}` + (text ? `?text=${encodeURIComponent(text)}` : "");
}
const fmtDay = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });

function Delta({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  const p = pct(cur, prev);
  if (p === null) return <span className="ao-delta up">جديد {label}</span>;
  const cls = p > 0 ? "up" : p < 0 ? "down" : "flat";
  return (
    <span className={`ao-delta ${cls}`}>
      {p > 0 ? "▲" : p < 0 ? "▼" : "•"} {Math.abs(p)}% {label}
    </span>
  );
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 84;
  const h = 26;
  const step = w / (data.length - 1 || 1);
  const pts = data.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="ao-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={area} className="ao-spark-area" />
      <path d={line} className="ao-spark-line" />
      <circle cx={last[0]} cy={last[1]} r="2.6" className="ao-spark-dot" />
    </svg>
  );
}

function TrendChart({ series, metric }: { series: Data["platform"]["series"]; metric: "orders" | "sales" }) {
  const W = 720;
  const H = 230;
  const padL = 44;
  const padB = 26;
  const padT = 12;
  const vals = series.map((s) => s[metric]);
  const rawMax = Math.max(1, ...vals);
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / mag) * mag;
  const ticks = [0, max / 2, max];
  const cw = (W - padL) / series.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const peak = vals.indexOf(rawMax);
  return (
    <svg className="ao-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="الطلبات آخر ٣٠ يوم">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="ao-grid" />
          <text x={padL - 8} y={y(t) + 4} className="ao-axis" textAnchor="end">
            {metric === "sales" ? sar(t) : n0(t)}
          </text>
        </g>
      ))}
      {series.map((s, i) => {
        const v = s[metric];
        const x = padL + i * cw + cw * 0.18;
        const bw = cw * 0.64;
        const top = y(v);
        const isToday = i === series.length - 1;
        return (
          <g key={s.day}>
            <rect x={x} y={top} width={bw} height={Math.max(0, H - padB - top)} rx={Math.min(4, bw / 2)} className={isToday ? "ao-bar today" : i === peak ? "ao-bar peak" : "ao-bar"}>
              <title>{`${fmtDay(s.day)}: ${n0(s.orders)} طلب · ${n0(s.sales)} ر.س`}</title>
            </rect>
            {(i % 5 === 4 || isToday) && (
              <text x={x + bw / 2} y={H - 8} className="ao-axis" textAnchor="middle">
                {isToday ? "اليوم" : fmtDay(s.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Segment = { key: string; title: string; why: string; tone: "lime" | "warn" | "bad" | "ink"; rows: Row[]; pitch: (r: Row) => string; note: (r: Row) => string };

export default function OverviewPanel({ token, onOpenBusiness, onGoContracts }: { token: string; onOpenBusiness: (id: number) => void; onGoContracts: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState<"orders" | "sales">("orders");
  const [filter, setFilter] = useState<"all" | Row["status"] | "trial" | "overdue">("all");
  const [sort, setSort] = useState<"today" | "d7" | "d30" | "last" | "new">("d30");
  const [q, setQ] = useState("");
  const [openSeg, setOpenSeg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر التحميل");
      setData(d as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التحميل");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const segments: Segment[] = useMemo(() => {
    if (!data) return [];
    const B = data.businesses.filter((b) => b.status !== "suspended");
    const now = Date.now();
    return [
      {
        key: "upgrade",
        title: "جاهزين للترقية",
        why: `أساس فوق ${UPGRADE_ASAS_ORDERS_30D} طلب بالشهر، أو عماد فوق ${UPGRADE_EMAD_ORDERS_30D}`,
        tone: "lime",
        rows: B.filter((b) => (b.plan === "asas" && b.d30.orders >= UPGRADE_ASAS_ORDERS_30D) || (b.plan === "emad" && b.d30.orders >= UPGRADE_EMAD_ORDERS_30D)),
        note: (b) => `${n0(b.d30.orders)} طلب آخر ٣٠ يوم · ${PLAN_LABEL[b.plan || ""] || ""}`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، ما شاء الله مبيعاتك ممتازة هالشهر في ${b.name} 👏 عندنا عرض ترقية لباقة ${b.plan === "asas" ? "عماد" : "صرح"} يناسب حجم شغلك، تحب أرسل لك التفاصيل؟`,
      },
      {
        key: "trial",
        title: "تجربة شغّالة، اعرض الاشتراك",
        why: `في التجربة، واشتغلوا ${TRIAL_HOT_DAYS} أيام أو أكثر، أو استهلكوا ${TRIAL_NEAR_END * 100}% منها`,
        tone: "lime",
        rows: B.filter((b) => b.trial && (b.activeDays30 >= TRIAL_HOT_DAYS || (b.trial.limit > 0 && b.trial.used / b.trial.limit >= TRIAL_NEAR_END))),
        note: (b) => `${b.activeDays30} يوم شغل · التجربة ${b.trial ? `${b.trial.used}/${b.trial.limit}` : ""}`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، شفنا ${b.name} شغّال على ركين بشكل ممتاز 🌟 تجربتك قربت تخلص، وعندنا عرض اشتراك خاص لك. تحب أرسل لك الباقات؟`,
      },
      {
        key: "idle",
        title: "خاملين، يحتاجون اتصال",
        why: "كانوا يبيعون وما فيه طلبات من أكثر من ٧ أيام",
        tone: "bad",
        rows: B.filter((b) => b.status === "idle"),
        note: (b) => `آخر طلب ${ago(b.lastOrderAt)} · ${n0(b.lifetimeOrders)} طلب من البداية`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، معك فريق ركين 👋 لاحظنا ما فيه طلبات في ${b.name} الفترة اللي فاتت، فيه شي نقدر نساعدك فيه؟`,
      },
      {
        key: "new",
        title: "سجّلوا وما بدأوا",
        why: `مرّ عليهم ${NEW_GRACE_DAYS} أيام أو أكثر بدون ولا طلب`,
        tone: "warn",
        rows: B.filter((b) => b.status === "new" && now - Date.parse(b.createdAt) > NEW_GRACE_DAYS * 864e5),
        note: (b) => `سجّل ${ago(b.createdAt)}`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، أهلاً بك في ركين 🎉 نحب نساعدك تجهّز ${b.name} وتبدأ تبيع اليوم، يناسبك نتواصل معك دقيقتين؟`,
      },
      {
        key: "overdue",
        title: "متأخرين بالدفع",
        why: "دفعة فات موعدها وما وصل إيصالها",
        tone: "bad",
        rows: B.filter((b) => (b.payments?.overdueCount || 0) > 0),
        note: (b) => `${n0(b.payments!.overdue)} ر.س · ${b.payments!.overdueCount} دفعة`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، تذكير لطيف من ركين: عندك دفعة اشتراك مستحقة لـ ${b.name}. تقدر تسددها وترفع الإيصال من «اشتراكك» في اللوحة. شاكرين لك 🙏`,
      },
      {
        key: "expiry",
        title: "اشتراكهم ينتهي قريب",
        why: `ينتهي خلال ${EXPIRY_SOON_DAYS} يوم أو انتهى`,
        tone: "warn",
        rows: B.filter((b) => b.expiresAt && Date.parse(b.expiresAt) - now < EXPIRY_SOON_DAYS * 864e5),
        note: (b) => `ينتهي ${new Date(b.expiresAt!).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" })}`,
        pitch: (b) => `السلام عليكم ${b.owner.name || ""}، اشتراك ${b.name} في ركين ينتهي قريب. نجدده لك بنفس الباقة؟ وعندنا خصم لو صار سنوي 🎁`,
      },
    ];
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const list = data.businesses.filter((b) => {
      if (filter === "trial" && !b.trial) return false;
      if (filter === "overdue" && !(b.payments?.overdueCount || 0)) return false;
      if (filter !== "all" && filter !== "trial" && filter !== "overdue" && b.status !== filter) return false;
      if (!s) return true;
      return b.name.toLowerCase().includes(s) || String(b.id) === s || (b.owner.name || "").toLowerCase().includes(s) || (b.owner.phone || "").includes(s);
    });
    const by: Record<typeof sort, (r: Row) => number> = {
      today: (r) => r.today.sales,
      d7: (r) => r.d7.sales,
      d30: (r) => r.d30.sales,
      last: (r) => (r.lastOrderAt ? Date.parse(r.lastOrderAt) : 0),
      new: (r) => Date.parse(r.createdAt),
    };
    return [...list].sort((a, b) => by[sort](b) - by[sort](a));
  }, [data, filter, sort, q]);

  if (error && !data)
    return (
      <div className="ao-empty">
        <p>{error}</p>
        <button type="button" className="ao-btn" onClick={load}>
          حاول مرة ثانية
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="ao">
        <div className="ao-kpis">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ao-kpi ao-skel" />
          ))}
        </div>
      </div>
    );

  const P = data.platform;
  const C = P.counts;
  const M = data.money;
  const healthOrder: Row["status"][] = ["active", "slowing", "idle", "new", "suspended"];

  return (
    <div className="ao">
      <div className="ao-head">
        <div>
          <h2 className="ao-title">نظرة عامة</h2>
          <p className="ao-sub">
            {C.orderedToday} من {C.total} باعوا اليوم · آخر تحديث {new Date(data.generatedAt).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" })}
          </p>
        </div>
        <button type="button" className="ao-btn ghost" onClick={load} disabled={loading}>
          {loading ? "جاري التحديث..." : "تحديث"}
        </button>
      </div>
      {error && <p className="ao-err">{error}</p>}

      <section className="ao-kpis" aria-label="أرقام اليوم">
        <div className="ao-kpi hero">
          <span className="ao-kpi-label">طلبات المطاعم اليوم</span>
          <b className="ao-kpi-val">{n0(P.today.orders)}</b>
          <Delta cur={P.today.orders} prev={P.yesterday.orders} label="عن أمس" />
        </div>
        <div className="ao-kpi">
          <span className="ao-kpi-label">مبيعاتهم اليوم</span>
          <b className="ao-kpi-val">
            {n0(P.today.sales)} <small>ر.س</small>
          </b>
          <Delta cur={P.today.sales} prev={P.yesterday.sales} label="عن أمس" />
        </div>
        <div className="ao-kpi">
          <span className="ao-kpi-label">آخر ٣٠ يوم</span>
          <b className="ao-kpi-val">
            {n0(P.d30.orders)} <small>طلب</small>
          </b>
          <Delta cur={P.d30.orders} prev={P.prev30.orders} label="عن الشهر قبله" />
        </div>
        <div className="ao-kpi">
          <span className="ao-kpi-label">دخلك الشهري من العقود</span>
          <b className="ao-kpi-val">
            {n0(M.mrr)} <small>ر.س</small>
          </b>
          <span className="ao-delta flat">محصّل هالشهر {n0(M.paidThisMonth)}</span>
        </div>
        <button type="button" className={`ao-kpi link ${M.overdueCount ? "alarm" : ""}`} onClick={onGoContracts}>
          <span className="ao-kpi-label">متأخرات</span>
          <b className="ao-kpi-val">
            {n0(M.overdue)} <small>ر.س</small>
          </b>
          <span className="ao-delta flat">
            {M.overdueCount} دفعة{M.pendingReview ? ` · ${M.pendingReview} إيصال ينتظرك` : ""}
          </span>
        </button>
      </section>

      <section className="ao-grid2">
        <div className="ao-card">
          <div className="ao-card-head">
            <h3>نشاط المطاعم آخر ٣٠ يوم</h3>
            <div className="ao-seg" role="tablist">
              <button type="button" role="tab" aria-selected={metric === "orders"} onClick={() => setMetric("orders")}>
                الطلبات
              </button>
              <button type="button" role="tab" aria-selected={metric === "sales"} onClick={() => setMetric("sales")}>
                المبيعات
              </button>
            </div>
          </div>
          <TrendChart series={P.series} metric={metric} />
          <div className="ao-chart-foot">
            <span>
              آخر ٧ أيام: <b>{n0(P.d7.orders)}</b> طلب · <b>{n0(P.d7.sales)}</b> ر.س
            </span>
            <Delta cur={P.d7.orders} prev={P.prev7.orders} label="عن الأسبوع قبله" />
          </div>
        </div>

        <div className="ao-card">
          <div className="ao-card-head">
            <h3>صحة المشتركين</h3>
            <span className="ao-muted">{C.total} حساب</span>
          </div>
          <div className="ao-stack" aria-hidden="true">
            {healthOrder.map((s) =>
              C[s] ? <span key={s} className={`ao-stack-${STATUS[s].cls}`} style={{ flexGrow: C[s] }} /> : null,
            )}
          </div>
          <ul className="ao-legend">
            {healthOrder.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => setFilter(s)} title={STATUS[s].hint}>
                  <i className={`ao-dot ${STATUS[s].cls}`} />
                  {STATUS[s].label}
                  <b>{C[s]}</b>
                </button>
              </li>
            ))}
          </ul>
          <div className="ao-split">
            <div>
              <span className="ao-muted">مشتركين</span>
              <b>{C.subscribed}</b>
            </div>
            <div>
              <span className="ao-muted">في التجربة</span>
              <b>{C.trial}</b>
            </div>
          </div>
          <div className="ao-plans">
            {(["asas", "emad", "sarh"] as const).map((k) => (
              <div key={k}>
                <span>{PLAN_LABEL[k]}</span>
                <b>{P.plans[k]}</b>
              </div>
            ))}
            <div>
              <span>بدون باقة</span>
              <b>{P.plans.none}</b>
            </div>
          </div>
        </div>
      </section>

      <section className="ao-money" aria-label="المدفوعات">
        <div>
          <span className="ao-muted">محصّل هالشهر</span>
          <b>{n0(M.paidThisMonth)}</b>
        </div>
        <div>
          <span className="ao-muted">مستحق خلال ١٤ يوم</span>
          <b>{n0(M.due14)}</b>
          <small>{M.due14Count} دفعة</small>
        </div>
        <div>
          <span className="ao-muted">متأخر</span>
          <b className={M.overdue ? "bad" : ""}>{n0(M.overdue)}</b>
          <small>{M.overdueCount} دفعة</small>
        </div>
        <div>
          <span className="ao-muted">محصّل من البداية</span>
          <b>{n0(M.paidTotal)}</b>
        </div>
        <button type="button" className="ao-btn" onClick={onGoContracts}>
          العقود والدفعات{M.pendingReview ? ` (${M.pendingReview} إيصال)` : ""}
        </button>
      </section>

      <section className="ao-card">
        <div className="ao-card-head">
          <h3>لمين تعرض العروض اليوم</h3>
          <span className="ao-muted">اضغط على المجموعة تشوف الأسماء ورسالة جاهزة</span>
        </div>
        <div className="ao-segs">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`ao-segcard ${s.tone} ${openSeg === s.key ? "on" : ""}`}
              onClick={() => setOpenSeg(openSeg === s.key ? null : s.key)}
              aria-expanded={openSeg === s.key}
            >
              <b>{s.rows.length}</b>
              <span>{s.title}</span>
              <small>{s.why}</small>
            </button>
          ))}
        </div>
        {openSeg &&
          (() => {
            const s = segments.find((x) => x.key === openSeg)!;
            if (!s.rows.length) return <p className="ao-muted ao-pad">ما فيه أحد في هالمجموعة الحين.</p>;
            return (
              <ul className="ao-people">
                {s.rows.map((r) => {
                  const wa = waLink(r.owner.phone, s.pitch(r));
                  return (
                    <li key={r.id}>
                      <span className="ao-av">{Array.from(r.name.trim())[0] || "؟"}</span>
                      <div className="ao-people-main">
                        <b>{r.name}</b>
                        <span className="ao-muted">
                          {r.owner.name || "—"} · {s.note(r)}
                        </span>
                      </div>
                      {wa ? (
                        <a className="ao-wa" href={wa} target="_blank" rel="noopener noreferrer">
                          راسله واتساب
                        </a>
                      ) : (
                        <span className="ao-muted">ما فيه جوال</span>
                      )}
                      <button type="button" className="ao-btn ghost sm" onClick={() => onOpenBusiness(r.id)}>
                        تفاصيل
                      </button>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
      </section>

      <section className="ao-card">
        <div className="ao-card-head wrap">
          <h3>كل المطاعم</h3>
          <div className="ao-tools">
            <input className="ao-input" placeholder="ابحث بالاسم أو المالك أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="ao-input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="الترتيب">
              <option value="d30">الأعلى مبيعاً آخر ٣٠ يوم</option>
              <option value="d7">الأعلى مبيعاً آخر ٧ أيام</option>
              <option value="today">الأعلى مبيعاً اليوم</option>
              <option value="last">آخر طلب</option>
              <option value="new">الأحدث تسجيلاً</option>
            </select>
          </div>
        </div>
        <div className="ao-chips">
          {(
            [
              ["all", "الكل", C.total],
              ["active", "نشط", C.active],
              ["slowing", "هادي", C.slowing],
              ["idle", "خامل", C.idle],
              ["new", "ما بدأ", C.new],
              ["trial", "في التجربة", C.trial],
              ["overdue", "متأخر بالدفع", data.businesses.filter((b) => (b.payments?.overdueCount || 0) > 0).length],
              ["suspended", "موقوف", C.suspended],
            ] as const
          ).map(([k, label, count]) => (
            <button key={k} type="button" className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {label} <b>{count}</b>
            </button>
          ))}
        </div>
        <div className="ao-table-wrap">
          <table className="ao-table">
            <thead>
              <tr>
                <th>المطعم</th>
                <th>الحالة</th>
                <th>اليوم</th>
                <th>٧ أيام</th>
                <th>٣٠ يوم</th>
                <th>آخر ١٤ يوم</th>
                <th>آخر طلب</th>
                <th>الاشتراك والدفع</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status];
                const wa = waLink(r.owner.phone);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="ao-biz">
                        <span className="ao-av">{Array.from(r.name.trim())[0] || "؟"}</span>
                        <div>
                          <b>{r.name}</b>
                          <span className="ao-muted">
                            #{r.id} · {r.owner.name || "—"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`ao-pill ${st.cls}`} title={st.hint}>
                        {st.label}
                      </span>
                    </td>
                    <td className="num">
                      <b>{n0(r.today.orders)}</b>
                      <span className="ao-muted">{n0(r.today.sales)} ر.س</span>
                    </td>
                    <td className="num">
                      <b>{n0(r.d7.orders)}</b>
                      <span className="ao-muted">{n0(r.d7.sales)} ر.س</span>
                    </td>
                    <td className="num">
                      <b>{n0(r.d30.orders)}</b>
                      <span className="ao-muted">{n0(r.d30.sales)} ر.س</span>
                    </td>
                    <td>
                      <Spark data={r.series} />
                    </td>
                    <td>
                      <span className="ao-nowrap">{ago(r.lastOrderAt)}</span>
                    </td>
                    <td>
                      <div className="ao-paycell">
                        <span className={`ao-tag ${r.plan || "none"}`}>{r.plan ? PLAN_LABEL[r.plan] : r.subscribed ? "مشترك" : "تجربة"}</span>
                        {r.trial && r.trial.limit > 0 && (
                          <span className="ao-muted">
                            التجربة {r.trial.used}/{r.trial.limit}
                          </span>
                        )}
                        {r.payments?.overdueCount ? (
                          <span className="ao-bad">متأخر {n0(r.payments.overdue)} ر.س</span>
                        ) : r.payments?.nextDue ? (
                          <span className="ao-muted">
                            الدفعة الجاية {new Date(r.payments.nextDue + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" })}
                          </span>
                        ) : r.contract ? (
                          <span className="ao-muted">{r.contract.status === "signed" ? "عقد موقّع" : "عقد ما انوقّع"}</span>
                        ) : (
                          <span className="ao-muted">بدون عقد</span>
                        )}
                        {r.payments?.pending ? <span className="ao-warn">إيصال ينتظرك</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="ao-actions">
                        {wa && (
                          <a className="ao-icon" href={wa} target="_blank" rel="noopener noreferrer" title="واتساب" aria-label={`واتساب ${r.name}`}>
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.21 2.19 1.35.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.3z" />
                            </svg>
                          </a>
                        )}
                        <button type="button" className="ao-btn ghost sm" onClick={() => onOpenBusiness(r.id)}>
                          تفاصيل
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="ao-muted ao-pad">ما فيه نتائج</p>}
        </div>
        {data.truncated && <p className="ao-muted ao-pad">الطلبات كثيرة، الأرقام تقريبية (أول ٦٠ ألف طلب آخر ٩٠ يوم).</p>}
      </section>

      <WaInviteTool token={token} />
    </div>
  );
}

function WaInviteTool({ token }: { token: string }) {
  const [state, setState] = useState<{ round: number; updatedAt: string | null } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/wa-invite", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, [token]);

  const reshow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/wa-invite", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر الحفظ");
      setState(d);
      setMsg("تم. النافذة بتطلع لكل أصحاب اللوحات أول ما يفتحونها.");
      setConfirm(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ao-card ao-tool">
      <div className="ao-tool-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2z" />
        </svg>
      </div>
      <div className="ao-tool-main">
        <h3>نافذة «جديد ركين على الواتساب»</h3>
        <p className="ao-muted">
          تطلع مرة وحدة لكل صاحب لوحة. لو تبيها ترجع للكل، حتى اللي أرسلوا أو تجاهلوا، اضغط الزر.
          {state?.updatedAt && ` آخر مرة رجّعتها: ${new Date(state.updatedAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", timeZone: "Asia/Riyadh" })}.`}
        </p>
        {msg && <p className="ao-ok">{msg}</p>}
      </div>
      {!confirm ? (
        <button type="button" className="ao-btn" onClick={() => setConfirm(true)} disabled={!state}>
          أظهرها للكل من جديد
        </button>
      ) : (
        <div className="ao-confirm">
          <span>بتطلع لكل أصحاب اللوحات. أكيد؟</span>
          <button type="button" className="ao-btn" onClick={reshow} disabled={busy}>
            {busy ? "جاري..." : "إيه، أظهرها للكل"}
          </button>
          <button type="button" className="ao-btn ghost" onClick={() => setConfirm(false)} disabled={busy}>
            خلاص لا
          </button>
        </div>
      )}
    </section>
  );
}
