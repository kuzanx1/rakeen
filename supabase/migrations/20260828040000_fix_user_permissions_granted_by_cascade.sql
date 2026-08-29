-- user_permissions.granted_by referenced profiles(id) with no ON DELETE
-- behavior, while user_id already cascaded. This silently blocked
-- delete_business_completely() (and any other profile deletion) whenever an
-- owner/manager had ever granted a permission to staff — the normal case —
-- raising FK violation 23503 on user_permissions_granted_by_fkey. Since
-- granted_by is just an audit pointer to who granted the permission, cascading
-- it matches user_id's existing behavior and the only place profiles are ever
-- hard-deleted today is the full-tenant wipe.
alter table user_permissions
  drop constraint user_permissions_granted_by_fkey,
  add constraint user_permissions_granted_by_fkey
    foreign key (granted_by) references profiles(id) on delete cascade;
