-- Run inside a transaction and ROLLBACK. No article contents or delivery records change.
do $$
declare before_version uuid; after_version uuid; first_claim jsonb; second_claim jsonb;
begin
  if has_table_privilege('anon', 'public.dashboard_change_versions', 'SELECT')
     or has_table_privilege('authenticated', 'public.dashboard_workflow_cache', 'SELECT')
     or has_function_privilege('anon', 'public.claim_dashboard_workflow_read(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.mark_dashboard_change()', 'EXECUTE') then
    raise exception 'internal_monitoring_access_exposed';
  end if;
  if not has_table_privilege('service_role', 'public.dashboard_change_versions', 'SELECT') then
    raise exception 'service_read_missing';
  end if;
  select revision into before_version from public.dashboard_change_versions where topic='news_articles';
  update public.news_articles set title=title where false;
  select revision into after_version from public.dashboard_change_versions where topic='news_articles';
  if before_version = after_version then raise exception 'article_update_not_tracked'; end if;
  before_version := after_version;
  delete from public.news_articles where false;
  select revision into after_version from public.dashboard_change_versions where topic='news_articles';
  if before_version = after_version then raise exception 'article_delete_not_tracked'; end if;
  select revision into before_version from public.dashboard_change_versions where topic='notification_sends';
  update public.notification_sends set status=status where false;
  select revision into after_version from public.dashboard_change_versions where topic='notification_sends';
  if before_version = after_version then raise exception 'delivery_not_tracked'; end if;
  delete from public.dashboard_workflow_cache where workflow='dashboard-refresh.yml';
  first_claim := public.claim_dashboard_workflow_read('dashboard-refresh.yml');
  second_claim := public.claim_dashboard_workflow_read('dashboard-refresh.yml');
  if first_claim->>'acquired' <> 'true' or second_claim->>'acquired' <> 'false' then
    raise exception 'duplicate_diagnostic_claim';
  end if;
  update public.dashboard_workflow_cache set checked_at=clock_timestamp(),lease_until=null
    where workflow='dashboard-refresh.yml';
  if public.claim_dashboard_workflow_read('dashboard-refresh.yml')->>'acquired' <> 'false' then
    raise exception 'diagnostic_cache_ignored';
  end if;
end;
$$;
select 'dashboard_change_tracking_passed' as result;
