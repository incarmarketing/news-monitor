alter table public.job_runs
  drop constraint if exists job_runs_job_type_check;

alter table public.job_runs
  add constraint job_runs_job_type_check
  check (job_type in (
    'daily_report',
    'period_report',
    'negative_watch',
    'watchdog',
    'dashboard_refresh'
  ));

alter table public.job_runs
  drop constraint if exists job_runs_status_check;

alter table public.job_runs
  add constraint job_runs_status_check
  check (status in (
    'started',
    'dispatched',
    'watchdog_dispatched',
    'dashboard_dispatched',
    'success',
    'failed',
    'cancelled',
    'skipped'
  ));
