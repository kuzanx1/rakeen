-- Lets the weekly usage-check cron (app/api/cron/usage-check) read the
-- actual Postgres database size in bytes — the free-tier limit (0.5 GB) is
-- one of the metrics that matters now that Storage egress is no longer the
-- risk (images moved to R2). Plain SQL wrapper since supabase-js has no
-- raw-SQL escape hatch; callable via the service-role client like every
-- other RPC in this project.
create or replace function get_database_size_bytes()
returns bigint
language sql
stable
as $$
  select pg_database_size(current_database());
$$;
