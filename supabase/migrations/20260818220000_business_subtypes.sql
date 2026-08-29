-- Wave 2 of multi-vertical expansion (see approved plan). Widens
-- business_type to cover the rest of the "point-of-sale shaped" business
-- family:
--   quick_service, cafe, cloud_kitchen — really business_type='restaurant'
--     under the hood, just with dine_in_enabled/tables_reservations_enabled
--     defaulted off at signup (app/api/auth/signup/route.ts) — no POS/
--     dashboard code branches on these three at all.
--   car_wash, ladies_salon — share the exact services/service_staff/
--     table_reservations engine 'salon' already uses; POS branches on
--     these alongside 'salon' with a business_type-keyed label map
--     ("bay" instead of "chair", "wash" instead of "haircut").
alter table businesses drop constraint businesses_business_type_check;
alter table businesses add constraint businesses_business_type_check
  check (business_type in (
    'restaurant', 'quick_service', 'cafe', 'cloud_kitchen',
    'salon', 'ladies_salon', 'car_wash',
    'clinic', 'retail', 'other'
  ));
