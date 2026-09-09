-- Only the retired, empty hub in the news-monitor DB is in scope.
-- The live promotion hub uses rmolcowfgzvvqczpjzwx (Sites production checked).
-- Keep objects, RLS and service_role access for recovery; never touch pg_net here.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $$
declare
  item record;
  populated boolean;
begin
  if to_regclass('public.news_articles') is null then
    raise exception 'Not the news-monitor database';
  end if;
  for item in
    select c.oid, c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname = any(array[
        'hub_admin_profiles', 'hub_admin_users', 'hub_audit_logs',
        'hub_content_items', 'hub_employee_login_attempts',
        'hub_performance_snapshots', 'hub_sales_managers', 'hub_uploaded_files'
      ])
    order by c.relname
  loop
    execute format('lock table public.%I in access exclusive mode', item.relname);
    execute format('select exists(select 1 from public.%I limit 1)', item.relname)
      into populated;
    if populated then
      raise exception 'Hub retirement aborted: % is not empty', item.relname;
    end if;
  end loop;
  if exists(select 1 from storage.objects where bucket_id = 'promotion-hub-private') then
    raise exception 'Hub retirement aborted: old storage is not empty';
  end if;
end $$;

-- Remove obsolete storage policies from the authenticated role before revoking
-- their table dependencies, so unrelated storage requests cannot fail on them.
do $$
declare item record;
begin
  for item in select policyname from pg_policies
    where schemaname='storage' and tablename='objects' and starts_with(policyname,'hub_storage_')
  loop
    execute format('alter policy %I on storage.objects to service_role',item.policyname);
  end loop;
end $$;

do $$
declare
  item record;
  col record;
begin
  for item in
    select c.oid, c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname = any(array[
        'hub_admin_profiles', 'hub_admin_users', 'hub_audit_logs',
        'hub_content_items', 'hub_employee_login_attempts',
        'hub_performance_snapshots', 'hub_sales_managers', 'hub_uploaded_files'
      ])
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', item.relname);
    -- A table-level REVOKE does not clear explicit column grants.
    for col in select attname from pg_attribute
      where attrelid = item.oid and attnum > 0 and not attisdropped and attacl is not null
    loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated', col.attname, item.relname);
    end loop;
  end loop;
end $$;

-- Fresh news-monitor installations never had the shared hub objects.
do $$
declare item record;
begin
  for item in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='S'
      and c.relname in ('hub_audit_logs_id_seq','hub_employee_login_attempts_id_seq')
  loop
    execute format('revoke all on sequence %s from public, anon, authenticated', item.oid::regclass);
  end loop;
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.oid in (
      to_regprocedure('public.hub_activate_admin_invite()'),
      to_regprocedure('public.hub_claim_admin_identity()'),
      to_regprocedure('public.hub_record_auto_login_notice_acknowledgement(uuid,text)'),
      to_regprocedure('public.hub_is_admin_email_allowlisted(text)'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated',item.oid::regprocedure);
  end loop;
end $$;

-- Assert effective permissions, rather than assuming a REVOKE took effect.
do $$
declare item record; role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    for item in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and starts_with(c.relname, 'hub_')
    loop
      if has_table_privilege(role_name, item.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(role_name, item.oid, 'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Unexpected remaining hub table permission for %', role_name;
      end if;
    end loop;
  end loop;
end $$;
