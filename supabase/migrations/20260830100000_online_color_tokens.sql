-- online_theme_color already covers the accent/brand color. These four cover
-- everything else the storefront actually paints with: page background,
-- card/surface background, body text, and muted/secondary text. Border
-- color is deliberately NOT a stored field — rakeen-order.css derives it
-- from the ink color instead (see --line), so it always stays coherent
-- with whatever text color the merchant picks rather than drifting out of
-- sync as a sixth disconnected value.
-- All nullable: null means "use this theme's built-in default", not a
-- literal color — the storefront only overrides the CSS variable when a
-- business has actually set one, so a plain classic/luxury reskin doesn't
-- suddenly need every field populated to look right.
alter table businesses add column if not exists online_color_surf text;
alter table businesses add column if not exists online_color_card text;
alter table businesses add column if not exists online_color_ink text;
alter table businesses add column if not exists online_color_muted text;

grant select (online_color_surf, online_color_card, online_color_ink, online_color_muted) on businesses to anon;
