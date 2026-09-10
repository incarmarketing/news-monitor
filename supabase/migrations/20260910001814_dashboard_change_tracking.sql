set lock_timeout = '3s';
set statement_timeout = '20s';

create table public.dashboard_change_versions (
  topic text primary key,
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.dashboard_change_versions enable row level security;
revoke all on public.dashboard_change_versions from public, anon, authenticated;
grant select, insert, update on public.dashboard_change_versions to service_role;

insert into public.dashboard_change_versions(topic)
values ('news_articles'), ('notification_sends'), ('negative_watch_runs'), ('report_runs'), ('job_runs');

-- One invalidation per SQL statement, including edits/deletes with unchanged row counts.
create or replace function private.mark_dashboard_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.dashboard_change_versions
     set revision = gen_random_uuid(), updated_at = clock_timestamp()
   where topic = tg_table_name;
  return null;
end;
$$;
revoke all on function private.mark_dashboard_change() from public, anon, authenticated;

do $$
declare topic text;
begin
  foreach topic in array array['news_articles','notification_sends','negative_watch_runs','report_runs','job_runs'] loop
    execute format('create trigger dashboard_change_marker after insert or update or delete or truncate on public.%I for each statement execute function private.mark_dashboard_change()', topic);
  end loop;
end;
$$;

-- Shared across Edge instances/users; no GitHub token or provider error is stored.
create table public.dashboard_workflow_cache (
  workflow text primary key,
  payload jsonb,
  checked_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  constraint dashboard_workflow_allowlist check (workflow in (
    'negative-watch.yml','dashboard-refresh.yml','news-briefing.yml',
    'regulator-releases.yml','pages-dashboard.yml'))
);
alter table public.dashboard_workflow_cache enable row level security;
revoke all on public.dashboard_workflow_cache from public, anon, authenticated;
grant select, insert, update on public.dashboard_workflow_cache to service_role;

create or replace function public.claim_dashboard_workflow_read(p_workflow text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare entry public.dashboard_workflow_cache; acquired boolean := false;
begin
  if p_workflow not in ('negative-watch.yml','dashboard-refresh.yml','news-briefing.yml',
      'regulator-releases.yml','pages-dashboard.yml') then
    raise exception 'unsupported_workflow';
  end if;
  insert into public.dashboard_workflow_cache(workflow) values(p_workflow) on conflict do nothing;
  update public.dashboard_workflow_cache set lease_until = clock_timestamp() + interval '30 seconds',
      lease_token = gen_random_uuid()
    where workflow = p_workflow
      and (checked_at is null or checked_at < clock_timestamp() - interval '60 seconds')
      and (lease_until is null or lease_until < clock_timestamp())
    returning * into entry;
  acquired := found;
  if not acquired then
    select * into entry from public.dashboard_workflow_cache where workflow = p_workflow;
  end if;
  return jsonb_build_object('acquired', acquired, 'lease_token', case when acquired then entry.lease_token end,
    'payload', entry.payload, 'checked_at', entry.checked_at);
end;
$$;
revoke all on function public.claim_dashboard_workflow_read(text) from public, anon, authenticated;
grant execute on function public.claim_dashboard_workflow_read(text) to service_role;
