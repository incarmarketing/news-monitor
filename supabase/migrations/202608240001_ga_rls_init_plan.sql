-- The service_role bypasses RLS, so these explicit policies were redundant and
-- added avoidable policy evaluation work.
drop policy if exists ga_companies_service_role_all on public.ga_companies;
drop policy if exists ga_disclosure_metrics_service_role_all on public.ga_disclosure_metrics;
drop policy if exists ga_revenue_metrics_service_role_all on public.ga_revenue_metrics;
drop policy if exists ga_market_metrics_service_role_all on public.ga_market_metrics;
drop policy if exists ga_collect_runs_service_role_all on public.ga_collect_runs;
drop policy if exists ga_metric_sources_service_role_all on public.ga_metric_sources;
