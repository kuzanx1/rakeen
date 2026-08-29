-- L4 (security hardening phase 2) — three Supabase Storage buckets
-- (menu-item-images, business-branding, loyalty-branding) still carry
-- "public read" RLS policies from before uploads moved entirely to
-- Cloudflare R2 (zero-egress-fee reasons, see app/api/dashboard/upload-media
-- — the real, current upload path). Verified via a live query first: zero
-- businesses or menu_items currently reference any supabase.co-hosted
-- image URL, so nothing depends on these policies still being public.
--
-- Only the public-read policy is dropped, not the buckets themselves —
-- deleting the buckets isn't necessary to close the exposure and risks
-- failing (or destroying orphaned objects) if anything unexpected is still
-- sitting in them; revoking public access is the actual fix.
drop policy if exists "menu item images public read" on storage.objects;
drop policy if exists "business branding public read" on storage.objects;
drop policy if exists "loyalty branding public read" on storage.objects;
