"use client";

import { useEffect } from "react";

// A render crash inside the admin dashboard used to unmount everything and
// leave a blank white page. Show the error and a way out instead.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error("admin crashed", error); }, [error]);
  const clearAndReload = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage blocked */ }
    location.reload();
  };
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "#F6F4EC", color: "#171717", padding: 32, fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      <h2>صار خطأ في لوحة الإدارة</h2>
      <p>صوّر هذي الشاشة وأرسلها للدعم.</p>
      <pre dir="ltr" style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 16, borderRadius: 12, fontSize: 13 }}>
        {`${error?.name || "Error"}: ${error?.message || ""}${error?.digest ? `\ndigest: ${error.digest}` : ""}\n\n${(error?.stack || "").split("\n").slice(0, 6).join("\n")}\n\nBrowser: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`}
      </pre>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => retry()} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #171717", background: "#fff" }}>حاول مرة ثانية</button>
        <button onClick={clearAndReload} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#171717", color: "#fff" }}>سجّل خروج وأعد التحميل</button>
      </div>
    </div>
  );
}
