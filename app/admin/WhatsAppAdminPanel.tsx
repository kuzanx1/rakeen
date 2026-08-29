"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Conversation = {
  id: number;
  business_id: number | null;
  customer_phone: string;
  customer_name: string | null;
  admin_label: string | null;
  last_message_preview: string | null;
  mode: "ai" | "human";
  last_message_at: string;
  businesses: { name: string } | null;
};

type Message = {
  id: number;
  direction: "inbound" | "outbound";
  sender: "customer" | "ai" | "staff";
  message_type: string;
  body: string | null;
  media_id: string | null;
  wa_message_id: string | null;
  raw: { context?: { id?: string } } | null;
  created_at: string;
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  interactive_button: "🔘 اختيار من أزرار",
  interactive_list: "📋 اختيار من قائمة",
  image: "📷 صورة",
  document: "📄 مستند",
  template: "قالب رسالة",
  unknown: "رسالة غير مدعومة",
};

// A short, hand-picked set covering the reactions/acknowledgements a support
// reply actually needs — not a full emoji library (no dependency for that,
// matching this codebase's convention of small hand-authored UI over
// external packages).
const QUICK_EMOJIS = ["👍", "🙏", "😊", "❤️", "✅", "❌", "🎉", "🔥", "😢", "👋", "🤔", "⏳", "📌", "💡", "⭐", "🙌"];

// A handful of muted, distinct hues for avatar circles — picked to sit
// comfortably next to the site's lime accent without competing with it.
const AVATAR_COLORS = ["#5B7BB0", "#B0714A", "#6A9A6E", "#9A6AA0", "#B0555B", "#6E8F9A", "#A08A4A"];
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function displayName(c: Pick<Conversation, "admin_label" | "customer_name" | "businesses">): string | null {
  return c.admin_label || c.customer_name || c.businesses?.name || null;
}
function avatarLetter(c: Pick<Conversation, "admin_label" | "customer_name" | "businesses">): string {
  const name = displayName(c);
  return name ? name.trim().charAt(0).toUpperCase() : "#";
}

function formatListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
}
function formatDaySeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "اليوم";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
}

const SENDER_TAG: Record<string, string> = { ai: "🤖 رد آلي", staff: "👤 فريق ركين" };

// WhatsApp media has no permanent public URL — /api/admin/whatsapp/media
// proxies it on demand using the admin's own session (a header, not a query
// param, so the token never lands in an <img src> or browser history). This
// fetches it as a blob rather than pointing an <img> straight at the route,
// since an <img> tag can't carry an Authorization header.
function AuthedMedia({ mediaId, token, kind }: { mediaId: string; token: string; kind: "image" | "document" }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    fetch(`/api/admin/whatsapp/media/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error(); return res.blob(); })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setObjectUrl(url);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [mediaId, token]);

  if (failed) return <div style={styles.mediaFailed}>تعذر تحميل الملف</div>;
  if (!objectUrl) return <div style={styles.mediaLoading}>جارٍ تحميل {kind === "image" ? "الصورة" : "الملف"}...</div>;
  if (kind === "image") {
    return <img src={objectUrl} alt="صورة مرسلة" style={styles.mediaImage} onClick={() => window.open(objectUrl, "_blank")} />;
  }
  return (
    <a href={objectUrl} target="_blank" rel="noopener noreferrer" style={styles.mediaDocLink}>
      📄 فتح المستند
    </a>
  );
}

// Rakeen's own WhatsApp support desk — every conversation from every
// registered client + every prospect, across all restaurants. Not scoped to
// any one tenant, so it lives here in the platform-admin console rather than
// inside any restaurant's own dashboard. Deliberately styled to feel like
// the WhatsApp app itself (list ↔ full-screen thread on mobile, bubbles,
// avatars, day separators) since the owner reads this almost entirely from
// his phone and the old side-by-side desktop layout was unusable there.
export default function WhatsAppAdminPanel({ token }: { token: string }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const threadBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  async function loadConversations() {
    setLoadError(null);
    const res = await fetch("/api/admin/whatsapp/conversations", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setLoadError(data?.error || "تعذر التحميل"); return; }
    setConversations(data.conversations);
  }

  // silent=true skips the "جارٍ التحميل..." reset — used for the background
  // poll of an already-open thread and right after sending, so new messages
  // just appear instead of the whole thread flashing empty and losing its
  // scroll position (that flash was why a customer's reply while the admin
  // was already looking at the thread required leaving and re-opening it).
  async function loadMessages(conversationId: number, opts: { silent?: boolean } = {}) {
    if (!opts.silent) setMessages(null);
    const res = await fetch(`/api/admin/whatsapp/messages?conversationId=${conversationId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (res.ok) setMessages(data.messages);
  }

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    // Keeps an open thread live — a reply the customer sends while the admin
    // is already reading this conversation shows up on its own.
    const interval = setInterval(() => loadMessages(selectedId, { silent: true }), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // A plain scrollTo(scrollHeight) can fire before the new bubbles have
  // actually been painted (stale height), which is what let the thread
  // settle scrolled to the top instead of the newest message at the bottom.
  // Reading the sentinel's real position after two animation frames — one
  // for the DOM commit, one for layout/paint — is reliable where a single
  // effect tick wasn't.
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        threadBottomRef.current?.scrollIntoView({ block: "end" });
      });
    });
  }, [messages, selectedId]);

  const selected = conversations?.find((c) => c.id === selectedId) || null;

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/whatsapp/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: selectedId, text: replyText.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { alert(data?.error || "تعذر الإرسال"); return; }
      setReplyText("");
      await Promise.all([loadMessages(selectedId, { silent: true }), loadConversations()]);
    } finally {
      setSending(false);
    }
  }

  async function toggleMode() {
    if (!selectedId || !selected) return;
    setTogglingMode(true);
    try {
      const newMode = selected.mode === "human" ? "ai" : "human";
      const res = await fetch("/api/admin/whatsapp/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: selectedId, mode: newMode }),
      });
      if (!res.ok) { alert("تعذر التحديث"); return; }
      await loadConversations();
    } finally {
      setTogglingMode(false);
    }
  }

  function startEditingLabel() {
    setLabelDraft(selected?.admin_label || "");
    setEditingLabel(true);
  }

  async function saveLabel() {
    if (!selectedId) return;
    setSavingLabel(true);
    try {
      const res = await fetch("/api/admin/whatsapp/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId: selectedId, label: labelDraft.trim() || null }),
      });
      if (!res.ok) { alert("تعذر الحفظ"); return; }
      setConversations((prev) => prev && prev.map((c) => (c.id === selectedId ? { ...c, admin_label: labelDraft.trim() || null } : c)));
      setEditingLabel(false);
    } finally {
      setSavingLabel(false);
    }
  }

  // Group messages into day buckets so a date separator can be rendered
  // between them, matching how the real WhatsApp app breaks up a long
  // thread instead of one unbroken scroll of bubbles.
  const dayGroups = useMemo(() => {
    if (!messages) return [];
    const groups: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = new Date(m.created_at).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [messages]);

  // A WhatsApp reply/quote carries the original message's wa_message_id in
  // raw.context.id — since the whole thread is already loaded, resolving
  // that back to the quoted message's own text is just a lookup, no extra
  // fetch needed.
  const messagesByWaId = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages || []) if (m.wa_message_id) map.set(m.wa_message_id, m);
    return map;
  }, [messages]);

  function insertEmoji(emoji: string) {
    setReplyText((prev) => prev + emoji);
  }

  const showList = !isMobile || !selected;
  const showThread = !isMobile || !!selected;

  return (
    <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? "1fr" : "300px 1fr" }}>
      {showList && (
        <div style={{ ...styles.listPane, ...(isMobile ? styles.paneMobile : {}) }}>
          <div style={styles.listHeader}>المحادثات</div>
          {loadError && <p style={{ padding: "12px 16px", color: "#B0402C", fontSize: "12px" }}>{loadError}</p>}
          <div style={styles.list}>
            {(conversations || []).map((c) => {
              const name = displayName(c);
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)} style={{ ...styles.convItem, background: c.id === selectedId && !isMobile ? "#F3F5EA" : "transparent" }}>
                  <div style={{ ...styles.avatar, background: avatarColor(c.customer_phone) }}>{avatarLetter(c)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={styles.convTopRow}>
                      <span style={styles.convName}>{name || c.customer_phone}</span>
                      <span style={styles.convTime}>{formatListTime(c.last_message_at)}</span>
                    </div>
                    <div style={styles.convBottomRow}>
                      <span style={styles.convPreview}>{c.last_message_preview || "—"}</span>
                      <span style={{ ...styles.dot, background: c.mode === "human" ? "#B0402C" : "#3C4EBE" }} title={c.mode === "human" ? "دعم بشري" : "آلي"} />
                    </div>
                    {name && (
                      <div style={{ fontSize: "10.5px", color: "#a8a196", direction: "ltr", textAlign: "right", marginTop: "1px" }}>{c.customer_phone}</div>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      <span style={{ ...styles.badge, background: c.businesses ? "#EAF3DB" : "#F1EEE4", color: c.businesses ? "#4d6b0c" : "#8a8375" }}>
                        {c.businesses ? c.businesses.name : "غير مسجّل"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            {conversations && conversations.length === 0 && <p style={{ padding: "16px", fontSize: "12px", color: "#8a8375" }}>ما فيه محادثات بعد</p>}
          </div>
        </div>
      )}

      {showThread && (
        <div style={{ ...styles.threadPane, ...(isMobile ? styles.paneMobile : {}) }}>
          {!selected && <div style={styles.emptyState}>اختر محادثة من القائمة</div>}
          {selected && (
            <>
              <div style={styles.threadHeader}>
                {isMobile && (
                  <button style={styles.backBtn} onClick={() => setSelectedId(null)} aria-label="رجوع للمحادثات">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                )}
                <div style={{ ...styles.avatar, background: avatarColor(selected.customer_phone), width: "38px", height: "38px", fontSize: "15px" }}>
                  {avatarLetter(selected)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!editingLabel && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ fontWeight: 800, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName(selected) || selected.customer_phone}
                      </div>
                      <button style={styles.editLabelBtn} onClick={startEditingLabel} aria-label="تعديل الاسم">✎</button>
                    </div>
                  )}
                  {editingLabel && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        autoFocus
                        style={styles.labelInput}
                        placeholder="اسم مخصص لهذا الرقم"
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                      />
                      <button style={styles.labelSaveBtn} onClick={saveLabel} disabled={savingLabel}>حفظ</button>
                      <button style={styles.labelCancelBtn} onClick={() => setEditingLabel(false)}>إلغاء</button>
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "#8a8375", direction: "ltr", textAlign: "right" }}>
                    {selected.customer_phone} {selected.businesses ? `— ${selected.businesses.name}` : "— غير مسجّل"}
                  </div>
                </div>
                <button style={styles.toggleBtn} onClick={toggleMode} disabled={togglingMode}>
                  {selected.mode === "human" ? "إرجاع للنظام الآلي" : "استلام"}
                </button>
              </div>

              <div style={styles.threadBody}>
                {dayGroups.map((group) => (
                  <div key={group.day}>
                    <div style={styles.daySeparatorWrap}>
                      <span style={styles.daySeparator}>{formatDaySeparator(group.items[0].created_at)}</span>
                    </div>
                    {group.items.map((m) => {
                      const quotedId = m.raw?.context?.id;
                      const quoted = quotedId ? messagesByWaId.get(quotedId) : undefined;
                      return (
                        <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.direction === "inbound" ? "flex-start" : "flex-end", marginBottom: "8px" }}>
                          {m.direction === "outbound" && (
                            <span style={styles.senderTag}>{SENDER_TAG[m.sender] || ""}</span>
                          )}
                          <div style={{ ...styles.bubble, background: m.direction === "inbound" ? "#fff" : "#DCF8C6", border: m.direction === "inbound" ? "1px solid rgba(23,23,23,0.08)" : "none" }}>
                            {quotedId && (
                              <div style={styles.quoteBox}>
                                <div style={styles.quoteBoxText}>
                                  {quoted ? (quoted.body || MESSAGE_TYPE_LABELS[quoted.message_type] || quoted.message_type) : "رسالة سابقة"}
                                </div>
                              </div>
                            )}
                            {m.message_type === "image" && m.media_id && <AuthedMedia mediaId={m.media_id} token={token} kind="image" />}
                            {m.message_type === "document" && m.media_id && <AuthedMedia mediaId={m.media_id} token={token} kind="document" />}
                            {m.body && <div style={{ whiteSpace: "pre-wrap", marginTop: m.message_type === "image" && m.media_id ? "6px" : 0 }}>{m.body}</div>}
                            {!m.body && !(m.media_id && (m.message_type === "image" || m.message_type === "document")) && (
                              <div style={{ whiteSpace: "pre-wrap" }}>{MESSAGE_TYPE_LABELS[m.message_type] || m.message_type}</div>
                            )}
                            <div style={{ fontSize: "9.5px", opacity: 0.55, marginTop: "4px", direction: "ltr", textAlign: "right" }}>
                              {new Date(m.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {messages === null && <p style={{ color: "#8a8375", fontSize: "12px" }}>جارٍ التحميل...</p>}
                <div ref={threadBottomRef} />
              </div>

              {showEmojiPicker && (
                <div style={styles.emojiPanel}>
                  {QUICK_EMOJIS.map((e) => (
                    <button key={e} type="button" style={styles.emojiBtn} onClick={() => insertEmoji(e)}>{e}</button>
                  ))}
                </div>
              )}
              <form
                style={styles.replyRow}
                onSubmit={(e) => { e.preventDefault(); setShowEmojiPicker(false); sendReply(); }}
              >
                <button type="button" style={styles.emojiToggleBtn} onClick={() => setShowEmojiPicker((v) => !v)} aria-label="الرموز التعبيرية">
                  😊
                </button>
                <input
                  style={styles.replyInput}
                  placeholder="اكتب رد..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  enterKeyHint="send"
                />
                <button type="submit" style={{ ...styles.sendBtn, opacity: sending || !replyText.trim() ? 0.5 : 1 }} disabled={sending || !replyText.trim()} aria-label="إرسال">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ transform: "scaleX(-1)" }}><path d="M3 20l18-8L3 4v6l12 2-12 2v6z" /></svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: "grid", gap: "16px", height: "calc(100dvh - 220px)", minHeight: "480px" },
  // On mobile, the panel breaks out of AdminDashboard's page padding
  // (32px/20px) so the list/thread go edge-to-edge like a real app screen
  // instead of floating as a cramped card.
  paneMobile: { margin: "0 -20px", borderRadius: 0, height: "calc(100dvh - 190px)" },
  listPane: { background: "#fff", borderRadius: "16px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" },
  listHeader: { padding: "14px 16px", fontWeight: 800, fontSize: "13px", borderBottom: "1px solid rgba(23,23,23,0.08)" },
  list: { flex: 1, overflowY: "auto" },
  convItem: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "10px", width: "100%", padding: "12px 16px", border: "none", borderBottom: "1px solid rgba(23,23,23,0.06)", textAlign: "right", cursor: "pointer" },
  avatar: { width: "44px", height: "44px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "17px" },
  convTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  convName: { fontWeight: 800, fontSize: "13.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  convTime: { fontSize: "10.5px", color: "#a8a196", flexShrink: 0 },
  convBottomRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "2px" },
  convPreview: { fontSize: "12px", color: "#8a8375", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  badge: { fontSize: "9.5px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" },
  threadPane: { background: "#fff", borderRadius: "16px", boxShadow: "0 4px 14px rgba(23,23,23,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" },
  emptyState: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8375", fontSize: "12.5px" },
  threadHeader: { display: "flex", justifyContent: "flex-start", alignItems: "center", gap: "10px", padding: "12px 16px", borderBottom: "1px solid rgba(23,23,23,0.08)" },
  backBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "transparent", color: "#171717", cursor: "pointer", flexShrink: 0 },
  editLabelBtn: { border: "none", background: "transparent", color: "#8a8375", fontSize: "12px", cursor: "pointer", padding: "2px 4px" },
  labelInput: { flex: 1, padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(23,23,23,0.15)", fontSize: "16px", fontFamily: "inherit" },
  labelSaveBtn: { padding: "6px 12px", borderRadius: "8px", border: "none", background: "#171717", color: "#C4FF2B", fontWeight: 700, fontSize: "11.5px", cursor: "pointer" },
  labelCancelBtn: { padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(23,23,23,0.15)", background: "transparent", fontWeight: 700, fontSize: "11.5px", cursor: "pointer" },
  toggleBtn: { padding: "8px 12px", borderRadius: "999px", border: "1px solid rgba(23,23,23,0.15)", background: "transparent", fontWeight: 800, fontSize: "10.5px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  threadBody: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", background: "#F4F1E9" },
  daySeparatorWrap: { display: "flex", justifyContent: "center", margin: "10px 0" },
  daySeparator: { fontSize: "10.5px", fontWeight: 700, color: "#8a8375", background: "#fff", padding: "4px 12px", borderRadius: "999px", boxShadow: "0 1px 2px rgba(23,23,23,0.06)" },
  senderTag: { fontSize: "9.5px", fontWeight: 700, color: "#8a8375", marginBottom: "2px", marginInline: "4px" },
  bubble: { maxWidth: "78%", padding: "8px 12px", borderRadius: "12px", fontSize: "13px", lineHeight: 1.5, boxShadow: "0 1px 1px rgba(23,23,23,0.05)" },
  replyRow: { display: "flex", gap: "10px", padding: "12px 14px", borderTop: "1px solid rgba(23,23,23,0.08)", background: "#fff" },
  // 16px is the line iOS Safari uses to decide whether to auto-zoom the
  // whole page on focus — anything smaller (the 13px used elsewhere in this
  // panel) triggers that zoom, which is what was throwing the layout off
  // and pushing the send button out of view on mobile.
  replyInput: { flex: 1, padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(23,23,23,0.15)", background: "#FBFAF5", fontSize: "16px", fontFamily: "inherit" },
  sendBtn: { width: "42px", height: "42px", flexShrink: 0, borderRadius: "50%", border: "none", background: "#171717", color: "#C4FF2B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  emojiToggleBtn: { width: "38px", height: "38px", flexShrink: 0, borderRadius: "50%", border: "none", background: "transparent", fontSize: "19px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  emojiPanel: { display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "4px", padding: "10px 14px", borderTop: "1px solid rgba(23,23,23,0.08)", background: "#fff" },
  emojiBtn: { border: "none", background: "transparent", fontSize: "20px", cursor: "pointer", padding: "4px", borderRadius: "8px", lineHeight: 1 },
  quoteBox: { background: "rgba(23,23,23,0.06)", borderInlineStart: "3px solid rgba(23,23,23,0.25)", borderRadius: "6px", padding: "5px 8px", marginBottom: "6px" },
  quoteBoxText: { fontSize: "11.5px", color: "#5c5648", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" },
  mediaImage: { display: "block", maxWidth: "220px", maxHeight: "220px", width: "100%", borderRadius: "8px", cursor: "pointer", objectFit: "cover" },
  mediaLoading: { fontSize: "12px", color: "#8a8375", padding: "6px 0" },
  mediaFailed: { fontSize: "12px", color: "#B0402C", padding: "6px 0" },
  mediaDocLink: { display: "inline-block", fontSize: "12.5px", fontWeight: 700, color: "#171717", textDecoration: "underline" },
};
