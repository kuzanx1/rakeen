"use client";

import { useEffect, useState } from "react";

type UsageMetric = {
  key: string;
  label: string;
  used: number;
  limit: number;
  pct: number;
  unit: "bytes" | "count" | "ms";
};

function fmtValue(n: number, unit: UsageMetric["unit"]): string {
  if (unit === "bytes") {
    if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} جيجا`;
    return `${(n / 1024 / 1024).toFixed(0)} ميجا`;
  }
  if (unit === "ms") return `${Math.round(n).toLocaleString()} مللي ثانية`;
  return n.toLocaleString();
}

function barColor(pct: number): string {
  if (pct >= 0.9) return "#B0402C";
  if (pct >= 0.7) return "#C9822C";
  return "#7BAD0F";
}

export default function UsagePanel({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<UsageMetric[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cloudflareConfigured, setCloudflareConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/admin/usage", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setMetrics(data.metrics);
        setWarnings(data.warnings || []);
        setCloudflareConfigured(!!data.cloudflareConfigured);
      })
      .catch(() => setError("تعذر تحميل بيانات الاستهلاك"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: "720px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: "#8a8375" }}>
          نفس الأرقام اللي فحصها آخر تشغيل للمراقبة الأسبوعية — تنبيه تلقائي لجوالك لو أي مقياس وصل ٧٠٪.
        </p>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: "999px", background: "#EDEADF", color: "#171717", fontWeight: 700, fontSize: "11.5px", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {loading ? "جاري التحديث..." : "تحديث"}
        </button>
      </div>

      {error && <p style={{ fontSize: "11.5px", fontWeight: 700, color: "#B0402C" }}>{error}</p>}

      {warnings.length > 0 && (
        <div style={{ background: "#FBEDEA", borderRadius: "12px", padding: "12px 14px", marginBottom: "16px" }}>
          {warnings.map((w, i) => (
            <p key={i} style={{ fontSize: "12px", fontWeight: 700, color: "#B0402C", margin: i > 0 ? "6px 0 0" : 0 }}>
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      {metrics && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {metrics.map((m) => (
            <div key={m.key} style={{ background: "#fff", borderRadius: "14px", padding: "14px 16px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800 }}>{m.label}</span>
                <span style={{ fontSize: "11.5px", fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: "#8a8375" }}>
                  {fmtValue(m.used, m.unit)} / {fmtValue(m.limit, m.unit)}
                </span>
              </div>
              <div style={{ height: "8px", borderRadius: "999px", background: "#EDEADF", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(m.pct * 100, 100)}%`, background: barColor(m.pct), borderRadius: "999px" }} />
              </div>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#8a8375", marginTop: "4px" }}>{(m.pct * 100).toFixed(1)}٪</div>
            </div>
          ))}
        </div>
      )}

      {!cloudflareConfigured && (
        <p style={{ fontSize: "11px", fontWeight: 600, color: "#8a8375", marginTop: "16px", lineHeight: 1.7 }}>
          مقاييس كلاود فلير (ووركرز و R2) غير مفعّلة — يحتاج توكن CLOUDFLARE_API_TOKEN.
        </p>
      )}
    </div>
  );
}
