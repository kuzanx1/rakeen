-- Adds "rings" (a soft two-ring ripple motif) as the showcase premium
-- decorative pattern option, per owner request for a fancier choice in the
-- gallery. Also re-tuned the existing patterns' opacity/spacing to be more
-- consistently subtle across the board — done in code (page.tsx /
-- rakeen-dashboard.js), this migration only needs to widen the constraint.

alter table businesses drop constraint if exists businesses_loyalty_pattern_style_check;
alter table businesses add constraint businesses_loyalty_pattern_style_check
  check (loyalty_pattern_style in ('none','dots','diagonal','waves','grid','chevron','rings','icons'));
