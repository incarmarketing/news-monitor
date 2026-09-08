begin;
set local statement_timeout = '10s';

do $$
declare
  v_result jsonb;
  v_count integer;
  v_key constant text := 'dashboard_refresh:shared:dashboard-refresh.yml:none:nosend:auto';
begin
  if has_function_privilege('anon', 'public.claim_dashboard_refresh(integer,text,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_dashboard_refresh(integer,text,boolean)', 'EXECUTE') then
    raise exception 'public execution must remain denied';
  end if;
  if not has_function_privilege('service_role', 'public.claim_dashboard_refresh(integer,text,boolean)', 'EXECUTE') then
    raise exception 'service execution is required';
  end if;
  -- All changes roll back; this does not dispatch any GitHub workflow.
  update public.job_runs set last_seen_at = now() - interval '2 hours' where run_key = v_key;
  v_result := public.claim_dashboard_refresh(120, 'security-test', false);
  if (v_result->>'claimed')::boolean is distinct from true then raise exception 'first claim failed'; end if;
  select dispatch_count into v_count from public.job_runs where run_key = v_key;
  for i in 1..10 loop
    v_result := public.claim_dashboard_refresh(0, 'security-test-auth', true);
    if (v_result->>'claimed')::boolean is distinct from false then raise exception 'duplicate claim accepted'; end if;
    if (v_result->>'retry_after_seconds')::integer not between 1 and 120 then raise exception 'invalid cooldown'; end if;
  end loop;
  if (select dispatch_count from public.job_runs where run_key = v_key) <> v_count then raise exception 'throttled request changed ledger'; end if;
  update public.job_runs set last_seen_at = now() - interval '121 seconds' where run_key = v_key;
  v_result := public.claim_dashboard_refresh(120, 'security-test-retry', false);
  if (v_result->>'claimed')::boolean is distinct from true then raise exception 'expired reservation blocks retry'; end if;
end;
$$;
rollback;
