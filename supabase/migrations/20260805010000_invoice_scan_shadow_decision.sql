-- Step 4 shadow mode: the deterministic parser (rakeen-dashboard.js) always
-- runs against the OCR text alongside the real Vision-Gemini call and decides
-- what it *would* have done (accept locally / escalate to text-Gemini) —
-- logged here purely for comparison against what actually happened
-- (resolution_stage) before the pipeline is flipped to trust it (Step 5).
alter table invoice_scan_events
  add column local_parse_decision_stage text check (local_parse_decision_stage in ('local','text_gemini')),
  add column local_parse_decision_reason text;
