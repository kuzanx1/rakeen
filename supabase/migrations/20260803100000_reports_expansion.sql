-- New report types (shift closing, tax, purchases, expenses) and the email
-- export format both need the report_exports history log to actually accept
-- them — the old constraints only knew about the original 4 types + pdf/excel.
alter table report_exports drop constraint if exists report_exports_report_type_check;
alter table report_exports add constraint report_exports_report_type_check
  check (report_type in ('sales','products','payments','financial','shift','tax','purchases','expenses'));

alter table report_exports drop constraint if exists report_exports_format_check;
alter table report_exports add constraint report_exports_format_check
  check (format in ('pdf','excel','email'));
