-- Defaults false — the delivery-prep-timing alert bell is genuinely useful
-- for businesses that run their own delivery (mirrors pos_hide_search's
-- reasoning: a feature real businesses depend on stays on by default, this
-- is purely an opt-out for the ones that don't need it).
alter table businesses add column pos_hide_notif_bell boolean not null default false;
