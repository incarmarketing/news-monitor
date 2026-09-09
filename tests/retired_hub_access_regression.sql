-- Read-only checks, safe after migration or inside a rollback rehearsal.
do $$
declare item record; role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    for item in select c.oid, c.relkind from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and starts_with(c.relname, 'hub_') and c.relkind in ('r','S')
    loop
      if item.relkind='r' then
        assert not has_table_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
        assert not has_any_column_privilege(role_name,item.oid,'SELECT,INSERT,UPDATE,REFERENCES');
        assert has_table_privilege('service_role',item.oid,'SELECT');
      else
        assert not has_sequence_privilege(role_name,item.oid,'USAGE,SELECT,UPDATE');
        assert has_sequence_privilege('service_role',item.oid,'USAGE');
      end if;
    end loop;
    for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('hub_activate_admin_invite',
        'hub_claim_admin_identity','hub_record_auto_login_notice_acknowledgement',
        'hub_is_admin_email_allowlisted')
    loop
      assert not has_function_privilege(role_name,item.oid,'EXECUTE');
      assert has_function_privilege('service_role',item.oid,'EXECUTE');
    end loop;
  end loop;
  assert has_table_privilege('service_role','public.news_articles','SELECT');
  assert has_schema_privilege('postgres','net','USAGE');
  assert has_function_privilege('postgres','net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE');
  assert (select count(*)=4 from cron.job where active and username='postgres');
  assert not exists(select 1 from pg_policies where schemaname='storage'
    and starts_with(policyname,'hub_storage_') and 'authenticated'=any(roles));
end $$;
select 'retired_hub_access_passed' as result;
