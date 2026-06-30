-- Supabase operations stability audit
-- Run this in Supabase SQL Editor before changing RLS policies or extensions.
-- Purpose:
-- 1. Identify why Database Advisor reports pg_net in public.
-- 2. Find RLS policies that repeatedly call auth/current_setting per row.
-- 3. Confirm public API grants before tightening policies.

-- 1) Installed extensions and schemas.
select
  extname,
  extnamespace::regnamespace as extension_schema
from pg_extension
order by extname;

-- 2) Functions that call pg_net/http related features.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  case
    when pg_get_functiondef(p.oid) ilike '%net.%' then 'uses pg_net'
    when pg_get_functiondef(p.oid) ilike '%http%' then 'uses http'
    else 'review'
  end as finding
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where pg_get_functiondef(p.oid) ilike '%net.%'
   or pg_get_functiondef(p.oid) ilike '%http%'
order by n.nspname, p.proname;

-- 3) RLS policies on GA intelligence tables flagged by Auth RLS Initialization Plan.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'ga_companies',
    'ga_disclosure_metrics',
    'ga_revenue_metrics',
    'ga_market_metrics',
    'ga_collect_runs',
    'ga_metric_sources'
  )
order by tablename, policyname;

-- 4) Policies that should be reviewed for initplan optimization.
-- If a policy contains auth.uid(), auth.jwt(), or current_setting(),
-- prefer wrapping the call as (select auth.uid()) / (select auth.jwt())
-- when the value is constant for the statement.
select
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    coalesce(qual, '') ilike '%auth.%'
    or coalesce(with_check, '') ilike '%auth.%'
    or coalesce(qual, '') ilike '%current_setting%'
    or coalesce(with_check, '') ilike '%current_setting%'
  )
order by tablename, policyname;

-- 5) Data API grants for anon/authenticated.
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 6) RLS enabled status for public tables.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  forcerowsecurity as rls_forced
from pg_tables
where schemaname = 'public'
order by tablename;
