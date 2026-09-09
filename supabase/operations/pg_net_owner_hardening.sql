-- SUPPORT-ONLY: not a migration; NOT applied by the news-monitor postgres role.
-- Run only as the managed extension owner after Supabase approves this change.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$
begin
  if current_user <> (select pg_get_userbyid(nspowner) from pg_namespace where nspname='net') then
    raise exception 'Managed net owner required; do not attempt an ownership change';
  end if;
end $$;

-- Retain the existing effective privileges of cron/service/dashboard workers
-- before removing PUBLIC inheritance. Background worker ownership is unchanged.
grant usage on schema net to postgres, service_role, supabase_functions_admin, dashboard_user;
grant all on all tables in schema net to postgres, service_role, supabase_functions_admin, dashboard_user;
grant all on all sequences in schema net to postgres, service_role, supabase_functions_admin, dashboard_user;
grant execute on all functions in schema net to postgres, service_role, supabase_functions_admin, dashboard_user;
revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;

do $$
declare role_name text; item record;
begin
  foreach role_name in array array['anon','authenticated'] loop
    assert not has_schema_privilege(role_name,'net','USAGE');
    for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='net' loop
      assert not has_function_privilege(role_name,item.oid,'EXECUTE');
    end loop;
  end loop;
  foreach role_name in array array['postgres','service_role','supabase_functions_admin','dashboard_user'] loop
    assert has_schema_privilege(role_name,'net','USAGE');
    assert has_table_privilege(role_name,'net.http_request_queue','INSERT');
    assert has_sequence_privilege(role_name,'net.http_request_queue_id_seq','USAGE');
    assert has_function_privilege(role_name,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE');
  end loop;
end $$;
commit;

-- Do not DROP/relocate the extension. Re-audit after a managed extension update.
