"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "../contract/contract.css";
import ContractDocument from "../contract/ContractDocument";
import { contractPdfBlob, downloadBlob } from "../contract/pdf";
import { buildSchedule, Clause, ContractOffer, ContractParty, FEATURE_CATALOG, FeatureKey, formatSar, periodLabel, RAKEEN_PARTY } from "@/lib/contracts";

type PaymentStatus = "due" | "submitted" | "paid" | "rejected";
type PaymentRow = {
  id: string;
  seq: number;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  receipt_url?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
};

function daysUntil(isoDate: string): number {
  return Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 86_400_000);
}
// The state of a contract's payments, for the list rows and the summary.
function paySummary(pays: PaymentRow[]) {
  const paid = pays.filter((p) => p.status === "paid");
  const open = pays.filter((p) => p.status !== "paid");
  const review = open.filter((p) => p.status === "submitted").length;
  const late = open.filter((p) => p.status !== "submitted" && daysUntil(p.due_date) < 0);
  const maxLate = late.reduce((m, p) => Math.max(m, -daysUntil(p.due_date)), 0);
  const next = open.find((p) => p.status !== "submitted") || null;
  return { paid: paid.length, total: pays.length, review, late: late.length, maxLate, next };
}

type ContractRow = {
  id: string;
  contract_number: string;
  token: string;
  status: "sent" | "signed" | "void";
  plan_name: string;
  billing_period: "monthly" | "annual";
  price: number;
  setup_fee: number;
  start_date: string;
  expires_at: string;
  prefill_business_name: string | null;
  prefill_owner_name: string | null;
  prefill_phone: string | null;
  business_name: string | null;
  owner_name: string | null;
  phone: string | null;
  signed_at: string | null;
  pdf_path: string | null;
  uploaded_file_path: string | null;
  created_at: string;
  business_id: number | null;
  account_name: string | null;
  payments?: PaymentRow[];
  expired?: boolean;
};

type Snapshot = {
  terms_version: string;
  rakeen: typeof RAKEEN_PARTY;
  offer: ContractOffer;
  party: ContractParty;
  clauses: Clause[];
  signed_at: string;
  signer_ip: string;
};

const C = { ink: "#171717", paper: "#FBFAF5", stone: "#EDEADF", lime: "#C4FF2B", deep: "#7BAD0F", muted: "#8a8375", danger: "#B0402C" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid rgba(23,23,23,.12)", background: "#fff", fontFamily: "inherit", fontSize: "13px" };
const label: React.CSSProperties = { fontSize: "11.5px", fontWeight: 800, display: "block", marginBottom: "5px" };
const pill = (bg: string, fg: string): React.CSSProperties => ({ padding: "8px 14px", borderRadius: "999px", background: bg, color: fg, fontWeight: 800, fontSize: "11.5px", border: "none", cursor: "pointer", whiteSpace: "nowrap" });

const DEFAULT_FEATURES: FeatureKey[] = ["pos", "zatca_invoice", "offline", "shift_close", "kds", "inventory", "purchases_scan", "costing_profit", "reports", "online_store", "loyalty", "tables_reservations", "team_permissions", "delivery_apps"];

function today() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function linkFor(token: string) {
  return `${window.location.origin}/contract/${token}`;
}
function waLink(phone: string | null, text: string) {
  const p = phone && /^05\d{8}$/.test(phone) ? `966${phone.slice(1)}` : "";
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export default function ContractsPanel({ token }: { token: string }) {
  const auth = { Authorization: `Bearer ${token}` };
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<{ number: string; token: string; phone: string | null } | null>(null);
  const [detail, setDetail] = useState<{ row: ContractRow & { terms_snapshot: Snapshot | null; signature_png: string | null; document_hash: string | null }; payments: PaymentRow[]; pdfUrl: string | null; uploadedUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [schedule, setSchedule] = useState<{ amount: string; due_date: string }[]>([]);
  const [scheduleEdited, setScheduleEdited] = useState(false);
  const [newPay, setNewPay] = useState({ amount: "", due_date: "" });
  type Bank = { bankName: string; iban: string; accountHolder: string };
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankDraft, setBankDraft] = useState<Bank | null>(null);

  async function saveBank() {
    if (!bankDraft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bank", { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(bankDraft) });
      const d = await res.json();
      if (!res.ok) return setError(d.error || "تعذر حفظ الحساب البنكي");
      setBank(d.bank);
      setBankDraft(null);
    } finally {
      setBusy(false);
    }
  }

  const [form, setForm] = useState({
    plan_name: "باقة ركين",
    billing_period: "monthly" as "monthly" | "annual",
    price: "149",
    setup_fee: "0",
    vat_mode: "exclusive" as "exclusive" | "inclusive",
    start_date: today(),
    branches_count: "1",
    features: DEFAULT_FEATURES as string[],
    special_terms: "",
    jurisdiction: "taif" as "taif" | "business_city",
    valid_days: "14",
    prefill_business_name: "",
    prefill_owner_name: "",
    prefill_phone: "",
    business_id: "",
    payments_count: "12",
  });
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // The schedule follows the offer until the admin edits a row by hand;
  // "إعادة التوزيع" drops the hand edits and recomputes.
  const autoSchedule = useMemo(() => {
    const price = Number(form.price);
    const setup = Number(form.setup_fee || 0);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(setup) || !/^\d{4}-\d{2}-\d{2}$/.test(form.start_date)) return [];
    return buildSchedule(form.billing_period, price, setup, form.start_date, Number(form.payments_count)).map((l) => ({ amount: String(l.amount), due_date: l.due_date }));
  }, [form.billing_period, form.price, form.setup_fee, form.start_date, form.payments_count]);
  const lines = scheduleEdited ? schedule : autoSchedule;

  const editLine = (i: number, key: "amount" | "due_date", value: string) => {
    setSchedule(lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
    setScheduleEdited(true);
  };
  const scheduleTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function load() {
    return fetch("/api/admin/contracts", { headers: auth })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        const now = Date.now();
        setRows((d.contracts as ContractRow[]).map((r) => ({ ...r, expired: r.status === "sent" && Date.parse(r.expires_at) < now })));
      })
      .catch(() => setError("تعذر تحميل العقود"));
  }
  useEffect(() => {
    load();
    fetch("/api/admin/businesses", { headers: auth })
      .then((r) => r.json())
      .then((d) => setAccounts(((d.businesses || []) as { id: number; name: string }[]).map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.id - b.id)))
      .catch(() => {});
    fetch("/api/admin/bank", { headers: auth })
      .then((r) => r.json())
      .then((d) => d.bank && setBank(d.bank))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          setup_fee: Number(form.setup_fee || 0),
          branches_count: Number(form.branches_count),
          valid_days: Number(form.valid_days),
          business_id: Number(form.business_id),
          payments: lines.map((l) => ({ amount: Number(l.amount), due_date: l.due_date })),
        }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error || "تعذر إنشاء العقد");
      setCreated({ number: d.contract.contract_number, token: d.contract.token, phone: form.prefill_phone.trim() || null });
      setShowForm(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/contracts/${id}`, { headers: auth });
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    const row = d.contract;
    setDetail({ row: { ...row, expired: row.status === "sent" && Date.parse(row.expires_at) < Date.now() }, payments: d.payments || [], pdfUrl: d.pdf_url, uploadedUrl: d.uploaded_url });
  }

  async function paymentAction(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contracts/${id}`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) return setError(d.error || "تعذر تنفيذ الإجراء");
      await openDetail(id);
      load();
      return true;
    } finally {
      setBusy(false);
    }
  }
  function approvePayment(id: string, p: PaymentRow) {
    const how = p.status === "submitted" ? "راجعت الإيصال ووصلك المبلغ" : "وصلك المبلغ (بدون إيصال من المشترك)";
    if (!window.confirm(`تأكيد سداد الدفعة ${p.seq} (${formatSar(p.amount)})؟ تأكد إنك ${how}.`)) return;
    paymentAction(id, { action: "pay_approve", payment_id: p.id });
  }
  function rejectPayment(id: string, p: PaymentRow) {
    const note = window.prompt(`سبب رفض إيصال الدفعة ${p.seq} (يوصل للمشترك):`, "المبلغ ما وصل الحساب");
    if (note && note.trim()) paymentAction(id, { action: "pay_reject", payment_id: p.id, note: note.trim() });
  }
  async function addPayment(id: string) {
    const ok = await paymentAction(id, { action: "pay_add", amount: Number(newPay.amount), due_date: newPay.due_date });
    if (ok) setNewPay({ amount: "", due_date: "" });
  }

  async function voidContract(id: string) {
    if (!window.confirm("متأكد تبي تلغي هذا العقد؟ الرابط بيتوقف.")) return;
    const res = await fetch(`/api/admin/contracts/${id}`, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ action: "void" }) });
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setDetail(null);
    load();
  }

  async function upload(id: string, file: File, kind: "pdf" | "file") {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/admin/contracts/${id}`, { method: "POST", headers: auth, body: fd });
      const d = await res.json();
      if (!res.ok) return setError(d.error);
      await openDetail(id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function makePdf() {
    if (!detail?.row.terms_snapshot || !docRef.current) return;
    setBusy(true);
    try {
      const blob = await contractPdfBlob(docRef.current, detail.row.contract_number);
      downloadBlob(blob, `Rakeen-Contract-${detail.row.contract_number}.pdf`);
      if (!detail.row.pdf_path) await upload(detail.row.id, new File([blob], "signed.pdf", { type: "application/pdf" }), "pdf");
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (s: ContractRow["status"], expired?: boolean) => {
    const [bg, fg, text] =
      s === "signed" ? [C.lime, C.ink, "موقّع"] : s === "void" ? ["#f1dcd7", C.danger, "ملغي"] : expired ? [C.stone, C.muted, "منتهي الرابط"] : [C.ink, C.lime, "بانتظار التوقيع"];
    return <span style={{ ...pill(bg, fg), cursor: "default", padding: "4px 10px", fontSize: "10.5px" }}>{text}</span>;
  };
  const payBadge = (p: PaymentRow) => {
    const d = daysUntil(p.due_date);
    const [bg, fg, text] =
      p.status === "paid" ? [C.lime, C.ink, "مسددة ✓"]
      : p.status === "submitted" ? ["#dbe8ff", "#1f4fa8", "إيصال بانتظار موافقتك"]
      : p.status === "rejected" ? ["#f1dcd7", C.danger, "إيصال مرفوض"]
      : d < 0 ? ["#f1dcd7", C.danger, `متأخرة ${-d} يوم`]
      : d === 0 ? [C.ink, C.lime, "مستحقة اليوم"]
      : [C.stone, C.muted, d <= 7 ? `باقي ${d} يوم` : "لم يحن موعدها"];
    return <span style={{ ...pill(bg, fg), cursor: "default", padding: "4px 10px", fontSize: "10.5px" }}>{text}</span>;
  };
  const allPays = (rows || []).filter((r) => r.status === "signed").map((r) => paySummary(r.payments || []));
  const reviewCount = allPays.reduce((s, x) => s + x.review, 0);
  const lateCount = allPays.reduce((s, x) => s + x.late, 0);

  return (
    <div style={{ maxWidth: "980px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: C.muted }}>أنشئ عقد، أرسل الرابط للمشترك، يوقّع من جواله ويتحفظ هنا PDF.</p>
        <button style={pill(C.ink, C.lime)} onClick={() => { setShowForm((v) => !v); setCreated(null); }}>
          {showForm ? "إغلاق" : "+ عقد جديد"}
        </button>
      </div>

      {bank && (
        <div style={{ background: "#fff", borderRadius: "14px", padding: "12px 14px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)", marginBottom: "14px" }}>
          {!bankDraft ? (
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "12.5px" }}>
              <b>الحساب البنكي للسداد</b>
              <span>{bank.bankName}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", direction: "ltr", unicodeBidi: "isolate" }}>{bank.iban.replace(/(.{4})/g, "$1 ").trim()}</span>
              <span>باسم {bank.accountHolder}</span>
              <span style={{ flex: 1 }} />
              <button style={pill(C.stone, C.ink)} onClick={() => setBankDraft(bank)}>تعديل</button>
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "10px" }}>
                <div><span style={label}>اسم البنك</span><input style={input} value={bankDraft.bankName} onChange={(e) => setBankDraft({ ...bankDraft, bankName: e.target.value })} /></div>
                <div><span style={label}>الآيبان</span><input style={{ ...input, direction: "ltr" }} value={bankDraft.iban} onChange={(e) => setBankDraft({ ...bankDraft, iban: e.target.value })} /></div>
                <div><span style={label}>اسم صاحب الحساب</span><input style={input} value={bankDraft.accountHolder} onChange={(e) => setBankDraft({ ...bankDraft, accountHolder: e.target.value })} /></div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11.5px", color: C.muted, flex: 1 }}>يطلع في العقود الجديدة وشاشة السداد عند المشتركين. العقود الموقّعة تبقى على الحساب اللي انوقّعت عليه.</span>
                <button style={pill(C.stone, C.ink)} disabled={busy} onClick={() => setBankDraft(null)}>إلغاء</button>
                <button style={pill(C.ink, C.lime)} disabled={busy} onClick={saveBank}>{busy ? "جاري الحفظ..." : "حفظ"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {(reviewCount > 0 || lateCount > 0) && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {reviewCount > 0 && <span style={{ ...pill("#dbe8ff", "#1f4fa8"), cursor: "default" }}>إيصالات بانتظار موافقتك: {reviewCount}</span>}
          {lateCount > 0 && <span style={{ ...pill("#f1dcd7", C.danger), cursor: "default" }}>دفعات متأخرة: {lateCount}</span>}
        </div>
      )}

      {error && <p style={{ fontSize: "12px", fontWeight: 700, color: C.danger, marginBottom: "12px" }}>{error}</p>}

      {created && (
        <div style={{ background: C.ink, color: C.paper, borderRadius: "16px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ fontWeight: 800, marginBottom: "8px" }}>تم إنشاء العقد <span style={{ color: C.lime, fontFamily: "'IBM Plex Mono',monospace" }}>{created.number}</span></div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "12px", direction: "ltr", wordBreak: "break-all", background: "rgba(255,255,255,.08)", padding: "10px", borderRadius: "10px", marginBottom: "10px" }}>{linkFor(created.token)}</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button style={pill(C.lime, C.ink)} onClick={() => navigator.clipboard.writeText(linkFor(created.token))}>نسخ الرابط</button>
            <a style={{ ...pill("#25D366", "#fff"), textDecoration: "none" }} target="_blank" rel="noreferrer" href={waLink(created.phone, `حياك الله 👋\nهذا رابط عقد اشتراكك في ركين (${created.number}).\nتعبي بياناتك وتوقّع من جوالك مباشرة:\n${linkFor(created.token)}`)}>إرسال واتساب</a>
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ background: "#fff", borderRadius: "16px", padding: "18px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)", marginBottom: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={label}>حساب المشترك (العقد مخصص له)</span>
              <select
                style={{ ...input, borderColor: form.business_id ? "rgba(23,23,23,.12)" : C.deep }}
                value={form.business_id}
                onChange={(e) => {
                  const v = e.target.value;
                  const name = accounts.find((a) => String(a.id) === v)?.name || "";
                  setForm((f) => ({ ...f, business_id: v, prefill_business_name: f.prefill_business_name || name }));
                }}
              >
                <option value="">اختر الحساب...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>#{a.id} · {a.name}</option>
                ))}
              </select>
            </div>
            <div><span style={label}>اسم الباقة</span><input style={input} value={form.plan_name} onChange={setF("plan_name")} /></div>
            <div>
              <span style={label}>نوع العقد</span>
              <select style={input} value={form.billing_period} onChange={(e) => {
                const v = e.target.value as "monthly" | "annual";
                setScheduleEdited(false);
                setForm((f) => ({ ...f, billing_period: v, payments_count: v === "annual" && f.payments_count === "12" ? "1" : v === "monthly" && f.payments_count === "1" ? "12" : f.payments_count, price: v === "annual" && f.price === "149" ? "1490" : v === "monthly" && f.price === "1490" ? "149" : f.price }));
              }}>
                <option value="monthly">شهري (يتجدد تلقائيًا)</option>
                <option value="annual">سنوي (يتجدد تلقائيًا)</option>
              </select>
            </div>
            <div><span style={label}>السعر لكل {form.billing_period === "annual" ? "سنة" : "شهر"} (ر.س)</span><input style={input} inputMode="decimal" value={form.price} onChange={setF("price")} /></div>
            <div><span style={label}>رسوم تأسيس (مرة وحدة)</span><input style={input} inputMode="decimal" value={form.setup_fee} onChange={setF("setup_fee")} /></div>
            <div>
              <span style={label}>الضريبة</span>
              <select style={input} value={form.vat_mode} onChange={setF("vat_mode")}>
                <option value="exclusive">السعر غير شامل الضريبة</option>
                <option value="inclusive">السعر شامل الضريبة</option>
              </select>
            </div>
            <div>
              <span style={label}>المحكمة المختصة</span>
              <select style={input} value={form.jurisdiction} onChange={setF("jurisdiction")}>
                <option value="taif">الطائف فقط</option>
                <option value="business_city">مدينة المنشأة فقط</option>
              </select>
            </div>
            <div><span style={label}>تاريخ البدء</span><input style={input} type="date" value={form.start_date} onChange={setF("start_date")} /></div>
            <div><span style={label}>عدد الفروع</span><input style={input} inputMode="numeric" value={form.branches_count} onChange={setF("branches_count")} /></div>
            <div><span style={label}>صلاحية الرابط (أيام)</span><input style={input} inputMode="numeric" value={form.valid_days} onChange={setF("valid_days")} /></div>
            <div><span style={label}>اسم المنشأة (تعبئة مسبقة، اختياري)</span><input style={input} value={form.prefill_business_name} onChange={setF("prefill_business_name")} /></div>
            <div><span style={label}>اسم صاحبها (اختياري)</span><input style={input} value={form.prefill_owner_name} onChange={setF("prefill_owner_name")} /></div>
            <div><span style={label}>جواله (اختياري، للإرسال بالواتساب)</span><input style={input} inputMode="tel" placeholder="05XXXXXXXX" value={form.prefill_phone} onChange={setF("prefill_phone")} /></div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
            <div style={{ width: "160px" }}>
              <span style={label}>عدد الدفعات</span>
              <input style={input} inputMode="numeric" value={form.payments_count} onChange={(e) => { setScheduleEdited(false); setF("payments_count")(e); }} />
            </div>
            <span style={{ fontSize: "11.5px", color: C.muted, flex: 1, minWidth: "200px", paddingBottom: "10px" }}>
              {form.billing_period === "annual" ? "السعر السنوي يتقسم على الدفعات خلال السنة." : "كل دفعة = سعر شهر، شهر ورا شهر."} رسوم التأسيس تنضاف للدفعة الأولى. تقدر تعدّل أي تاريخ أو مبلغ.
            </span>
            {scheduleEdited && <button style={pill(C.stone, C.ink)} onClick={() => setScheduleEdited(false)}>إعادة التوزيع</button>}
          </div>
          <div style={{ display: "grid", gap: "6px", marginTop: "10px" }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 800 }}>الدفعة {i + 1}</span>
                <input style={input} type="date" value={l.due_date} onChange={(e) => editLine(i, "due_date", e.target.value)} />
                <input style={input} inputMode="decimal" value={l.amount} onChange={(e) => editLine(i, "amount", e.target.value)} />
              </div>
            ))}
            {lines.length > 0 && <div style={{ fontSize: "12px", fontWeight: 800, textAlign: "left" }}>الإجمالي: {formatSar(scheduleTotal)}</div>}
          </div>

          <span style={{ ...label, marginTop: "16px" }}>المزايا المفعّلة في العقد</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "6px 14px" }}>
            {FEATURE_CATALOG.map((f) => (
              <label key={f.key} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.features.includes(f.key)}
                  onChange={(e) => setForm((s) => ({ ...s, features: e.target.checked ? [...s.features, f.key] : s.features.filter((k) => k !== f.key) }))}
                />
                {f.label}
              </label>
            ))}
          </div>

          <span style={{ ...label, marginTop: "16px" }}>شروط خاصة (اختياري، كل سطر بند)</span>
          <textarea style={{ ...input, minHeight: "80px" }} value={form.special_terms} onChange={setF("special_terms")} placeholder="مثال: خصم ٢٠٪ على أول ٣ أشهر." />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: C.muted }}>
              المستحق: {formatSar(Number(form.price || 0))} {periodLabel(form.billing_period)}
              {Number(form.setup_fee) > 0 ? ` + تأسيس ${formatSar(Number(form.setup_fee))}` : ""}
            </span>
            <button style={pill(C.ink, C.lime)} onClick={create} disabled={busy}>{busy ? "جاري الإنشاء..." : "أنشئ العقد والرابط"}</button>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ background: C.stone, borderRadius: "18px", padding: "14px", marginBottom: "18px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
            <b style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{detail.row.contract_number}</b>
            {statusBadge(detail.row.status, detail.row.expired)}
            <span style={{ flex: 1 }} />
            {detail.row.status === "signed" && <button style={pill(C.ink, C.lime)} onClick={makePdf} disabled={busy}>{busy ? "جاري..." : "تحميل PDF"}</button>}
            {detail.pdfUrl && <a style={{ ...pill("#fff", C.ink), textDecoration: "none" }} href={detail.pdfUrl} target="_blank" rel="noreferrer">النسخة المحفوظة</a>}
            {detail.uploadedUrl && <a style={{ ...pill("#fff", C.ink), textDecoration: "none" }} href={detail.uploadedUrl} target="_blank" rel="noreferrer">الملف المرفوع</a>}
            <label style={pill("#fff", C.ink)}>
              رفع ملف عقد
              <input type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && upload(detail.row.id, e.target.files[0], "file")} />
            </label>
            {detail.row.status !== "void" && <button style={pill("#f1dcd7", C.danger)} onClick={() => voidContract(detail.row.id)}>إلغاء العقد</button>}
            <button style={pill("#fff", C.ink)} onClick={() => setDetail(null)}>إغلاق</button>
          </div>

          <div style={{ background: "#fff", borderRadius: "14px", padding: "12px 14px", marginBottom: "12px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
              <b style={{ fontSize: "13px" }}>الدفعات</b>
              <span style={{ fontSize: "12px", color: C.muted }}>
                {detail.row.business_id ? `حساب #${detail.row.business_id} · ${detail.row.account_name || "محذوف"}` : "غير مربوط بحساب"}
                {detail.row.status !== "signed" ? " · تظهر للمشترك بعد التوقيع" : ""}
              </span>
            </div>
            {detail.payments.length === 0 && <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>ما فيه دفعات.</p>}
            {detail.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid rgba(23,23,23,.06)" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, width: "64px" }}>الدفعة {p.seq}</span>
                <span style={{ fontSize: "12.5px", width: "110px" }}>{formatSar(p.amount)}</span>
                <span style={{ fontSize: "12px", color: C.muted, width: "90px", fontFamily: "'IBM Plex Mono',monospace" }}>{p.due_date}</span>
                {payBadge(p)}
                {p.review_note && p.status === "rejected" && <span style={{ fontSize: "11.5px", color: C.danger }}>({p.review_note})</span>}
                <span style={{ flex: 1 }} />
                {p.receipt_url && <a style={{ ...pill(C.stone, C.ink), textDecoration: "none" }} href={p.receipt_url} target="_blank" rel="noreferrer">الإيصال</a>}
                {p.status === "submitted" && <button style={pill("#f1dcd7", C.danger)} disabled={busy} onClick={() => rejectPayment(detail.row.id, p)}>رفض</button>}
                {p.status !== "paid" && detail.row.status !== "void" && (
                  <button style={pill(C.ink, C.lime)} disabled={busy} onClick={() => approvePayment(detail.row.id, p)}>تأكيد السداد</button>
                )}
              </div>
            ))}
            {detail.row.status !== "void" && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(23,23,23,.06)" }}>
                <span style={{ fontSize: "12px", fontWeight: 800 }}>إضافة دفعة</span>
                <input style={{ ...input, width: "150px" }} type="date" value={newPay.due_date} onChange={(e) => setNewPay((s) => ({ ...s, due_date: e.target.value }))} />
                <input style={{ ...input, width: "120px" }} inputMode="decimal" placeholder="المبلغ" value={newPay.amount} onChange={(e) => setNewPay((s) => ({ ...s, amount: e.target.value }))} />
                <button style={pill(C.stone, C.ink)} disabled={busy || !newPay.amount || !newPay.due_date} onClick={() => addPayment(detail.row.id)}>إضافة</button>
              </div>
            )}
          </div>
          {detail.row.terms_snapshot ? (
            <div className="ct-vars" ref={docRef}>
              <ContractDocument
                rakeen={detail.row.terms_snapshot.rakeen}
                offer={detail.row.terms_snapshot.offer}
                clauses={detail.row.terms_snapshot.clauses}
                termsVersion={detail.row.terms_snapshot.terms_version}
                party={detail.row.terms_snapshot.party}
                signaturePng={detail.row.signature_png}
                signedAt={detail.row.terms_snapshot.signed_at}
                signerIp={detail.row.terms_snapshot.signer_ip}
                documentHash={detail.row.document_hash}
              />
            </div>
          ) : (
            <p style={{ fontSize: "12.5px", color: C.muted }}>العقد ما انوقّع بعد. الرابط: <span style={{ fontFamily: "'IBM Plex Mono',monospace", direction: "ltr", unicodeBidi: "isolate" }}>{linkFor(detail.row.token)}</span></p>
          )}
        </div>
      )}

      {rows && rows.length === 0 && <p style={{ fontSize: "12.5px", color: C.muted }}>ما فيه عقود بعد.</p>}
      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ background: "#fff", borderRadius: "12px", padding: "12px 14px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 800, fontSize: "13px" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.contract_number}</span>
                  {statusBadge(r.status, r.expired)}
                </div>
                <div style={{ fontSize: "12px", color: C.muted, marginTop: "4px" }}>
                  {r.business_name || r.prefill_business_name || "بدون اسم"} {r.owner_name ? `— ${r.owner_name}` : ""} {r.phone ? `— ${r.phone}` : ""}
                </div>
                <div style={{ fontSize: "11.5px", color: C.muted }}>
                  {r.plan_name} · {periodLabel(r.billing_period)} · {formatSar(r.price)}
                  {r.signed_at ? ` · وُقّع ${new Date(r.signed_at).toLocaleDateString("ar-SA-u-nu-latn")}` : ""}
                </div>
                <div style={{ fontSize: "11.5px", color: C.muted }}>
                  {r.business_id ? `حساب #${r.business_id} · ${r.account_name || "محذوف"}` : "غير مربوط بحساب"}
                </div>
                {r.status === "signed" && (r.payments || []).length > 0 && (() => {
                  const s = paySummary(r.payments || []);
                  return (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginTop: "6px", fontSize: "11.5px" }}>
                      <span style={{ fontWeight: 800 }}>مسدد {s.paid} من {s.total}</span>
                      {s.review > 0 && <span style={{ ...pill("#dbe8ff", "#1f4fa8"), cursor: "default", padding: "3px 9px", fontSize: "10.5px" }}>إيصال بانتظار موافقتك</span>}
                      {s.late > 0 && <span style={{ ...pill("#f1dcd7", C.danger), cursor: "default", padding: "3px 9px", fontSize: "10.5px" }}>متأخر {s.maxLate} يوم</span>}
                      {s.late === 0 && s.next && <span style={{ color: C.muted }}>الجاية {s.next.due_date} · {formatSar(s.next.amount)}</span>}
                    </div>
                  );
                })()}
              </div>
              {r.status === "sent" && (
                <button style={pill(C.stone, C.ink)} onClick={() => navigator.clipboard.writeText(linkFor(r.token))}>نسخ الرابط</button>
              )}
              <button style={pill(C.ink, C.lime)} onClick={() => openDetail(r.id)}>فتح</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
