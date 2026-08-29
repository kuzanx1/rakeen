-- A real cover photo the restaurant can upload for its online menu header —
-- premium ordering apps show an actual photo band, not a color gradient.
-- Optional: pages with none just render a plain, minimal header instead of
-- a placeholder.
alter table businesses add column online_banner_url text;
