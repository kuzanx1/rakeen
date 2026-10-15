"use client";

import { useRef, useState } from "react";
import "../contract/contract.css";
import QuoteDocument, { QUOTE_PHONE, QuoteProps } from "../contract/QuoteDocument";
import { contractPdfBlob, downloadBlob } from "../contract/pdf";
import { buildSchedule, FeatureKey, formatSar, periodLabel } from "@/lib/contracts";
import { PlanKey, PLANS, planByKey, planPrice, quoteIncluded, SELLABLE_FEATURES } from "@/lib/plans";

// Price quotes for prospects: people who haven't registered or subscribed
// yet. Deliberately separate from ContractsPanel: no account to pick, no
// start date or jurisdiction, nothing saved. Fill it in, get a one-page PDF.

const C = { ink: "#171717", paper: "#FBFAF5", stone: "#EDEADF", lime: "#C4FF2B", deep: "#7BAD0F", muted: "#8a8375", danger: "#B0402C" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid rgba(23,23,23,.12)", background: "#fff", color: "#171717", colorScheme: "light", fontFamily: "inherit", fontSize: "13px" };
const label: React.CSSProperties = { fontSize: "11.5px", fontWeight: 800, display: "block", marginBottom: "5px" };
const pill = (bg: string, fg: string): React.CSSProperties => ({ padding: "8px 14px", borderRadius: "999px", background: bg, color: fg, fontWeight: 800, fontSize: "11.5px", border: "none", cursor: "pointer", whiteSpace: "nowrap" });

const DEFAULT_PLAN = planByKey("emad")!;

function today() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function QuotePanel() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<QuoteProps | null>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    project_name: "",
    person_name: "",
    phone: "",
    plan: DEFAULT_PLAN.key as PlanKey | "custom",
    extra_branches: "0",
    plan_name: `باقة ${DEFAULT_PLAN.name}`,
    billing_period: "monthly" as "monthly" | "annual",
    price: String(DEFAULT_PLAN.monthly),
    discount_mode: "none" as "none" | "pct" | "amount",
    discount_value: "",
    discount_label: "",
    setup_fee: "0",
    vat_mode: "exclusive" as "exclusive" | "inclusive",
    branches_count: "1",
    valid_days: "14",
    payments_count: "1",
    features: DEFAULT_PLAN.features as string[],
    notes: "",
  });
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // A package fills in its name, price and features; anything can still be
  // edited by hand, and "custom" keeps whatever was typed. Extra branches are
  // priced by the package (half its price each), so they only apply to one.
  const plan = form.plan === "custom" ? null : planByKey(form.plan);
  const extraBranches = plan ? Math.max(0, Math.min(50, Math.trunc(Number(form.extra_branches) || 0))) : 0;
  const branchUnit = plan ? planPrice(plan, form.billing_period, 1).perBranch : 0;
  const pickPlan = (key: PlanKey | "custom", period: "monthly" | "annual") =>
    setForm((f) => {
      const p = key === "custom" ? null : planByKey(key);
      if (!p) return { ...f, plan: "custom", billing_period: period };
      return { ...f, plan: p.key, billing_period: period, plan_name: `باقة ${p.name}`, price: String(period === "annual" ? p.annual : p.monthly), features: [...p.features], branches_count: String(p.includedBranches) };
    });

  const basePrice = Number(form.price) + extraBranches * branchUnit;
  const discountValue = Number(form.discount_value || 0);
  const discountAmount =
    form.discount_mode === "pct" ? Math.round(basePrice * Math.min(Math.max(discountValue, 0), 100)) / 100
    : form.discount_mode === "amount" ? Math.min(Math.max(discountValue, 0), basePrice)
    : 0;
  const finalPrice = Math.round((basePrice - (Number.isFinite(discountAmount) ? discountAmount : 0)) * 100) / 100;
  const hasDiscount = form.discount_mode !== "none" && discountAmount > 0;
  const setup = Number(form.setup_fee || 0);
  const annual = form.billing_period === "annual";
  const paymentsCount = annual ? Math.max(1, Math.min(12, Math.trunc(Number(form.payments_count) || 1))) : 1;

  async function makeQuote() {
    setError(null);
    if (!form.project_name.trim()) return setError("اكتب اسم المشروع");
    if (!form.person_name.trim()) return setError("اكتب اسم الشخص");
    if (!Number.isFinite(finalPrice) || finalPrice < 0) return setError("السعر غير صحيح");
    if (!Number.isFinite(setup) || setup < 0) return setError("رسوم التأسيس غير صحيحة");
    if (form.features.length === 0) return setError("اختر ميزة وحدة على الأقل");
    setBusy(true);
    try {
      const now = new Date();
      const rnd = new Uint16Array(1);
      crypto.getRandomValues(rnd);
      const quoteNumber = `RKN-Q-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(rnd[0] % 10000).padStart(4, "0")}`;
      const QR = await import("qrcode");
      const acceptText = `السلام عليكم، أوافق على عرض سعر ركين رقم ${quoteNumber} — ${form.project_name.trim()}`;
      const acceptQrDataUrl = await QR.toDataURL(`https://wa.me/966${QUOTE_PHONE.slice(1)}?text=${encodeURIComponent(acceptText)}`, { margin: 0, width: 320, color: { dark: "#171717", light: "#ffffff" } });
      const props: QuoteProps = {
        quoteNumber,
        issuedAt: now.toISOString(),
        validDays: Math.max(1, Math.min(90, Math.trunc(Number(form.valid_days) || 14))),
        projectName: form.project_name.trim(),
        personName: form.person_name.trim(),
        phone: form.phone.trim(),
        planName: form.plan_name.trim() || "باقة ركين",
        billingPeriod: form.billing_period,
        price: finalPrice,
        listPrice: hasDiscount ? basePrice : null,
        discountLabel: hasDiscount ? form.discount_label.trim() : "",
        setupFee: setup > 0 ? setup : 0,
        vatMode: form.vat_mode,
        branchesCount: Math.max(1, Math.trunc(Number(form.branches_count) || 1)) + extraBranches,
        extraBranches,
        extraBranchPrice: branchUnit,
        features: form.features,
        included: plan ? quoteIncluded(plan, form.features) : undefined,
        notes: form.notes,
        acceptQrDataUrl,
        // Only an annual price split into instalments needs a schedule; the
        // dates just set the spacing ("كل 3 أشهر"), counted from today.
        payments: paymentsCount > 1 ? buildSchedule("annual", finalPrice, setup > 0 ? setup : 0, today(), paymentsCount).map((l) => ({ amount: l.amount, due_date: l.due_date })) : [],
      };
      setQuote(props);
      // let React paint the hidden document and its images before capture
      await new Promise((r) => setTimeout(r, 400));
      if (!quoteRef.current) return;
      const blob = await contractPdfBlob(quoteRef.current, quoteNumber);
      const filename = `Rakeen-Quote-${quoteNumber}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      // On a phone, open the share sheet (WhatsApp etc.); elsewhere just download.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: `عرض سعر ركين ${quoteNumber}` }).catch(() => downloadBlob(blob, filename));
      } else {
        downloadBlob(blob, filename);
      }
    } catch {
      setError("تعذر تجهيز عرض السعر");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: "980px" }}>
      <p style={{ fontSize: "12.5px", fontWeight: 700, color: C.muted, marginBottom: "16px" }}>
        عرض سعر لعميل محتمل، ما يحتاج حساب ولا عقد. يطلع PDF صفحة وحدة برقم {QUOTE_PHONE}، وما ينحفظ.
      </p>

      {error && <p style={{ fontSize: "12px", fontWeight: 700, color: C.danger, marginBottom: "12px" }}>{error}</p>}

      <div style={{ background: "#fff", borderRadius: "16px", padding: "18px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" }}>
          <div><span style={label}>اسم المشروع</span><input style={input} placeholder="مقهى ..." value={form.project_name} onChange={setF("project_name")} /></div>
          <div><span style={label}>اسم الشخص</span><input style={input} value={form.person_name} onChange={setF("person_name")} /></div>
          <div><span style={label}>جواله (اختياري)</span><input style={input} inputMode="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={setF("phone")} /></div>
          <div>
            <span style={label}>الباقة</span>
            <select style={input} value={form.plan} onChange={(e) => pickPlan(e.target.value as PlanKey | "custom", form.billing_period)}>
              {PLANS.map((p) => (
                <option key={p.key} value={p.key}>{p.name} · {p.monthly} ر.س شهريًا</option>
              ))}
              <option value="custom">مخصّصة (أكتب السعر والمزايا بنفسي)</option>
            </select>
          </div>
          <div>
            <span style={label}>نوع الاشتراك</span>
            <select style={input} value={form.billing_period} onChange={(e) => {
              const v = e.target.value as "monthly" | "annual";
              if (plan) pickPlan(plan.key, v);
              else setForm((f) => ({ ...f, billing_period: v }));
            }}>
              <option value="monthly">شهري (يتجدد تلقائيًا)</option>
              <option value="annual">سنوي (شهرين مجانًا)</option>
            </select>
          </div>
          <div><span style={label}>اسم الباقة في العرض</span><input style={input} value={form.plan_name} onChange={setF("plan_name")} /></div>
          <div><span style={label}>سعر الباقة لكل {annual ? "سنة" : "شهر"} (ر.س)</span><input style={input} inputMode="decimal" value={form.price} onChange={setF("price")} /></div>
          {plan && (
            <div>
              <span style={label}>فروع إضافية ({formatSar(branchUnit)} للفرع {annual ? "سنويًا" : "شهريًا"})</span>
              <input style={input} inputMode="numeric" value={form.extra_branches} onChange={setF("extra_branches")} />
            </div>
          )}
          <div>
            <span style={label}>الخصم</span>
            <div style={{ display: "flex", gap: "6px" }}>
              <select style={{ ...input, flex: "0 0 110px" }} value={form.discount_mode} onChange={setF("discount_mode")}>
                <option value="none">بدون</option>
                <option value="pct">نسبة %</option>
                <option value="amount">مبلغ ر.س</option>
              </select>
              {form.discount_mode !== "none" && (
                <input style={input} inputMode="decimal" placeholder={form.discount_mode === "pct" ? "مثلاً 20" : "مثلاً 30"} value={form.discount_value} onChange={setF("discount_value")} />
              )}
            </div>
          </div>
          {form.discount_mode !== "none" && (
            <div><span style={label}>سبب الخصم (اختياري)</span><input style={input} placeholder="عرض الافتتاح" value={form.discount_label} onChange={setF("discount_label")} /></div>
          )}
          <div><span style={label}>رسوم تأسيس (مرة وحدة)</span><input style={input} inputMode="decimal" value={form.setup_fee} onChange={setF("setup_fee")} /></div>
          <div>
            <span style={label}>الضريبة</span>
            <select style={input} value={form.vat_mode} onChange={setF("vat_mode")}>
              <option value="exclusive">السعر غير شامل الضريبة</option>
              <option value="inclusive">السعر شامل الضريبة</option>
            </select>
          </div>
          <div><span style={label}>{plan ? "فروع ضمن الباقة" : "عدد الفروع"}</span><input style={input} inputMode="numeric" value={form.branches_count} onChange={setF("branches_count")} /></div>
          {annual && (
            <div><span style={label}>تقسيط السنوي على (دفعات)</span><input style={input} inputMode="numeric" value={form.payments_count} onChange={setF("payments_count")} /></div>
          )}
          <div><span style={label}>صلاحية العرض (أيام)</span><input style={input} inputMode="numeric" value={form.valid_days} onChange={setF("valid_days")} /></div>
        </div>

        <span style={{ ...label, marginTop: "16px" }}>المزايا المشمولة</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "6px 14px" }}>
          {SELLABLE_FEATURES.map((f) => (
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

        <span style={{ ...label, marginTop: "16px" }}>ملاحظات العرض (اختياري، كل سطر بند)</span>
        <textarea style={{ ...input, minHeight: "70px" }} value={form.notes} onChange={setF("notes")} placeholder="مثال: تدريب الموظفين في الموقع مجانًا." />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: C.muted }}>
            {hasDiscount && <span style={{ textDecoration: "line-through", marginInlineEnd: "6px" }}>{formatSar(basePrice)}</span>}
            السعر: <b style={{ color: C.ink }}>{formatSar(Number.isFinite(finalPrice) ? finalPrice : 0)}</b> {periodLabel(form.billing_period)}
            {hasDiscount ? ` (خصم ${formatSar(discountAmount)})` : ""}
            {setup > 0 ? ` + تأسيس ${formatSar(setup)}` : ""}
            {extraBranches > 0 ? ` · شامل ${extraBranches} ${extraBranches === 1 ? "فرع إضافي" : "فروع إضافية"}` : ""}
            {paymentsCount > 1 ? ` · على ${paymentsCount} دفعات` : ""}
          </span>
          <button style={pill(C.ink, C.lime)} onClick={makeQuote} disabled={busy}>{busy ? "جاري التجهيز..." : "طلّع عرض السعر PDF"}</button>
        </div>
      </div>

      {quote && (
        <div aria-hidden style={{ position: "fixed", left: "-10000px", top: 0, width: "794px" }}>
          <div className="ct-vars" ref={quoteRef}>
            <QuoteDocument {...quote} />
          </div>
        </div>
      )}
    </div>
  );
}
