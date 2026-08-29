-- Step 5: full pipeline observability. resolution_stage already records
-- which tier *accepted* the invoice (local_ocr / text_gemini / vision_gemini
-- / failed) and local_parse_decision_reason records why local declined —
-- this adds the second escalation reason: why the text-Gemini tier's own
-- result (when attempted) was rejected before falling through to vision.
-- Together these three columns let us trace every invoice's full path
-- through the cascade and measure whether each optimization is actually
-- reducing vision_gemini usage over time.
alter table invoice_scan_events
  add column text_parse_escalation_reason text;
