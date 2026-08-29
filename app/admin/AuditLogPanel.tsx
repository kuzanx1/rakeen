"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: number;
  actor_email: string;
  action: string;
  target: string | null;
  result: "success" | "failure";
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// M5 (security hardening phase 2) — read-only view of admin_audit_log.
// No admin action anywhere (owner-credential resets, business
// approval/rejection, deletion, branding changes) left any record of who
// did what before this existed. There is deliberately no way to edit or
// delete an entry from this UI — the audit trail is only ever written by
// the server (lib/adminAuth.ts's logAdminAction, service role only).
export default function AuditLogPanel({ token }: { token: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/admin/audit-log", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setEntries(data.entries);
      })
      .catch(() => setError("تعذر تحميل سجل التدقيق"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: "#8a8375" }}>آخر ٢٠٠ إجراء إداري حساس — من، ماذا، ومتى.</p>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: "999px", background: "#EDEADF", color: "#171717", fontWeight: 700, fontSize: "11.5px", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {loading ? "جاري التحديث..." : "تحديث"}
        </button>
      </div>

      {error && <p style={{ fontSize: "11.5px", fontWeight: 700, color: "#B0402C" }}>{error}</p>}

      {entries && entries.length === 0 && <p style={{ fontSize: "12.5px", color: "#8a8375" }}>لا يوجد إجراءات مسجّلة بعد.</p>}

      {entries && entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {entries.map((e) => (
            <div
              key={e.id}
              style={{
                background: "#fff",
                borderRadius: "12px",
                padding: "12px 14px",
                boxShadow: "0 4px 14px rgba(23,23,23,0.06)",
                borderInlineStart: `4px solid ${e.result === "success" ? "#7BAD0F" : "#B0402C"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", fontWeight: 800 }}>
                <span>{e.action}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "11px", color: "#8a8375" }}>
                  {new Date(e.created_at).toLocaleString("ar-SA")}
                </span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#8a8375", marginTop: "4px" }}>
                {e.actor_email} {e.target ? `— ${e.target}` : ""} — {e.result === "success" ? "نجح" : "فشل"}
              </div>
              {e.metadata && (
                <pre style={{ fontSize: "10.5px", color: "#a39d8f", marginTop: "6px", whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Mono',monospace" }}>
                  {JSON.stringify(e.metadata)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
