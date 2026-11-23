"use client";

import { useEffect, useState } from "react";

/**
 * «صحّة الطباعة» -- الرقمُ يجينا، ما نطلبه من العميل.
 *
 * أمضينا ليلةً نخمّن سرعةَ طابعةٍ لا نملكها، ولم نعرف أنّ تقديرَنا كان
 * يُجوّعها إلّا من فيديوٍ صوّره المالكُ بجوّاله. فما كان ينقصنا رقمان:
 * سرعةُ الكابل فعلاً (بايتاتٌ على زمن)، ومرّاتُ انقطاعِ الإرسال -- وهي
 * العلامةُ التي تسبق الفواتيرَ المشفَّرة.
 *
 * والمتعبةُ أعلى القائمة: اللوحةُ تُقرأ من فوق، فمن يحتاج نظرةً يكون
 * أوّلَ ما يُرى -- لا سطراً في آخر جدولٍ طويل.
 */

type Row = {
  day: string;
  business: string;
  businessId: number;
  branchId: number | null;
  device: string;
  printer: string;
  transportKind: string;
  client: string;
  appVersion: string;
  jobs: number;
  jobsFailed: number;
  truncations: number;
  paced: boolean;
  kbPerSecond: number | null;
  avgMs: number | null;
  maxMs: number;
  lastError: string | null;
  lastAt: string;
  trouble: boolean;
};

const KIND_LABEL: Record<string, string> = {
  usb: "USB", network: "شبكة", bluetooth: "بلوتوث", "": "—",
};

/** ما يُقال عن الرقم بكلمة. والحدودُ من قياسِ طابعةِ «كباب طارق»: رأسُها
 *  يبتلع ٤٢-٦٦ ك.ب/ث، وتهدئةُ ٢٧ كانت تُجوّعه. */
function speedNote(kb: number | null): { text: string; color: string } {
  if (kb == null) return { text: "—", color: "#6B6B6B" };
  if (kb >= 35) return { text: "سرعة الكابل", color: "#4F7A1A" };
  if (kb >= 20) return { text: "متوسطة", color: "#C9822C" };
  return { text: "بطيئة", color: "#B0402C" };
}

export default function PrintHealthPanel({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [troubleOnly, setTroubleOnly] = useState(false);

  function load(d: number) {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/print-health?days=${d}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json().then((j) => ({ ok: res.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setError(String(j?.error || "تعذّر الجلب")); setRows([]); return; }
        setRows((j?.rows || []) as Row[]);
      })
      .catch(() => setError("تعذّر الوصول للخادم"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const shown = (rows || []).filter((r) => !troubleOnly || r.trouble);
  const troubled = (rows || []).filter((r) => r.trouble).length;

  return (
    <div style={{ padding: "1rem 0" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D5CC", background: "#fff" }}
        >
          <option value={1}>اليوم</option>
          <option value={7}>آخر ٧ أيام</option>
          <option value={30}>آخر ٣٠ يوماً</option>
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" checked={troubleOnly} onChange={(e) => setTroubleOnly(e.target.checked)} />
          ما يحتاج نظرة فقط
        </label>
        <button
          onClick={() => load(days)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D9D5CC", background: "#fff", cursor: "pointer" }}
        >
          تحديث
        </button>
        {troubled > 0 && (
          <span style={{ fontSize: 14, color: "#B0402C", fontWeight: 500 }}>
            {troubled} طابعة تحتاج نظرة
          </span>
        )}
      </div>

      {loading && <p style={{ color: "#6B6B6B" }}>جاري الجلب…</p>}
      {error && (
        <p style={{ color: "#B0402C", background: "#FBEFEC", padding: "10px 14px", borderRadius: 8 }}>{error}</p>
      )}

      {!loading && !error && shown.length === 0 && (
        <p style={{ color: "#6B6B6B" }}>
          ما وصل شيء بعد. الأرقام تصعد من الأجهزة عند إغلاق الوردية، وعند أي انقطاع، وكل ٢٥ ورقة.
        </p>
      )}

      {shown.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, tableLayout: "fixed", minWidth: 880 }}>
            <thead>
              <tr style={{ textAlign: "right", color: "#6B6B6B", fontWeight: 400 }}>
                <th style={{ padding: "8px 6px", width: 92 }}>اليوم</th>
                <th style={{ padding: "8px 6px" }}>المطعم</th>
                <th style={{ padding: "8px 6px", width: 150 }}>الطابعة</th>
                <th style={{ padding: "8px 6px", width: 64 }}>النوع</th>
                <th style={{ padding: "8px 6px", width: 120 }}>السرعة</th>
                <th style={{ padding: "8px 6px", width: 70 }}>أوراق</th>
                <th style={{ padding: "8px 6px", width: 86 }}>انقطاع</th>
                <th style={{ padding: "8px 6px", width: 72 }}>النسخة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const note = speedNote(r.kbPerSecond);
                return (
                  <tr key={i} style={{ borderTop: "1px solid #EDEAE3", background: r.trouble ? "#FBEFEC" : undefined }}>
                    <td style={{ padding: "8px 6px", color: "#6B6B6B", whiteSpace: "nowrap" }}>{r.day}</td>
                    <td style={{ padding: "8px 6px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.business}
                      {r.branchId ? <span style={{ color: "#9A968C" }}> · فرع {r.branchId}</span> : null}
                    </td>
                    <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.printer || "—"}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{KIND_LABEL[r.transportKind] ?? r.transportKind}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {r.kbPerSecond == null ? (
                        <span style={{ color: "#9A968C" }}>—</span>
                      ) : (
                        <>
                          <span style={{ fontWeight: 500 }}>{r.kbPerSecond} ك.ب/ث</span>
                          <br />
                          <span style={{ color: note.color, fontSize: 12 }}>{note.text}</span>
                        </>
                      )}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      {r.jobs}
                      {r.jobsFailed > 0 && <span style={{ color: "#B0402C" }}> ({r.jobsFailed} أخفقت)</span>}
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      {r.truncations > 0 ? (
                        <span style={{ color: "#B0402C", fontWeight: 500 }}>
                          {r.truncations}{r.paced ? " · هدّأت نفسها" : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#9A968C" }}>لا شيء</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 6px", color: "#6B6B6B", whiteSpace: "nowrap" }}>
                      {r.appVersion || (r.client === "web" ? "ويب" : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 18, color: "#6B6B6B", fontSize: 13, lineHeight: 1.8 }}>
        السرعة = البايتات المُرسَلة على زمن الإرسال، وهي سرعة الكابل فعلاً — لا تقديراً.
        ورأس الطابعة الحراري يبتلع ٤٢–٦٦ ك.ب/ث، فما دونها بكثير يعني أن الكابل هو العائق لا الورق.
        و«انقطاع» هو إرسال توقّف في منتصفه، وهو العلامة التي تسبق الفواتير المشفَّرة؛ وعندها تهدّئ
        الطابعة نفسها تلقائياً.
      </p>
    </div>
  );
}
