"use client";

import { useEffect, useState } from "react";

/**
 * «شريط الفاتورة» -- ميزةٌ مؤقّتة تُشغَّل وتُطفأ لكلِّ المطاعم بضغطة.
 *
 * والإطفاءُ هو الزرُّ الأهمّ هنا، لا التشغيل: مناسبةٌ تنتهي ويبقى شريطُها
 * يُطبع شهراً بعدها هو العطبُ المتوقَّع. فـ«بلا شريط» أوّلُ الخيارات
 * ومعلَّمٌ بوضوح.
 */

type Kind = "none" | "shield" | "plain" | "invert";

const CHOICES: Array<{ kind: Kind; label: string; desc: string; lines: string[]; invert?: boolean; framed?: boolean }> = [
  { kind: "none", label: "بلا شريط", desc: "الفاتورة كما هي — لا شيء يُطبع.", lines: [] },
  {
    kind: "shield", label: "١ · سطر داخل إطار",
    desc: "الأقصر ورقًا. سطران داخل إطار.",
    framed: true,
    lines: ["السعودية خط أحمر", "تذكّر شكلها فلا تنسى"],
  },
  {
    kind: "plain", label: "٢ · بلا خلفية",
    desc: "حبر على ورق — الأخف على رأس الطابعة.",
    lines: ["بالغوا بالدفاع عن وطنكم", "فالوطن عقيدة وكرامة وعزة لا تساوم،", "ولا تسمحوا لحاقد أو خائن أن ينال", "من أمنكم أو يشكّك في ولائكم", "فالأوطان لا تحيا إلا بأبنائها"],
  },
  {
    kind: "invert", label: "٣ · خلفية سوداء",
    desc: "نفس النص، كتلة سوداء ونص أبيض.",
    invert: true,
    lines: ["بالغوا بالدفاع عن وطنكم", "فالوطن عقيدة وكرامة وعزة لا تساوم،", "ولا تسمحوا لحاقد أو خائن أن ينال", "من أمنكم أو يشكّك في ولائكم", "فالأوطان لا تحيا إلا بأبنائها"],
  },
];

export default function ReceiptBannerPanel({ token }: { token: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [pending, setPending] = useState<Kind | null>(null);
  const [meta, setMeta] = useState<{ at: string | null; by: string | null }>({ at: null, by: null });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/receipt-banner", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) setError(String(j?.error || "تعذّر الجلب"));
        setKind((j?.kind as Kind) || "none");
        setPending((j?.kind as Kind) || "none");
        setMeta({ at: j?.updatedAt ?? null, by: j?.updatedBy ?? null });
      })
      .catch(() => setError("تعذّر الوصول للخادم"));
  }, [token]);

  async function save() {
    if (!pending || pending === kind) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/admin/receipt-banner", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: pending }),
      });
      const j = await res.json();
      if (!res.ok) { setError(String(j?.error || "لم يُحفظ")); return; }
      setKind(j.kind as Kind);
      setNote(j.kind === "none"
        ? "أُطفئ. يختفي من الفاتورة التالية في كل مطعم بعد تحديث الهوية على الجهاز."
        : "شُغّل. يظهر على فواتير كل المطاعم بعد تحديث الهوية على أجهزتهم.");
    } catch {
      setError("تعذّر الوصول للخادم");
    } finally {
      setBusy(false);
    }
  }

  if (kind === null && !error) return <p style={{ color: "#6B6B6B", padding: "1rem 0" }}>جاري الجلب…</p>;

  return (
    <div style={{ padding: "1rem 0" }}>
      {error && <p style={{ color: "#B0402C", background: "#FBEFEC", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>{error}</p>}
      {note && <p style={{ color: "#4F7A1A", background: "#F1F7E8", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>{note}</p>}

      <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.8, marginBottom: 18 }}>
        يُطبع تحت شعار المطعم وتحت سطره التعريفي، على فواتير كل المطاعم.
        نص لا صورة، فيخرج حادًا على الورق الحراري ولا يُثقل الطباعة.
        {kind && kind !== "none" && <strong style={{ color: "#B0402C" }}> شغّال الآن.</strong>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14, marginBottom: 20 }}>
        {CHOICES.map((c) => {
          const on = pending === c.kind;
          return (
            <button
              key={c.kind}
              onClick={() => setPending(c.kind)}
              style={{
                textAlign: "right", cursor: "pointer", padding: "14px 16px", borderRadius: 12,
                border: on ? "2px solid #7BAD0F" : "1px solid #D9D5CC",
                background: on ? "#F6FAEE" : "#fff",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 12.5, color: "#6B6B6B", lineHeight: 1.6, marginBottom: 10 }}>{c.desc}</div>
              <div style={{
                background: c.invert ? "#121212" : "#fff",
                color: c.invert ? "#fff" : "#121212",
                border: c.framed ? "2px solid #121212" : "1px solid #EDEAE3",
                borderRadius: c.framed ? 2 : 8, padding: "10px 8px", minHeight: 74,
                display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
              }}>
                {c.lines.length === 0
                  ? <div style={{ fontSize: 12, color: "#9A968C", textAlign: "center" }}>— لا شيء —</div>
                  : c.lines.map((l, i) => (
                      <div key={i} style={{
                        textAlign: "center",
                        fontSize: i === 0 ? 13 : 10.5,
                        fontWeight: i === 0 || i === c.lines.length - 1 ? 800 : 400,
                      }}>{l}</div>
                    ))}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={busy || pending === kind}
          style={{
            padding: "10px 22px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 15,
            background: pending === kind || busy ? "#D9D5CC" : "#121212",
            color: pending === kind || busy ? "#8A867E" : "#fff",
            cursor: pending === kind || busy ? "default" : "pointer",
          }}
        >
          {busy ? "جاري الحفظ…" : pending === "none" ? "أطفئ الشريط" : "شغّل هذا التصميم"}
        </button>
        {meta.at && (
          <span style={{ fontSize: 13, color: "#6B6B6B" }}>
            آخر تغيير: {new Date(meta.at).toLocaleString("ar-SA")}{meta.by ? ` — ${meta.by}` : ""}
          </span>
        )}
      </div>

      <p style={{ marginTop: 18, color: "#6B6B6B", fontSize: 13, lineHeight: 1.8 }}>
        التغيير يصل الأجهزة مع أول تحديث لهوية الفاتورة عندها — لا يحتاج نسخة جديدة من التطبيق ولا نشرًا للموقع.
        والأجهزة بلا إنترنت تطبع بآخر قيمة وصلتها.
      </p>
    </div>
  );
}
