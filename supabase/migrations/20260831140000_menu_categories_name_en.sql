-- Categories had no English name at all — only menu_items did. Needed now
-- that the POS is getting a real Arabic/English language toggle: a category
-- tab (or a product's own category label) has nothing to fall back to in
-- English without this.
alter table menu_categories add column name_en text;
