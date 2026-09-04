"use client";

import { useState } from "react";

type BusinessTypeDef = {
  value: string;
  label: string;
  live: boolean;
  gets: string[]; // what the owner actually has, in plain language
  skips?: string; // one line on what's deliberately left out, and why
};

const BUSINESS_TYPES: BusinessTypeDef[] = [
  {
    value: "restaurant",
    label: "مطعم أو مقهى بجلسات وحجوزات",
    live: true,
    gets: ["طاولات وأقسام + حجوزات وقائمة انتظار", "شاشة مطبخ (KDS)", "توصيل ومطابقة عمولات المنصات", "منيو بتكلفة ووصفات دقيقة"],
  },
  {
    value: "quick_service",
    label: "مطعم وجبات سريعة (بدون جلسات)",
    live: true,
    gets: ["كاشير سريع من أول لحظة", "توصيل ومطابقة عمولات المنصات", "منيو بتكلفة دقيقة"],
    skips: "بدون طاولات ولا حجوزات — عشان ما يزاحم شاشتك بشي ما تستخدمه.",
  },
  {
    value: "cafe",
    label: "مقهى سريع (تيك أواي، بدون جلسات)",
    live: true,
    gets: ["كاشير سريع", "منيو ومشروبات بتكلفة دقيقة", "ولاء عملاء"],
    skips: "بدون طاولات ولا حجوزات — لو تبي جلسات وحجوزات، اختر \"مطعم أو مقهى بجلسات وحجوزات\" فوق.",
  },
  {
    value: "cloud_kitchen",
    label: "مطبخ سحابي (توصيل فقط)",
    live: true,
    gets: ["كاشير مخصص للتوصيل", "مطابقة عمولات كل منصة توصيل بدقة", "منيو بتكلفة دقيقة"],
    skips: "بدون طاولات ولا واجهة استقبال عملاء — مو محتاجها أصلاً.",
  },
  {
    value: "salon",
    label: "صالون رجالي",
    live: true,
    gets: ["خدمات بدل منيو (سعر + مدة)", "حجز كرسي وموظف مناسب للخدمة", "ولاء عملاء"],
    skips: "بدون مطبخ ولا توصيل.",
  },
  {
    value: "ladies_salon",
    label: "صالون / مشغل نسائي",
    live: true,
    gets: ["خدمات بدل منيو (سعر + مدة)", "حجز كرسي وموظفة مناسبة للخدمة", "ولاء عميلات"],
    skips: "بدون مطبخ ولا توصيل.",
  },
  {
    value: "car_wash",
    label: "مغسلة سيارات (فرع ثابت)",
    live: true,
    gets: ["خدمات غسيل بمدة محددة لكل نوع", "حجز باي غسيل وعامل مناسب", "ولاء عملاء"],
    skips: "بدون طاولات ولا مطبخ.",
  },
  {
    value: "mobile_car_wash",
    label: "مغسلة سيارات متنقلة",
    live: true,
    gets: ["حجز ذاتي للعميل مع تحديد موقعه على الخريطة", "حجوزات مرتبة بدل شاشة طاولات ما تحتاجها", "ولاء عملاء"],
    skips: "بدون باي غسيل ثابت — الفريق يروح لموقع العميل.",
  },
  {
    value: "clinic",
    label: "عيادة / مركز تجميل",
    live: true,
    gets: ["خدمات وجلسات بمدة محددة", "حجز موعد مع الأخصائي المناسب", "ولاء عملاء"],
    skips: "بدون مطبخ ولا توصيل.",
  },
  {
    value: "tailoring",
    label: "مشغل تفصيل",
    live: true,
    gets: ["خدمات بدل منيو (سعر + مدة)", "متابعة حالة الطلب (قيد التفصيل ← جاهز للاستلام)", "ولاء عملاء"],
    skips: "بدون مطبخ ولا طاولات — ما تحتاجها لمشغل تفصيل.",
  },
  {
    value: "hotel",
    label: "فندق",
    live: true,
    gets: ["أنواع غرف بدل منيو (سعر لكل ليلة)", "حجز إقامة بتواريخ وصول ومغادرة", "استقبال وتسجيل دخول/خروج", "غرف فعلية بحالة تنظيف/صيانة"],
    skips: "بدون تسعير موسمي أو تعدد غرف بحجز واحد — سعر ليلة ثابت لكل نوع غرفة.",
  },
  { value: "retail", label: "متجر تجزئة", live: false, gets: ["كاشير بباركود", "متجر إلكتروني بثيمات جاهزة"] },
  { value: "other", label: "نشاط آخر", live: false, gets: [] },
];

// Real reported bug: phone digit-stripping across the app used /\D/g,
// which only matches ASCII 0-9 — a customer typing on an Arabic keyboard
// (Arabic-Indic ٠-٩, common default in this market) got every character of
// their number silently wiped instead of converted. Convert both
// Arabic-Indic and Eastern Arabic-Indic (Persian) digits to Western digits
// FIRST, before any \D stripping.
function toWesternDigits(str: string): string {
  return str.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export default function SignupForm() {
  const [businessType, setBusinessType] = useState("restaurant");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedType = BUSINESS_TYPES.find((t) => t.value === businessType) || BUSINESS_TYPES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, fullName, email, phone, password, businessType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر إنشاء الحساب");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("تعذر الاتصال بالخادم — حاول مرة ثانية");
      setLoading(false);
    }
  }

  if (done) {
    const isLive = selectedType.live;
    const isServiceBased = ["salon", "ladies_salon", "car_wash", "mobile_car_wash", "clinic", "tailoring", "hotel"].includes(businessType);
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.successIcon}>🎉</div>
          <h1 style={styles.title}>تم إنشاء حسابك!</h1>
          <p style={styles.body}>
            {!isLive
              ? "ركين لسا يجهّز نظام مخصص لنشاطك — فريقنا بيتواصل معك قريبًا لتفعيله. سجّل دخولك وخل حسابك جاهز بالانتظار."
              : isServiceBased
              ? "سجّل دخولك وابدأ تضيف خدماتك الحين. فريق ركين بيراجع حسابك خلال وقت قصير، وبعدها يقدر عملاؤك يحجزون فعليًا."
              : "سجّل دخولك وابدأ تجهّز المنيو عندك الحين. فريق ركين بيراجع حسابك خلال وقت قصير، وبعدها يقدر عملاؤك يطلبون فعليًا — أول ٣٥٠ طلب مجانًا."}
          </p>
          <a href="/dashboard" style={styles.submitBtn}>
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>سجّل منشأتك بركين</h1>
        <p style={styles.body}>حساب جاهز فورًا، بدون انتظار — أول ٣٥٠ طلب على متجرك الإلكتروني مجانًا.</p>

        <label style={styles.label}>نوع المنشأة</label>
        <div style={styles.typeGrid}>
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setBusinessType(t.value)}
              style={{
                ...styles.typeBtn,
                ...(businessType === t.value ? styles.typeBtnActive : {}),
              }}
            >
              {t.label}
              {!t.live && <span style={styles.typeSoon}>قريبًا</span>}
            </button>
          ))}
        </div>

        {selectedType.live ? (
          <div style={styles.featuresBox}>
            <p style={styles.featuresTitle}>وش تحصل عليه:</p>
            <ul style={styles.featuresList}>
              {selectedType.gets.map((g, i) => (
                <li key={i} style={styles.featuresItem}>
                  ✓ {g}
                </li>
              ))}
            </ul>
            {selectedType.skips && <p style={styles.typeHint}>{selectedType.skips}</p>}
          </div>
        ) : (
          <p style={styles.typeHint}>هذا القطاع لسا قيد التجهيز — بنتواصل معك بعد التسجيل لتفعيله، وحسابك يكون أول عميل فيه.</p>
        )}

        <label style={styles.label}>اسم المنشأة</label>
        <input style={styles.input} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="مثال: مقهى الوردة" required />

        <label style={styles.label}>اسمك</label>
        <input style={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="اسمك الكامل" required />

        <label style={styles.label}>البريد الإلكتروني</label>
        <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />

        <label style={styles.label}>رقم الجوال (اختياري)</label>
        <input
          style={styles.input}
          type="tel"
          inputMode="tel"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(toWesternDigits(e.target.value).replace(/\D/g, "").slice(0, 10))}
          placeholder="05xxxxxxxx"
        />

        <label style={styles.label}>كلمة المرور</label>
        <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="٦ أحرف على الأقل" required minLength={6} />

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" style={{ ...styles.submitBtn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? "جاري الإنشاء..." : "إنشاء الحساب مجانًا"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#FBFAF5",
    color: "#171717",
    fontFamily: "'IBM Plex Sans Arabic', sans-serif",
    direction: "rtl",
    padding: "32px 20px",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "32px 26px",
    boxShadow: "0 18px 40px rgba(23,23,23,0.10)",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
  },
  successIcon: { fontSize: "40px", marginBottom: "10px" },
  title: { fontSize: "19px", fontWeight: 800, marginBottom: "8px", lineHeight: 1.4 },
  body: { fontSize: "12.5px", fontWeight: 600, color: "#8a8375", lineHeight: 1.7, marginBottom: "20px" },
  label: { fontSize: "11px", fontWeight: 700, color: "#8a8375", textAlign: "start", marginBottom: "5px", marginTop: "10px" },
  input: {
    width: "100%",
    background: "#FBFAF5",
    border: "1px solid rgba(23,23,23,0.1)",
    borderRadius: "10px",
    padding: "11px 13px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#171717",
    fontFamily: "inherit",
  },
  error: { fontSize: "11.5px", fontWeight: 700, color: "#B0402C", marginTop: "12px", textAlign: "start" },
  typeGrid: { display: "flex", flexWrap: "wrap", gap: "8px" },
  typeBtn: {
    position: "relative",
    padding: "9px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(23,23,23,0.15)",
    background: "#FBFAF5",
    color: "#171717",
    fontWeight: 700,
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  typeBtnActive: { background: "#171717", color: "#C4FF2B", borderColor: "#171717" },
  typeSoon: {
    display: "inline-block",
    marginInlineStart: "6px",
    fontSize: "9px",
    fontWeight: 800,
    color: "#8a8375",
  },
  typeHint: { fontSize: "10.5px", fontWeight: 600, color: "#8a8375", lineHeight: 1.7, marginTop: "8px", textAlign: "start" },
  featuresBox: { background: "#FBFAF5", borderRadius: "12px", padding: "12px 14px", marginTop: "10px", textAlign: "start" },
  featuresTitle: { fontSize: "10.5px", fontWeight: 800, color: "#171717", marginBottom: "6px" },
  featuresList: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" },
  featuresItem: { fontSize: "11px", fontWeight: 600, color: "#4C7A0A", lineHeight: 1.6 },
  submitBtn: {
    marginTop: "22px",
    padding: "14px",
    borderRadius: "14px",
    background: "#171717",
    color: "#C4FF2B",
    fontWeight: 800,
    fontSize: "13.5px",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    display: "block",
  },
};
