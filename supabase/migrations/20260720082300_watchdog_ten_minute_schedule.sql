do $$
declare
  watchdog_job_id bigint;
begin
  select jobid
    into watchdog_job_id
  from cron.job
  where jobname = 'news-monitor-supabase-watchdog'
  limit 1;

  if watchdog_job_id is not null then
    perform cron.alter_job(
      job_id := watchdog_job_id,
      schedule := '*/10 * * * *'
    );
  end if;
end
$$;
