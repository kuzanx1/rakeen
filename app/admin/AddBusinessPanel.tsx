"use client";

import { useState } from "react";
import { PLANS } from "@/lib/plans";

// "إضافة مشترك": the admin opens an account for a restaurant himself
// (POST /api/admin/businesses). Trial = 350 orders from the cashier and the
// online store together, then 24 hours, then selling stops. Access is
// either a password the admin types, or a link he sends on WhatsApp where
// the owner sets his own.

const C = { ink: "#171717", stone: "#EDEADF", lime: "#C4FF2B", deep: "#7BAD0F", muted: "#8a8375", danger: "#B0402C" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid rgba(23,23,23,.12)", background: "#fff", color: C.ink, colorScheme: "light", fontFamily: "inherit", fontSize: "13px" };
const label: React.CSSProperties = { fontSize: "11.5px", fontWeight: 800, display: "block", marginBottom: "5px" };
const pill = (bg: string, fg: string): React.CSSProperties => ({ padding: "9px 16px", borderRadius: "999px", background: bg, color: fg, fontWeight: 800, fontSize: "12px", border: "none", cursor: "pointer", whiteSpace: "nowrap" });

const TYPES: [string, string][] = [
  ["restaurant", "مطعم"],
  ["quick_service", "وجبات سريعة"],
  ["cafe", "كوفي"],
  ["cloud_kitchen", "مطبخ سحابي"],
  ["retail", "متجر"],
  ["salon", "صالون رجالي"],
  ["ladies_salon", "صالون نسائي"],
  ["car_wash", "مغسلة سيارات"],
  ["mobile_car_wash", "مغسلة متنقلة"],
  ["clinic", "عيادة"],
  ["tailoring", "خياط"],
  ["hotel", "فندق"],
  ["other", "غير ذلك"],
];

function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "966");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function AddBusinessPanel({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    businessName: "",
    fullName: "",
    phone: "",
    email: "",
    businessType: "restaurant",
    mode: "trial" as "trial" | "subscribed",
    plan: "",
    access: "link" as "link" | "password",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ link: string | null; warning?: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.mode === "subscribed" && !form.plan) return setError("اختر الباقة للمشترك");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, plan: form.plan || null }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "تعذر إنشاء الحساب");
      setDone({ link: data.link || null, warning: data.warning });
      onCreated();
    } catch {
      setError("تعذر الاتصال، جرّب مرة ثانية");
    } finally {
      setBusy(false);
    }
  }

  async function newLink() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: form.email, resendLinkFor: true }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "تعذر إنشاء الرابط");
      setDone((d) => ({ ...(d || {}), link: data.link, warning: undefined }));
    } finally {
      setBusy(false);
    }
  }

  const message = done?.link
    ? `هلا ${form.fullName}، حسابك في ركين جاهز لـ«${form.businessName}». افتح الرابط وحط كلمة المرور حقتك:\n${done.link}\n\nبعدها تدخل من rakeenapp.com/dashboard ببريدك ${form.email}.`
    : `هلا ${form.fullName}، حسابك في ركين جاهز لـ«${form.businessName}». ادخل من rakeenapp.com/dashboard ببريدك ${form.email} وكلمة المرور اللي أعطيتك إياها.`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,23,23,.45)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: "20px", width: "100%", maxWidth: "560px", padding: "22px", color: C.ink }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <b style={{ fontSize: "17px" }}>إضافة مشترك</b>
          <button type="button" onClick={onClose} style={pill(C.stone, C.ink)}>إغلاق</button>
        </div>

        {done ? (
          <div>
            <p style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
              انشأ الحساب ✓ {form.mode === "trial" ? "(تجريبي: 350 طلب من الكاشير والمتجر مع بعض)" : "(مشترك)"}
            </p>
            {done.warning && <p style={{ color: C.danger, fontSize: "13px", marginBottom: "10px" }}>{done.warning}</p>}
            {done.link && (
              <>
                <span style={label}>رابط التفعيل (للاستخدام مرة وحدة، وله مدة صلاحية)</span>
                <input style={{ ...input, direction: "ltr", marginBottom: "10px" }} readOnly value={done.link} onFocus={(e) => e.target.select()} />
              </>
            )}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {form.phone && (
                <a href={waLink(form.phone, message)} target="_blank" rel="noopener" style={{ ...pill(C.ink, C.lime), textDecoration: "none" }}>
                  أرسلها له واتساب
                </a>
              )}
              <button type="button" style={pill(C.stone, C.ink)} onClick={() => navigator.clipboard?.writeText(message)}>انسخ الرسالة</button>
              {form.access === "link" && (
                <button type="button" style={pill(C.stone, C.ink)} onClick={newLink} disabled={busy}>رابط جديد</button>
              )}
            </div>
            {error && <p style={{ color: C.danger, fontSize: "13px", marginTop: "10px" }}>{error}</p>}
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
            <div><span style={label}>اسم المنشأة</span><input style={input} value={form.businessName} onChange={set("businessName")} required /></div>
            <div><span style={label}>اسم صاحب المنشأة</span><input style={input} value={form.fullName} onChange={set("fullName")} required /></div>
            <div><span style={label}>الجوال</span><input style={{ ...input, direction: "ltr" }} inputMode="tel" placeholder="05xxxxxxxx" value={form.phone} onChange={set("phone")} /></div>
            <div><span style={label}>البريد (يدخل فيه)</span><input style={{ ...input, direction: "ltr" }} type="email" value={form.email} onChange={set("email")} required /></div>
            <div>
              <span style={label}>النشاط</span>
              <select style={input} value={form.businessType} onChange={set("businessType")}>
                {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>نوع الحساب</span>
              <select style={input} value={form.mode} onChange={set("mode")}>
                <option value="trial">تجريبي (350 طلب ثم يقفل)</option>
                <option value="subscribed">مشترك</option>
              </select>
            </div>
            <div>
              <span style={label}>الباقة</span>
              <select style={input} value={form.plan} onChange={set("plan")}>
                <option value="">{form.mode === "trial" ? "كل المزايا وقت التجربة" : "اختر الباقة"}</option>
                {PLANS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>الدخول</span>
              <select style={input} value={form.access} onChange={set("access")}>
                <option value="link">رابط تفعيل يحط فيه كلمة المرور بنفسه</option>
                <option value="password">أحط كلمة المرور بنفسي</option>
              </select>
            </div>
            {form.access === "password" && (
              <div><span style={label}>كلمة المرور (8 أحرف أو أكثر)</span><input style={{ ...input, direction: "ltr" }} type="text" autoComplete="off" value={form.password} onChange={set("password")} minLength={8} required /></div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              {error && <p style={{ color: C.danger, fontSize: "13px", marginBottom: "10px" }}>{error}</p>}
              <button type="submit" disabled={busy} style={{ ...pill(C.ink, C.lime), width: "100%", padding: "13px", opacity: busy ? 0.6 : 1 }}>
                {busy ? "جارٍ الإنشاء..." : "أنشئ الحساب"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
