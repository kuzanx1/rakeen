create or replace function __dump_funcdef(p_name text)
returns text
language sql
security definer
as $$
  select pg_get_functiondef(oid) from pg_proc where proname = p_name limit 1;
$$;
