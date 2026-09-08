-- The fixed ledger key is shared by anonymous and authenticated dashboard refreshes.
create or replace function public.claim_dashboard_refresh(
  p_cooldown_seconds integer default 120,
  p_requested_by text default 'dashboard_public_refresh',
  p_authenticated boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '1500ms'
set statement_timeout = '5s'
as $$
declare
  v_key constant text := 'dashboard_refresh:shared:dashboard-refresh.yml:none:nosend:auto';
  v_now timestamptz := clock_timestamp();
  v_seconds integer := greatest(120, least(coalesce(p_cooldown_seconds, 120), 3600));
  v_claimed text;
  v_last_seen timestamptz;
begin
  insert into public.job_runs as current_run (
    run_key, job_type, expected_at, triggered_by, provider, workflow,
    status, started_at, finished_at, last_seen_at, dispatch_count, error, details
  ) values (
    v_key, 'dashboard_refresh', v_now, 'dashboard', 'dashboard_manual_refresh', 'dashboard-refresh.yml',
    'dashboard_dispatched', v_now, null, v_now, 1, '',
    jsonb_build_object('requested_by', left(coalesce(p_requested_by, ''), 100),
      'authenticated', coalesce(p_authenticated, false), 'source', 'dashboard_manual_refresh')
  ) on conflict (run_key) do update set
    expected_at = excluded.expected_at,
    status = excluded.status,
    started_at = excluded.started_at,
    finished_at = null,
    last_seen_at = excluded.last_seen_at,
    dispatch_count = current_run.dispatch_count + 1,
    error = '',
    details = excluded.details,
    updated_at = v_now
  where current_run.last_seen_at <= v_now - make_interval(secs => v_seconds)
  returning run_key into v_claimed;

  if v_claimed is not null then
    return jsonb_build_object('claimed', true, 'retry_after_seconds', 0);
  end if;
  select last_seen_at into v_last_seen from public.job_runs where run_key = v_key;
  return jsonb_build_object('claimed', false, 'retry_after_seconds',
    greatest(1, ceil(extract(epoch from v_last_seen + make_interval(secs => v_seconds) - clock_timestamp()))::integer));
end;
$$;

revoke all on function public.claim_dashboard_refresh(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_dashboard_refresh(integer, text, boolean) to service_role;
