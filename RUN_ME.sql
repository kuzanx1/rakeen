-- ركين — شغّلها مرّة واحدة في محرّر SQL الخاص بـ Supabase.
-- آمنةٌ لو انعادت.

-- ============================================================
-- أسماء إنجليزية لمجموعات الخيارات وخياراتها (نفس نمط أصناف القائمة)
-- ============================================================

alter table modifier_groups add column if not exists name_en text;
alter table modifier_options add column if not exists name_en text;
