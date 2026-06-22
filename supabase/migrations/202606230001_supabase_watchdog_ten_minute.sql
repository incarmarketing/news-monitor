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
  '*/10 * * * *',
  $job$
  select private.news_monitor_supabase_watchdog();
  $job$
);
