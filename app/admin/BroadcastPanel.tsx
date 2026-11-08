"use client";

import { useEffect, useMemo, useState } from "react";
import { RAKEEN_UPDATES, type RakeenUpdate } from "@/app/dashboard/rakeen-updates";

// «رسائل واتساب»: الأدمن يكتب الرسالة مرّة، ويختار المستلمين، وكل ضغطة
// «إرسال» تفتح واتساب ويب عنده والرسالة جاهزة باسم المحل -- وهو يضغط Enter.
// ما فيه برنامج يرسل باسم الرقم (ميتا تحظره)، ولا كلفة. وتنحفظ في هذا
// المتصفح قائمة من وصلتهم نفس الرسالة، فما ينرسل لأحد مرتين بالغلط.

type Recipient = {
  key: string;
  kind: "business" | "signup" | "contract" | "contact";
  name: string;
  owner: string | null;
  plan: "asas" | "emad" | "sarh" | null;
  active: boolean;
  phone: string | null;
  source: string | null;
};

const PLAN_NAME: Record<string, string> = { asas: "أساس", emad: "عماد", sarh: "صرح" };
// مين يوصله: المشتركين (وتقسيمهم بالباقة)، واللي سجّلوا وما كمّلوا، وأصحاب
// العقود، واللي راسلوا واتساب ركين. زبائن المطاعم أنفسهم مو هنا عمداً:
// أرقامهم ملك المطعم، لا لركين.
const FILTERS: [string, string][] = [
  ["all", "الكل"], ["business", "المشتركين"], ["asas", "أساس"], ["emad", "عماد"], ["sarh", "صرح"],
  ["signup", "سجّلوا وما كمّلوا"], ["contract", "عقود"], ["contact", "راسلونا"],
];
const KIND_NAME: Record<string, string> = { signup: "سجّل وما كمّل", contract: "عقد", contact: "راسلنا" };
function matches(r: Recipient, f: string): boolean {
  if (f === "all") return true;
  if (f in PLAN_NAME) return r.kind === "business" && r.plan === f;
  return r.kind === f;
}
const DRAFT_KEY = "rk-bc-draft";

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function fill(msg: string, r: Recipient): string {
  return msg.replace(/\{المحل\}/g, r.name || "").replace(/\{الاسم\}/g, (r.owner || "").split(" ")[0] || "");
}
function waNumber(raw: string): string | null {
  const d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (/^05\d{8}$/.test(d)) return "966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "966" + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^00\d{9,14}$/.test(d)) return d.slice(2);
  if (/^[1-9]\d{9,14}$/.test(d)) return d;
  return null;
}
// تصميم البوست للحافظة: واتساب ويب يلصقه بـ Ctrl+V. الحافظة تقبل PNG فقط،
// فالـJPG يُرسم على canvas ويُحوّل.
async function posterPng(src: string): Promise<Blob> {
  const img = await createImageBitmap(await (await fetch(src)).blob());
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
}
// الصورة تُجهَّز مسبقاً (لحظة اختيار القالب) وتُنسخ قبل فتح واتساب: لو
// انفتح تبويب واتساب والصورة لسّا تتجهّز، الصفحة تفقد التركيز وChrome يرفض
// الكتابة للحافظة («Document is not focused») -- فتوصل الرسالة بلا صورة.
function copyPoster(png: Blob | Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
const TEMPLATES = RAKEEN_UPDATES.filter((u): u is RakeenUpdate & { whatsapp: string } => !!u.whatsapp);

function readJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* خاص */ }
}

const S = {
  card: { background: "var(--card, #fff)", border: "1px solid rgba(17,17,17,.1)", borderRadius: "14px", padding: "16px", marginBottom: "14px" } as React.CSSProperties,
  label: { fontSize: "13px", fontWeight: 800, marginBottom: "8px", display: "block" } as React.CSSProperties,
  muted: { fontSize: "12px", color: "#6B6B6B", fontWeight: 600 } as React.CSSProperties,
  chip: { border: "1px solid rgba(17,17,17,.18)", background: "transparent", borderRadius: "999px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } as React.CSSProperties,
  chipOn: { background: "#111", color: "#C4FF2B", borderColor: "#111" } as React.CSSProperties,
  btn: { background: "#111", color: "#C4FF2B", border: 0, borderRadius: "10px", padding: "9px 16px", fontSize: "13px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" } as React.CSSProperties,
  ghost: { background: "transparent", color: "inherit", border: "1px solid rgba(17,17,17,.2)", borderRadius: "10px", padding: "8px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" } as React.CSSProperties,
};

export default function BroadcastPanel({ token }: { token: string }) {
  const [list, setList] = useState<Recipient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("all");
  // الكل يظهر افتراضياً (حتى الموقوف: الرسالة لكل من سجّل)، والموقوف عليه شارة.
  const [activeOnly, setActiveOnly] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [poster, setPoster] = useState<string | null>(null);
  const [withPoster, setWithPoster] = useState(true);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [png, setPng] = useState<Blob | null>(null);
  useEffect(() => {
    setPng(null);
    if (!poster) return;
    let live = true;
    posterPng(poster).then((b) => { if (live) setPng(b); }, () => {});
    return () => { live = false; };
  }, [poster]);

  useEffect(() => {
    setMsg(readJson(DRAFT_KEY, "السلام عليكم {الاسم} 👋\nجديد ركين لـ{المحل}:\n\n"));
    fetch("/api/admin/broadcast-recipients", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setList(d.recipients)))
      .catch(() => setError("تعذر تحميل القائمة"));
  }, [token]);

  // سجل «وصلته» مربوط بنص الرسالة: رسالة جديدة = سجل جديد.
  const sentKey = "rk-bc-sent:" + hash(msg.trim());
  useEffect(() => { setSent(new Set(readJson<string[]>(sentKey, []))); }, [sentKey]);
  // يُحفظ فوراً (لا تأخير): تبويبٌ يُقفل بعد الكتابة مباشرة ما يضيّع المسودة.
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => { if (draftLoaded) writeJson(DRAFT_KEY, msg); else if (msg) setDraftLoaded(true); }, [msg, draftLoaded]);

  const phoneOf = (r: Recipient) => r.phone || waNumber(typed[r.key] || "");
  const shown = useMemo(() => (list || []).filter((r) =>
    (!activeOnly || r.active) &&
    matches(r, filter) &&
    (!q.trim() || `${r.name} ${r.owner || ""} ${r.phone || ""}`.includes(q.trim()))), [list, filter, activeOnly, q]);
  const queue = (list || []).filter((r) => picked.has(r.key) && phoneOf(r) && !sent.has(r.key));
  const next = queue[0] || null;

  function markSent(id: string) {
    const s = new Set(sent); s.add(id); setSent(s); writeJson(sentKey, [...s]);
  }
  async function send(r: Recipient) {
    const phone = phoneOf(r);
    if (!phone || !msg.trim()) return;
    markSent(r.key);
    if (poster && withPoster) {
      // ننتظر النسخ (أجزاء من الثانية والصورة جاهزة) ثم نفتح واتساب؛ الضغطة
      // تبقى صالحة لفتح التبويب خلال هالمدة.
      try { await copyPoster(png || posterPng(poster)); setCopied("ok"); } catch { setCopied("fail"); }
    }
    // نفس التبويب كل مرة (rk-wa): ما تتكدّس عشرات التبويبات.
    window.open(`https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(fill(msg, r))}`, "rk-wa");
  }
  function toggle(id: string) {
    const s = new Set(picked); if (s.has(id)) s.delete(id); else s.add(id); setPicked(s);
  }
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.key));

  if (error) return <p style={{ color: "#B0402C", fontWeight: 700 }}>{error}</p>;
  if (!list) return <p style={S.muted}>جاري التحميل…</p>;

  const sample = list.find((r) => picked.has(r.key)) || shown[0];

  return (
    <div style={{ maxWidth: "860px" }}>
      <div style={S.card}>
        <label style={S.label} htmlFor="bcTpl">قالب جاهز</label>
        <select id="bcTpl" defaultValue="" onChange={(e) => {
          const u = TEMPLATES.find((t) => t.id === e.target.value);
          setMsg(u ? u.whatsapp : "");
          setPoster(u?.poster || null);
          setCopied("");
        }} style={{ width: "100%", borderRadius: "10px", border: "1px solid rgba(17,17,17,.18)", padding: "10px 12px", fontSize: "14px", fontFamily: "inherit", marginBottom: "14px", background: "transparent", color: "inherit" }}>
          <option value="">رسالة من عندي</option>
          {TEMPLATES.map((u) => <option key={u.id} value={u.id}>{u.date} — {u.title}</option>)}
        </select>
        <label style={S.label} htmlFor="bcMsg">الرسالة</label>
        <textarea id="bcMsg" value={msg} onChange={(e) => setMsg(e.target.value)} rows={7}
          style={{ width: "100%", boxSizing: "border-box", borderRadius: "10px", border: "1px solid rgba(17,17,17,.18)", padding: "12px", fontSize: "14px", lineHeight: 1.7, fontFamily: "inherit", resize: "vertical" }} />
        <p style={{ ...S.muted, marginTop: "6px" }}>
          {"{الاسم}"} = الاسم الأول للمالك · {"{المحل}"} = اسم المحل. تنحفظ المسودة في هذا المتصفح.
        </p>
        {sample && msg.trim() ? (
          <div style={{ marginTop: "12px", background: "#DCF8C6", color: "#111", borderRadius: "12px 12px 4px 12px", padding: "10px 12px", whiteSpace: "pre-wrap", fontSize: "13.5px", lineHeight: 1.7, maxWidth: "460px" }}>
            {fill(msg, sample)}
            <div style={{ ...S.muted, marginTop: "4px", fontSize: "11px" }}>معاينة — {sample.name}</div>
          </div>
        ) : null}
        {poster ? (
          <div style={{ marginTop: "14px", display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poster} alt="تصميم التحديث" style={{ width: "150px", borderRadius: "10px", boxShadow: "0 6px 18px rgba(17,17,17,.18)" }} />
            <div style={{ flex: "1 1 220px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, fontSize: "13.5px", cursor: "pointer" }}>
                <input type="checkbox" checked={withPoster} onChange={(e) => setWithPoster(e.target.checked)} /> أرسل التصميم مع الرسالة
              </label>
              <p style={{ ...S.muted, marginTop: "6px", lineHeight: 1.7 }}>
                مع كل «إرسال» ينتسخ التصميم. في واتساب اضغط <b>Ctrl+V</b> أول (تنلصق الصورة)، ثم <b>Enter</b>. ولو بقي نص الرسالة في الخانة، <b>Enter</b> مرة ثانية.
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <button type="button" style={S.ghost} onClick={() => copyPoster(png || posterPng(poster)).then(() => setCopied("ok"), () => setCopied("fail"))}>انسخ التصميم</button>
                <a href={poster} download style={{ ...S.ghost, textDecoration: "none", display: "inline-block" }}>نزّله</a>
              </div>
              {copied === "ok" ? <p style={{ ...S.muted, color: "#4C7A0A", marginTop: "6px" }}>انتسخ ✓ — الصقه بـ Ctrl+V</p> : null}
              {copied === "fail" ? <p style={{ ...S.muted, color: "#B0402C", marginTop: "6px" }}>المتصفح ما سمح بالنسخ — نزّله وأرفقه بيدك.</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
          {FILTERS.map(([k, t]) => (
            <button key={k} type="button" style={{ ...S.chip, ...(filter === k ? S.chipOn : {}) }} onClick={() => setFilter(k)}>{t}</button>
          ))}
          <label style={{ ...S.muted, display: "inline-flex", alignItems: "center", gap: "6px", marginInlineStart: "auto", cursor: "pointer" }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> اخفِ الموقوفين
          </label>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <input placeholder="بحث بالاسم أو الرقم" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 200px", borderRadius: "10px", border: "1px solid rgba(17,17,17,.18)", padding: "9px 12px", fontSize: "13px", fontFamily: "inherit" }} />
          <button type="button" style={S.ghost} onClick={() => {
            const s = new Set(picked);
            shown.forEach((r) => (allShownPicked ? s.delete(r.key) : (phoneOf(r) || !r.phone) && s.add(r.key)));
            setPicked(s);
          }}>{allShownPicked ? "إلغاء تحديد الظاهرين" : `حدّد الظاهرين (${shown.length})`}</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {shown.map((r) => {
            const phone = phoneOf(r);
            const done = sent.has(r.key);
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: picked.has(r.key) ? "rgba(196,255,43,.16)" : "rgba(17,17,17,.03)", flexWrap: "wrap" }}>
                <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={r.name} />
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "14px" }}>
                    {r.name}
                    {r.plan ? <span style={{ marginInlineStart: "8px", background: "#111", color: "#C4FF2B", borderRadius: "999px", padding: "1px 8px", fontSize: "11px" }}>{PLAN_NAME[r.plan]}</span> : null}
                    {KIND_NAME[r.kind] ? <span style={{ marginInlineStart: "8px", border: "1px solid rgba(17,17,17,.25)", borderRadius: "999px", padding: "0 8px", fontSize: "11px", fontWeight: 700 }}>{KIND_NAME[r.kind]}</span> : null}
                    {!r.active ? <span style={{ ...S.muted, marginInlineStart: "8px" }}>موقوف</span> : null}
                  </div>
                  <div style={S.muted}>{r.owner || "—"}{r.source ? ` · ${r.source}` : ""}</div>
                </div>
                {r.phone ? (
                  <span dir="ltr" style={{ fontSize: "13px", fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>+{r.phone}</span>
                ) : (
                  <input dir="ltr" placeholder="ما فيه رقم — اكتبه" value={typed[r.key] || ""} onChange={(e) => setTyped({ ...typed, [r.key]: e.target.value })}
                    style={{ width: "150px", borderRadius: "8px", border: "1px solid rgba(17,17,17,.2)", padding: "6px 8px", fontSize: "12.5px", fontFamily: "inherit" }} />
                )}
                {done ? (
                  <button type="button" style={{ ...S.ghost, color: "#4C7A0A", borderColor: "rgba(76,122,10,.4)" }} title="أُرسلت له هذي الرسالة — اضغط لإرسالها مرة ثانية" onClick={() => send(r)}>✓ أُرسلت</button>
                ) : (
                  <button type="button" style={{ ...S.btn, opacity: phone && msg.trim() ? 1 : 0.35 }} disabled={!phone || !msg.trim()} onClick={() => send(r)}>إرسال</button>
                )}
              </div>
            );
          })}
          {!shown.length ? <p style={S.muted}>ما فيه أحد بهالتصفية.</p> : null}
        </div>
      </div>

      {picked.size ? (
        <div style={{ ...S.card, position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", boxShadow: "0 10px 30px rgba(17,17,17,.12)" }}>
          <div style={{ flex: "1 1 200px" }}>
            <div style={{ fontWeight: 800 }}>{next ? `التالي: ${next.name}` : "خلصت المحددين ✓"}</div>
            <div style={S.muted}>باقي {queue.length} من {picked.size} محدد · كل ضغطة تفتح واتساب ويب والرسالة جاهزة{poster && withPoster ? "" : "، اضغط Enter هناك ثم ارجع هنا"}.</div>
            {poster && withPoster ? (
              // واتساب ويب ما يقبل صورة في الرابط: الصورة لازم تنلصق باليد.
              <div style={{ marginTop: "8px", fontSize: "13.5px", fontWeight: 800, lineHeight: 1.7, color: copied === "fail" ? "#B0402C" : "#111", background: copied === "fail" ? "rgba(176,64,44,.08)" : "rgba(196,255,43,.35)", borderRadius: "10px", padding: "8px 12px" }}>
                {copied === "fail"
                  ? "المتصفح ما سمح بنسخ الصورة — نزّلها من فوق وأرفقها بيدك."
                  : <>📋 الصورة تنسخ لحالها — بواتساب: <span dir="ltr">Ctrl+V</span> ثم Enter. ولو بقي النص بالخانة: Enter مرة ثانية.</>}
              </div>
            ) : null}
          </div>
          {next ? <button type="button" style={S.btn} disabled={!msg.trim()} onClick={() => send(next)}>افتح واتساب للتالي</button> : null}
          {sent.size ? <button type="button" style={S.ghost} onClick={() => { setSent(new Set()); writeJson(sentKey, []); }}>مسح سجل الإرسال</button> : null}
        </div>
      ) : null}
    </div>
  );
}
