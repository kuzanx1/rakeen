-- Two additions for the admin WhatsApp inbox: admin_label lets the platform
-- admin save a nickname per phone number (shown in the conversation list and
-- push notifications instead of/alongside the raw number), and
-- last_message_preview is a cheap denormalized copy of the latest message
-- body so the conversation list can show it without a join per row.
alter table rakeen_support_conversations
  add column admin_label text,
  add column last_message_preview text;
