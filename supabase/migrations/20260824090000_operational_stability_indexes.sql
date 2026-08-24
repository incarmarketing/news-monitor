create index if not exists idx_market_provider_runs_provider_status_started
  on public.market_provider_runs (provider, status, started_at desc);

create index if not exists idx_job_runs_provider_type_status_seen
  on public.job_runs (provider, job_type, status, last_seen_at desc);

create index if not exists idx_monitor_classification_review_cases_article_id
  on public.monitor_classification_review_cases (article_id);

update public.market_provider_runs
   set status = 'failed',
       finished_at = coalesce(finished_at, now()),
       message = coalesce(nullif(message, ''), 'stale market refresh closed during stability migration')
 where provider = 'hantu'
   and status = 'running'
   and started_at < now() - interval '10 minutes';
