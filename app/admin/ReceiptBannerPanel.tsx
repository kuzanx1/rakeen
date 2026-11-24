"use client";

import { useEffect, useState } from "react";
import { BANNER_COPY } from "@/shared/receipt/banner";

/**
 * «شريط الفاتورة» -- ميزةٌ مؤقّتة تُشغَّل وتُطفأ لكلِّ المطاعم بضغطة.
 *
 * والإطفاءُ هو الزرُّ الأهمّ هنا، لا التشغيل: مناسبةٌ تنتهي ويبقى شريطُها
 * يُطبع شهراً بعدها هو العطبُ المتوقَّع. فـ«بلا شريط» أوّلُ الخيارات
 * ومعلَّمٌ بوضوح.
 *
 * والمعاينةُ بنصِّ المحرّك وخطِّه وزخرفته -- لا بنسخةٍ عنها: نصٌّ منسوخٌ
 * هنا يُعدَّل في الورقة ولا يُعدَّل في اللوحة، فيختار المالكُ تصميماً
 * ويُطبع غيرُه. (وهي علّةٌ وقعت في القوالب قبلُ، فكُتب لها
 * tools/accounting-checks/receipt-theme-sync.cjs.)
 */

type Kind = "none" | "shield" | "plain" | "invert";

/** شريطُ السدو كما يُطبع: مثلّثاتٌ على خطّ، بالـCSS هنا وبالنقاط هناك. */
function Sadu({ color, down }: { color: string; down?: boolean }) {
  const teeth = {
    height: 9,
    backgroundImage:
      `linear-gradient(${down ? "45deg" : "135deg"}, ${color} 50%, transparent 50%),` +
      `linear-gradient(${down ? "-45deg" : "-135deg"}, ${color} 50%, transparent 50%)`,
    backgroundSize: "18px 9px",
    backgroundPosition: down ? "top left" : "bottom left",
    backgroundRepeat: "repeat-x",
  } as const;
  const rule = { height: 2, background: color } as const;
  return (
    <div aria-hidden style={{ margin: "5px 0" }}>
      {down && <div style={rule} />}
      <div style={teeth} />
      {!down && <div style={rule} />}
    </div>
  );
}

function Diamond({ color }: { color: string }) {
  return (
    <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 7, margin: "6px 0" }}>
      <span style={{ flex: 1, height: 1, background: color }} />
      <span style={{ width: 7, height: 7, background: color, transform: "rotate(45deg)" }} />
      <span style={{ flex: 1, height: 1, background: color }} />
    </div>
  );
}

const SPEECH = [BANNER_COPY.speech.head, BANNER_COPY.speech.body, BANNER_COPY.speech.tail];

const CHOICES: Array<{ kind: Kind; label: string; desc: string; paper: string }> = [
  { kind: "none", label: "بلا شريط", desc: "الفاتورة كما هي — لا شيء يُطبع.", paper: "—" },
  { kind: "shield", label: "١ · إطار", desc: "الأقصر ورقًا — سطران داخل إطار مزدوج.", paper: "٢٦ ملم" },
  { kind: "plain", label: "٢ · بلا خلفية", desc: "حبر على ورق، بين شريطَي سدو.", paper: "٣٣ ملم" },
  { kind: "invert", label: "٣ · خلفية سوداء", desc: "نفس النص، كتلة سوداء ونص أبيض.", paper: "٣٩ ملم" },
];

/** ما يُرسم داخل البطاقة -- صورةٌ مصغّرةٌ عن الورقة، بترتيبها نفسِه. */
function Preview({ kind }: { kind: Kind }) {
  if (kind === "none") {
    return <div style={{ fontSize: 12, color: "#9A968C", textAlign: "center", padding: "28px 0" }}>— لا شيء —</div>;
  }
  const ink = kind === "invert" ? "#fff" : "#121212";
  const head = { fontFamily: "'RkDisplay', serif", fontWeight: 900, color: ink, textAlign: "center" } as const;
  const body = { fontFamily: "'RkDisplay', serif", fontWeight: 700, color: ink, textAlign: "center" } as const;

  if (kind === "shield") {
    return (
      <div style={{ border: `3px solid ${ink}`, padding: 3 }}>
        <div style={{ border: `1px solid ${ink}`, padding: "12px 10px" }}>
          <div style={{ ...head, fontSize: 21, lineHeight: 1.25 }}>{BANNER_COPY.shield.head}</div>
          <Diamond color={ink} />
          <div style={{ ...body, fontSize: 13 }}>{BANNER_COPY.shield.sub}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: kind === "invert" ? "#121212" : "transparent", padding: kind === "invert" ? "12px 10px" : 0 }}>
      <Sadu color={ink} />
      <div style={{ ...head, fontSize: 19, lineHeight: 1.3 }}>{SPEECH[0]}</div>
      <div style={{ ...body, fontSize: 11, lineHeight: 1.6, margin: "4px 0" }}>{SPEECH[1]}</div>
      <Diamond color={ink} />
      <div style={{ ...head, fontSize: 13 }}>{SPEECH[2]}</div>
      <Sadu color={ink} down />
    </div>
  );
}

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
        مرسوم على مقاس الطابعة نفسه — خط عرض وزخرفة سدو — فيخرج حادًا
        على الورق الحراري، ويضيق وحده على ورق ٥٨ ملم بدل أن يُقَصّ.
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
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{c.label}</span>
                <span style={{ fontSize: 11.5, color: "#857f72" }}>{c.paper === "—" ? "" : "يأكل " + c.paper}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "#6B6B6B", lineHeight: 1.6, marginBottom: 10 }}>{c.desc}</div>
              <div style={{
                background: "#fff", border: "1px solid #EDEAE3", borderRadius: 8,
                padding: "12px 10px", minHeight: 104,
                display: "flex", flexDirection: "column", justifyContent: "center",
              }}>
                <Preview kind={c.kind} />
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
