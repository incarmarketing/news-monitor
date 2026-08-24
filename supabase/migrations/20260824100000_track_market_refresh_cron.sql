create or replace function private.refresh_hantu_market_data_cron()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, net, vault, extensions
as $$
declare
  project_url text;
  refresh_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into project_url
    from vault.decrypted_secrets
   where name = 'news_monitor_project_url'
   limit 1;

  select decrypted_secret
    into refresh_secret
    from vault.decrypted_secrets
   where name = 'market_refresh_secret'
   limit 1;

  if coalesce(project_url, '') = '' or coalesce(refresh_secret, '') = '' then
    raise warning 'market refresh vault secrets are missing';
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/refresh-market-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-market-refresh-secret', refresh_secret
    ),
    body := jsonb_build_object('source', 'supabase_cron'),
    timeout_milliseconds := 45000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.refresh_hantu_market_data_cron() from public, anon, authenticated;

do $$
declare
  market_job record;
  existing_job_id bigint;
begin
  for market_job in
    select *
      from (values
        ('news-monitor-market-refresh-preopen', '50-59 23 * * 0-4'),
        ('news-monitor-market-refresh-regular', '* 0-8 * * 1-5'),
        ('news-monitor-market-refresh-close', '0-10 9 * * 1-5')
      ) as jobs(jobname, schedule)
  loop
    select jobid
      into existing_job_id
      from cron.job
     where jobname = market_job.jobname
     limit 1;

    if existing_job_id is null then
      perform cron.schedule(
        market_job.jobname,
        market_job.schedule,
        'select private.refresh_hantu_market_data_cron();'
      );
    else
      perform cron.alter_job(
        job_id := existing_job_id,
        schedule := market_job.schedule,
        command := 'select private.refresh_hantu_market_data_cron();',
        active := true
      );
    end if;
  end loop;
end
$$;
