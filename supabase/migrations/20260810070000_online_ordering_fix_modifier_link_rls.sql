-- Missed in the original online-ordering RLS pass: menu_item_modifier_groups
-- (the join table between a product and its choice groups, e.g. "الحجم")
-- had no public-read policy, so every product silently looked option-less
-- to an anonymous visitor and skipped straight to "add without asking".
create policy "public modifier links read for online ordering" on menu_item_modifier_groups for select
  using (exists (
    select 1 from menu_items m join businesses b on b.id = m.business_id
    where m.id = menu_item_modifier_groups.menu_item_id and b.online_ordering_enabled = true
  ));
