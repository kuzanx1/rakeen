"use client";

import { useEffect, useState } from "react";

type Biz = { id: number; name: string; logo_url: string | null; business_type: string | null };

// «عملاء الهبوط»: which businesses' logos run in the customers strip on
// rakeenapp.com, and in what order. Saved to platform_settings via
// /api/admin/landing-clients; the landing reads it from /api/landing/clients.
export default function LandingClientsPanel({ token }: { token: string }) {
  const [all, setAll] = useState<Biz[] | null>(null);
  const [shown, setShown] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/admin/landing-clients", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setAll(d.businesses);
        setShown(d.shown);
        setSaved(d.shown);
      })
      .catch(() => setError("تعذر التحميل"));
  }, [token]);

  const byId = new Map((all || []).map((b) => [b.id, b]));
  const visible = shown.map((id) => byId.get(id)).filter((b): b is Biz => !!b);
  const hidden = (all || []).filter((b) => !shown.includes(b.id));
  const dirty = shown.join(",") !== saved.join(",");

  const toggle = (id: number) => {
    setDone(false);
    setShown((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const move = (i: number, d: -1 | 1) => {
    setDone(false);
    setShown((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/landing-clients", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shown }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "تعذر الحفظ");
      setShown(d.shown);
      setSaved(d.shown);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  if (error && !all) return <p style={s.err}>{error}</p>;
  if (!all) return <p style={s.muted}>جاري التحميل…</p>;

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={s.card}>
        <h3 style={s.h3}>عملاء صفحة الهبوط</h3>
        <p style={s.muted}>
          الشعارات اللي تتحرك في شريط «مطاعم وكافيهات تشتغل على ركين» في rakeenapp.com. الشعار يُقرأ من حساب المطعم نفسه، فإذا غيّره يتغير في الصفحة لحاله. التغيير يوصل الموقع خلال دقيقة.
        </p>

        {/* preview: what the strip shows, in order */}
        <div style={s.preview}>
          {visible.length ? (
            visible.map((b) => <img key={b.id} src={b.logo_url || ""} alt={b.name} title={b.name} style={s.prevImg} />)
          ) : (
            <span style={s.muted}>ما فيه ولا شعار ظاهر — الشريط بيختفي من الصفحة.</span>
          )}
        </div>

        <h4 style={s.h4}>يظهرون ({visible.length})</h4>
        {visible.length === 0 && <p style={s.muted}>اختر من تحت.</p>}
        {visible.map((b, i) => (
          <div key={b.id} style={s.row}>
            <img src={b.logo_url || ""} alt="" style={s.logo} />
            <b style={s.name}>{b.name}</b>
            <div style={s.actions}>
              <button style={s.icon} onClick={() => move(i, -1)} disabled={i === 0} aria-label="قبله">▲</button>
              <button style={s.icon} onClick={() => move(i, 1)} disabled={i === visible.length - 1} aria-label="بعده">▼</button>
              <button style={s.hide} onClick={() => toggle(b.id)}>أخفه</button>
            </div>
          </div>
        ))}

        <h4 style={s.h4}>مخفيين ({hidden.length})</h4>
        {hidden.map((b) => (
          <div key={b.id} style={{ ...s.row, opacity: b.logo_url ? 1 : 0.55 }}>
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ ...s.logo, filter: "grayscale(1)" }} /> : <span style={{ ...s.logo, display: "grid", placeItems: "center", fontSize: 11, color: "#8a8478" }}>بدون</span>}
            <b style={s.name}>{b.name}</b>
            <div style={s.actions}>
              {b.logo_url ? (
                <button style={s.show} onClick={() => toggle(b.id)}>أظهره</button>
              ) : (
                <span style={{ fontSize: 12, color: "#8a8478" }}>ما عنده شعار</span>
              )}
            </div>
          </div>
        ))}

        {error && <p style={s.err}>{error}</p>}
        <button style={{ ...s.save, opacity: busy || (!dirty && !done) ? 0.5 : 1 }} disabled={!dirty || busy} onClick={save}>
          {busy ? "جاري الحفظ…" : done && !dirty ? "✓ انحفظ" : "احفظ"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E7E3D8", borderRadius: 18, padding: 22 },
  h3: { fontSize: 17, fontWeight: 800, margin: 0 },
  h4: { fontSize: 13.5, fontWeight: 800, margin: "22px 0 8px", color: "#171717" },
  muted: { fontSize: 13, color: "#6b6559", lineHeight: 1.7, margin: "6px 0 0" },
  err: { fontSize: 13, color: "#B0402C", fontWeight: 700, marginTop: 12 },
  preview: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16, padding: 14, borderRadius: 14, background: "#F6F5F0", minHeight: 74, alignItems: "center" },
  prevImg: { width: 46, height: 46, borderRadius: 13, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.08)" },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #F0EDE4" },
  logo: { width: 40, height: 40, borderRadius: 11, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.08)", flex: "none" },
  name: { flex: 1, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", gap: 6, alignItems: "center" },
  icon: { width: 32, height: 32, borderRadius: 9, border: "1px solid #E7E3D8", background: "#fff", cursor: "pointer", fontSize: 11 },
  hide: { padding: "7px 14px", borderRadius: 999, border: "1px solid #E7E3D8", background: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" },
  show: { padding: "7px 14px", borderRadius: 999, border: "none", background: "#171717", color: "#C4FF2B", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" },
  save: { marginTop: 20, width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#171717", color: "#C4FF2B", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
};
