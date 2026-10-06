"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "../contract.css";
import ContractDocument from "../ContractDocument";
import SignaturePad, { SignaturePadHandle } from "../SignaturePad";
import { contractPdfBlob, downloadBlob } from "../pdf";
import { BUSINESS_ACTIVITIES, Clause, ContractOffer, ContractParty, RAKEEN_PARTY, validateParty } from "@/lib/contracts";

type Snapshot = {
  terms_version: string;
  rakeen: typeof RAKEEN_PARTY;
  offer: ContractOffer;
  party: ContractParty;
  clauses: Clause[];
  signed_at: string;
  signer_ip: string;
};

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "open";
      offer: ContractOffer;
      clauses: Clause[];
      termsVersion: string;
      rakeen: typeof RAKEEN_PARTY;
    }
  | { kind: "signed"; snapshot: Snapshot; signature: string; hash: string; pdfSaved: boolean };

const EMPTY: ContractParty = {
  business_name: "",
  business_activity: "",
  city: "",
  cr_number: "",
  vat_number: "",
  owner_name: "",
  owner_id_number: "",
  phone: "",
  email: "",
};

export default function ContractSignPage({ token }: { token: string }) {
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [party, setParty] = useState<ContractParty>(EMPTY);
  const [typedName, setTypedName] = useState("");
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const archived = useRef(false);

  useEffect(() => {
    fetch(`/api/contracts/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return setState({ kind: "error", message: data.error || "الرابط غير صالح" });
        if (data.status === "signed") {
          return setState({ kind: "signed", snapshot: data.snapshot, signature: data.signature_png, hash: data.document_hash, pdfSaved: data.pdf_saved });
        }
        setParty((p) => ({
          ...p,
          business_name: data.prefill?.business_name || "",
          owner_name: data.prefill?.owner_name || "",
          phone: data.prefill?.phone || "",
        }));
        setState({ kind: "open", offer: data.offer, clauses: data.clauses, termsVersion: data.terms_version, rakeen: data.rakeen });
      })
      .catch(() => setState({ kind: "error", message: "تعذر تحميل العقد، تأكد من الاتصال وحاول مرة ثانية" }));
  }, [token]);

  // Archive a copy of the PDF for Rakeen right after signing (best-effort).
  useEffect(() => {
    if (state.kind !== "signed" || state.pdfSaved || archived.current) return;
    archived.current = true;
    const t = setTimeout(async () => {
      try {
        if (!docRef.current) return;
        const blob = await contractPdfBlob(docRef.current, state.snapshot.offer.contract_number);
        await fetch(`/api/contracts/${encodeURIComponent(token)}/pdf`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: blob });
      } catch {
        /* the admin can regenerate it from /admin */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [state, token]);

  const set = (k: keyof ContractParty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setParty((p) => ({ ...p, [k]: e.target.value }));

  const previewParty = useMemo<ContractParty>(() => party, [party]);

  async function submit() {
    if (state.kind !== "open") return;
    setError(null);
    const { party: valid, error: vErr } = validateParty(party);
    if (!valid) return setError(vErr || "تحقق من البيانات");
    if (typedName.trim().replace(/\s+/g, " ") !== valid.owner_name.replace(/\s+/g, " ")) return setError("اكتب اسمك في خانة الإقرار بنفس اسم الممثل بالضبط");
    if (!agree) return setError("لازم توافق على بنود العقد");
    const signature = padRef.current?.toPng();
    if (!signature) return setError("وقّع في المربع بإصبعك");

    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...valid, typed_name: typedName, agree: true, signature_png: signature }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "تعذر توقيع العقد");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setState({ kind: "signed", snapshot: data.snapshot, signature: data.signature_png, hash: data.document_hash, pdfSaved: false });
    } catch {
      setError("تعذر الاتصال، حاول مرة ثانية");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (state.kind !== "signed" || !docRef.current) return;
    setPdfBusy(true);
    try {
      const blob = await contractPdfBlob(docRef.current, state.snapshot.offer.contract_number);
      downloadBlob(blob, `Rakeen-Contract-${state.snapshot.offer.contract_number}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  }

  if (state.kind === "loading" || state.kind === "error") {
    return (
      <main className="ct-root">
        <div className="ct-state">
          <img src="/brand/rakeen-wordmark-deep.png" alt="ركين" />
          {state.kind === "loading" ? (
            <p>جاري تحميل العقد...</p>
          ) : (
            <>
              <h1>ما قدرنا نفتح العقد</h1>
              <p>{state.message}</p>
            </>
          )}
        </div>
      </main>
    );
  }

  if (state.kind === "signed") {
    const s = state.snapshot;
    return (
      <main className="ct-root">
        <div className="ct-wrap">
          <div className="ct-done">
            <span className="ct-done-ic">✓</span>
            <div>
              <b>تم توقيع العقد</b>
              <div style={{ fontSize: 13, opacity: 0.8 }}>نسخة العقد محفوظة لدى ركين، وتقدر تحمّل نسختك من هنا في أي وقت.</div>
            </div>
          </div>
          <div ref={docRef}>
            <ContractDocument
              rakeen={s.rakeen}
              offer={s.offer}
              clauses={s.clauses}
              termsVersion={s.terms_version}
              party={s.party}
              signaturePng={state.signature}
              signedAt={s.signed_at}
              signerIp={s.signer_ip}
              documentHash={state.hash}
            />
          </div>
        </div>
        <div className="ct-bar">
          <div className="ct-wrap">
            <button className="ct-btn" onClick={download} disabled={pdfBusy}>
              {pdfBusy ? "جاري تجهيز الملف..." : "حمّل العقد PDF"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="ct-root">
      <div className="ct-wrap">
        <div className="ct-intro">
          <img src="/brand/rakeen-wordmark-deep.png" alt="ركين" />
          <div className="ct-steps">
            <span className="on">البيانات</span>
            <span className="on">المراجعة</span>
            <span className="on">التوقيع</span>
          </div>
        </div>

        <section className="ct-card">
          <h2>بيانات المشترك</h2>
          <p className="ct-hint">تنكتب في العقد كما هي، تأكد منها.</p>
          <div className="ct-grid">
            <div className="ct-field full">
              <label>اسم المنشأة (المطعم / المقهى / المشروع)</label>
              <input value={party.business_name} onChange={set("business_name")} autoComplete="organization" />
            </div>
            <div className="ct-field">
              <label>نوع النشاط</label>
              <select value={party.business_activity} onChange={set("business_activity")}>
                <option value="">اختر</option>
                {BUSINESS_ACTIVITIES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="ct-field">
              <label>المدينة</label>
              <input value={party.city} onChange={set("city")} autoComplete="address-level2" />
            </div>
            <div className="ct-field">
              <label>رقم السجل التجاري <i>(اختياري)</i></label>
              <input className="mono" inputMode="numeric" value={party.cr_number} onChange={set("cr_number")} />
            </div>
            <div className="ct-field">
              <label>الرقم الضريبي <i>(اختياري)</i></label>
              <input className="mono" inputMode="numeric" value={party.vat_number} onChange={set("vat_number")} />
            </div>
            <div className="ct-field full">
              <label>اسم صاحب المنشأة أو ممثلها (ثلاثي)</label>
              <input value={party.owner_name} onChange={set("owner_name")} autoComplete="name" />
            </div>
            <div className="ct-field">
              <label>رقم الهوية / الإقامة</label>
              <input className="mono" inputMode="numeric" value={party.owner_id_number} onChange={set("owner_id_number")} />
            </div>
            <div className="ct-field">
              <label>رقم الجوال</label>
              <input className="mono" inputMode="tel" placeholder="05XXXXXXXX" value={party.phone} onChange={set("phone")} autoComplete="tel" />
            </div>
            <div className="ct-field full">
              <label>البريد الإلكتروني</label>
              <input className="mono" type="email" inputMode="email" value={party.email} onChange={set("email")} autoComplete="email" />
            </div>
          </div>
        </section>

        <section className="ct-card" style={{ padding: 0, border: "none", background: "transparent" }}>
          <ContractDocument rakeen={state.rakeen} offer={state.offer} clauses={state.clauses} termsVersion={state.termsVersion} party={previewParty} />
        </section>

        <section className="ct-card">
          <h2>التوقيع</h2>
          <p className="ct-hint">اكتب اسمك ثم وقّع داخل المربع.</p>
          <div className="ct-field full" style={{ marginBottom: 12 }}>
            <label>أقر أنا (اكتب اسمك الثلاثي كما في البيانات)</label>
            <input value={typedName} onChange={(e) => setTypedName(e.target.value)} />
          </div>
          <SignaturePad ref={padRef} onChange={setHasInk} />
          <div className="ct-sigtools">
            <span>{hasInk ? "تم التوقيع" : "ما فيه توقيع بعد"}</span>
            <button className="ct-link" type="button" onClick={() => padRef.current?.clear()}>
              امسح وأعد
            </button>
          </div>
          <label className="ct-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>قرأت العقد كاملًا وأوافق على جميع بنوده، وأقر بصحة بياناتي وبأن توقيعي الإلكتروني ملزم لي.</span>
          </label>
          {error && <div className="ct-error" role="alert">{error}</div>}
        </section>
      </div>

      <div className="ct-bar">
        <div className="ct-wrap">
          <button className="ct-btn" onClick={submit} disabled={busy}>
            {busy ? "جاري التوقيع..." : "وقّع العقد"}
          </button>
        </div>
      </div>
    </main>
  );
}
