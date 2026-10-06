"use client";

import { useEffect, useRef, useState } from "react";
import "../contract/contract.css";
import ContractDocument from "../contract/ContractDocument";
import { contractPdfBlob, downloadBlob } from "../contract/pdf";
import { Clause, ContractOffer, ContractParty, FEATURE_CATALOG, FeatureKey, formatSar, periodLabel, RAKEEN_PARTY } from "@/lib/contracts";

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
  const [detail, setDetail] = useState<{ row: ContractRow & { terms_snapshot: Snapshot | null; signature_png: string | null; document_hash: string | null }; pdfUrl: string | null; uploadedUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

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
    valid_days: "14",
    prefill_business_name: "",
    prefill_owner_name: "",
    prefill_phone: "",
  });
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price), setup_fee: Number(form.setup_fee || 0), branches_count: Number(form.branches_count), valid_days: Number(form.valid_days) }),
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
    setDetail({ row: { ...row, expired: row.status === "sent" && Date.parse(row.expires_at) < Date.now() }, pdfUrl: d.pdf_url, uploadedUrl: d.uploaded_url });
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

  return (
    <div style={{ maxWidth: "980px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: C.muted }}>أنشئ عقد، أرسل الرابط للمشترك، يوقّع من جواله ويتحفظ هنا PDF.</p>
        <button style={pill(C.ink, C.lime)} onClick={() => { setShowForm((v) => !v); setCreated(null); }}>
          {showForm ? "إغلاق" : "+ عقد جديد"}
        </button>
      </div>

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
            <div><span style={label}>اسم الباقة</span><input style={input} value={form.plan_name} onChange={setF("plan_name")} /></div>
            <div>
              <span style={label}>نوع العقد</span>
              <select style={input} value={form.billing_period} onChange={(e) => {
                const v = e.target.value as "monthly" | "annual";
                setForm((f) => ({ ...f, billing_period: v, price: v === "annual" && f.price === "149" ? "1490" : v === "monthly" && f.price === "1490" ? "149" : f.price }));
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
            <div><span style={label}>تاريخ البدء</span><input style={input} type="date" value={form.start_date} onChange={setF("start_date")} /></div>
            <div><span style={label}>عدد الفروع</span><input style={input} inputMode="numeric" value={form.branches_count} onChange={setF("branches_count")} /></div>
            <div><span style={label}>صلاحية الرابط (أيام)</span><input style={input} inputMode="numeric" value={form.valid_days} onChange={setF("valid_days")} /></div>
            <div><span style={label}>اسم المنشأة (تعبئة مسبقة، اختياري)</span><input style={input} value={form.prefill_business_name} onChange={setF("prefill_business_name")} /></div>
            <div><span style={label}>اسم صاحبها (اختياري)</span><input style={input} value={form.prefill_owner_name} onChange={setF("prefill_owner_name")} /></div>
            <div><span style={label}>جواله (اختياري، للإرسال بالواتساب)</span><input style={input} inputMode="tel" placeholder="05XXXXXXXX" value={form.prefill_phone} onChange={setF("prefill_phone")} /></div>
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
