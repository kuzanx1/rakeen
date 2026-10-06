-- 1) delete_business_completely(), rewritten to follow the schema instead
--    of a hand-kept table list. The 2026-08-14 version named tables one by
--    one and broke on every table added since (table_reservations,
--    table_sections, services, pos_login_attempts, orders.staff_member_id,
--    ...): "violates foreign key constraint", nothing deleted.
--
--    Now it reads every single-column foreign key in public from the
--    catalog and, for the one business:
--      - first refuses (raises, nothing deleted) if any OTHER business's
--        rows point at this business's rows, so deleting a business can
--        never damage another one;
--      - nulls every optional link inside its data (breaks cycles such as
--        orders.table_id <-> restaurant_tables.active_order_id);
--      - deletes rows without business_id that hang off its rows (order
--        lines, login attempts, ...), then every table with business_id,
--        repeating until the businesses row itself is gone.
--    All in the caller's transaction: it either deletes everything or
--    raises and deletes nothing. Same signature, same return (the name),
--    still service-role only (app/api/admin/businesses/[id]/route.ts).
--
-- 2) The online free-order gate in submit_online_order() still compared
--    against a hard-coded 350, so the per-business limit the admin edits
--    (businesses.online_order_free_limit, 20260814040000) never applied.
--    Patched in place on the live definition(s) — only that one comparison
--    changes — so nothing else in the function can drift from production.

create or replace function delete_business_completely(p_business_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_ids bigint[] := array[p_business_id];
  v_fks jsonb;
  v_last_error text;
  fk record;
  t record;
  n bigint;
  pass int;
begin
  select name into v_name from businesses where id = p_business_id;
  if v_name is null then
    raise exception 'business_not_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'child', c.conrelid::regclass::text, 'col', a.attname, 'req', a.attnotnull,
           'parent', c.confrelid::regclass::text, 'refcol', af.attname,
           'child_biz', exists (select 1 from pg_attribute x where x.attrelid = c.conrelid and x.attname = 'business_id' and not x.attisdropped),
           'parent_biz', exists (select 1 from pg_attribute x where x.attrelid = c.confrelid and x.attname = 'business_id' and not x.attisdropped))), '[]'::jsonb)
    into v_fks
  from pg_constraint c
  join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum  = c.conkey[1]
  join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
  where c.contype = 'f' and array_length(c.conkey, 1) = 1
    and c.connamespace = 'public'::regnamespace
    and (select relnamespace from pg_class where oid = c.confrelid) = 'public'::regnamespace;

  -- Another business's data pointing into this one: stop, delete nothing.
  for fk in select * from jsonb_to_recordset(v_fks) as x(child text, col text, req boolean, parent text, refcol text, child_biz boolean, parent_biz boolean)
            where child_biz and parent_biz and parent <> 'businesses' loop
    execute format('select count(*) from %s c join %s p on p.%I = c.%I where c.business_id <> $1 and p.business_id = $1',
                   fk.child, fk.parent, fk.refcol, fk.col) into n using p_business_id;
    if n > 0 then
      raise exception 'linked_to_other_business: % rows in %.% belong to another business', n, fk.child, fk.col;
    end if;
  end loop;

  for pass in 1..15 loop
    exit when not exists (select 1 from businesses where id = p_business_id);

    for fk in select * from jsonb_to_recordset(v_fks) as x(child text, col text, req boolean, parent text, refcol text, child_biz boolean, parent_biz boolean)
              where not req loop
      begin
        if fk.child_biz then
          execute format('update %s set %I = null where business_id = any($1) and %I is not null', fk.child, fk.col, fk.col) using v_ids;
        elsif fk.parent_biz then
          execute format('update %s c set %I = null from %s p where p.%I = c.%I and p.business_id = any($1)', fk.child, fk.col, fk.parent, fk.refcol, fk.col) using v_ids;
        end if;
      exception when others then v_last_error := fk.child || '.' || fk.col || ': ' || sqlerrm;
      end;
    end loop;

    for fk in select * from jsonb_to_recordset(v_fks) as x(child text, col text, req boolean, parent text, refcol text, child_biz boolean, parent_biz boolean)
              where not child_biz and parent_biz loop
      begin
        execute format('delete from %s c using %s p where p.%I = c.%I and p.business_id = any($1)', fk.child, fk.parent, fk.refcol, fk.col) using v_ids;
      exception when others then v_last_error := fk.child || ': ' || sqlerrm;
      end;
    end loop;

    for t in select cl.oid::regclass::text as tbl from pg_class cl
             join pg_attribute a on a.attrelid = cl.oid and a.attname = 'business_id' and not a.attisdropped
             where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r' loop
      begin
        execute format('delete from %s where business_id = any($1)', t.tbl) using v_ids;
      exception when others then v_last_error := t.tbl || ': ' || sqlerrm;
      end;
    end loop;

    begin
      delete from businesses where id = p_business_id;
    exception when others then v_last_error := 'businesses: ' || sqlerrm;
    end;
  end loop;

  if exists (select 1 from businesses where id = p_business_id) then
    raise exception 'delete_incomplete: %', coalesce(v_last_error, 'unknown');
  end if;

  return v_name;
end;
$$;

revoke execute on function delete_business_completely(bigint) from public, anon, authenticated;
grant execute on function delete_business_completely(bigint) to service_role;

do $$
declare
  f record;
  v_def text;
  v_new text;
  v_done int := 0;
begin
  for f in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_online_order' loop
    v_def := pg_get_functiondef(f.oid);
    if position('v_business.online_order_free_count >= 350' in v_def) = 0 then
      continue;
    end if;
    -- The free-limit column is only there when v_business is the whole row.
    if position('select * into v_business from businesses' in v_def) = 0 then
      raise exception 'unexpected shape of %, nothing changed', f.sig;
    end if;
    v_new := replace(v_def, 'v_business.online_order_free_count >= 350',
                     'v_business.online_order_free_count >= coalesce(v_business.online_order_free_limit, 350)');
    execute v_new;
    v_done := v_done + 1;
  end loop;
  if v_done = 0 then
    raise exception 'submit_online_order: hard-coded 350 not found, nothing changed';
  end if;
  raise notice 'submit_online_order patched: % definition(s)', v_done;
end $$;
