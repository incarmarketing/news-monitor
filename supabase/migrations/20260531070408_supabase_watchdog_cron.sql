create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create or replace function private.news_monitor_supabase_watchdog()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, net, vault, extensions
as $$
declare
  project_url text;
  publishable_key text;
  request_id bigint;
begin
  select decrypted_secret
    into project_url
    from vault.decrypted_secrets
   where name = 'news_monitor_project_url'
   limit 1;

  select decrypted_secret
    into publishable_key
    from vault.decrypted_secrets
   where name = 'news_monitor_publishable_key'
   limit 1;

  if coalesce(project_url, '') = '' or coalesce(publishable_key, '') = '' then
    raise warning 'news monitor watchdog vault secrets are missing';
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/trigger-news-collection',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', publishable_key,
      'Authorization', 'Bearer ' || publishable_key
    ),
    body := jsonb_build_object(
      'action', 'watchdog',
      'source', 'supabase_cron'
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.news_monitor_supabase_watchdog() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid
      into existing_job_id
      from cron.job
     where jobname = 'news-monitor-supabase-watchdog'
     limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
  end if;
end;
$$;

select cron.schedule(
  'news-monitor-supabase-watchdog',
  '*/5 * * * *',
  $job$
  select private.news_monitor_supabase_watchdog();
  $job$
);
