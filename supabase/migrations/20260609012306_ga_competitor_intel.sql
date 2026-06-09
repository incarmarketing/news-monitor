create table if not exists public.ga_companies (
  id bigserial primary key,
  name text not null unique,
  short_name text not null,
  display_order integer not null default 999,
  active boolean not null default true,
  homepage_url text,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ga_disclosure_metrics (
  id bigserial primary key,
  company_name text not null references public.ga_companies(name) on update cascade on delete cascade,
  stand_mm text not null check (stand_mm ~ '^[0-9]{6}$'),
  period_label text not null,
  planners integer,
  stay_rate numeric(6,2),
  retention_13_life numeric(6,2),
  retention_13_nonlife numeric(6,2),
  retention_25_life numeric(6,2),
  retention_25_nonlife numeric(6,2),
  poor_sales_life numeric(6,3),
  poor_sales_nonlife numeric(6,3),
  withdrawal_life integer,
  withdrawal_nonlife integer,
  source_url text not null default 'https://gapub.insure.or.kr/gongsimain/mainSearch.do',
  source_payload jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_name, stand_mm)
);

create table if not exists public.ga_revenue_metrics (
  id bigserial primary key,
  company_name text not null references public.ga_companies(name) on update cascade on delete cascade,
  period_key text not null,
  period_label text not null,
  amount_krw_100m numeric(14,2),
  operating_profit_krw_100m numeric(14,2),
  net_income_krw_100m numeric(14,2),
  status text not null default '확인 필요',
  source_label text,
  source_url text,
  note text,
  confirmed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_name, period_key)
);

create table if not exists public.ga_market_metrics (
  id bigserial primary key,
  stand_mm text not null unique check (stand_mm ~ '^[0-9]{6}$'),
  period_label text not null,
  companies_count integer,
  total_planners integer,
  stay_rate numeric(6,2),
  retention_13_life numeric(6,2),
  retention_13_nonlife numeric(6,2),
  retention_25_life numeric(6,2),
  retention_25_nonlife numeric(6,2),
  poor_sales_life numeric(6,3),
  poor_sales_nonlife numeric(6,3),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ga_collect_runs (
  id bigserial primary key,
  run_key text not null unique,
  job_type text not null default 'ga_competitor_collect',
  stand_mm text,
  status text not null default 'started',
  message text,
  rows_collected integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ga_metric_sources (
  id bigserial primary key,
  source_type text not null,
  title text not null,
  url text not null,
  memo text,
  created_at timestamptz not null default now(),
  unique (source_type, url)
);

create index if not exists ga_disclosure_metrics_stand_idx
  on public.ga_disclosure_metrics (stand_mm desc, company_name);

create index if not exists ga_revenue_metrics_period_idx
  on public.ga_revenue_metrics (period_key desc, company_name);

create index if not exists ga_companies_active_order_idx
  on public.ga_companies (active, display_order, name);

alter table public.ga_companies enable row level security;
alter table public.ga_disclosure_metrics enable row level security;
alter table public.ga_revenue_metrics enable row level security;
alter table public.ga_market_metrics enable row level security;
alter table public.ga_collect_runs enable row level security;
alter table public.ga_metric_sources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_companies' and policyname = 'ga_companies_service_role_all'
  ) then
    create policy ga_companies_service_role_all on public.ga_companies
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_disclosure_metrics' and policyname = 'ga_disclosure_metrics_service_role_all'
  ) then
    create policy ga_disclosure_metrics_service_role_all on public.ga_disclosure_metrics
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_revenue_metrics' and policyname = 'ga_revenue_metrics_service_role_all'
  ) then
    create policy ga_revenue_metrics_service_role_all on public.ga_revenue_metrics
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_market_metrics' and policyname = 'ga_market_metrics_service_role_all'
  ) then
    create policy ga_market_metrics_service_role_all on public.ga_market_metrics
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_collect_runs' and policyname = 'ga_collect_runs_service_role_all'
  ) then
    create policy ga_collect_runs_service_role_all on public.ga_collect_runs
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ga_metric_sources' and policyname = 'ga_metric_sources_service_role_all'
  ) then
    create policy ga_metric_sources_service_role_all on public.ga_metric_sources
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

insert into public.ga_companies (name, short_name, display_order)
values
  ('한화생명금융서비스', '한화생명금융서비스', 1),
  ('인카금융서비스', '인카금융서비스', 2),
  ('지에이코리아주식회사', '지에이코리아', 3),
  ('글로벌금융판매', '글로벌금융판매', 4),
  ('프라임에셋', '프라임에셋', 5),
  ('케이지에이에셋 주식회사', 'KGA에셋', 6),
  ('에이플러스에셋어드바이저', '에이플러스에셋', 7),
  ('한국보험금융', '한국보험금융', 8),
  ('메가', '메가', 9),
  ('엠금융서비스', '엠금융서비스', 10)
on conflict (name) do update
set short_name = excluded.short_name,
    display_order = excluded.display_order,
    updated_at = now();

insert into public.ga_revenue_metrics (
  company_name,
  period_key,
  period_label,
  amount_krw_100m,
  operating_profit_krw_100m,
  net_income_krw_100m,
  status,
  source_label,
  source_url,
  note,
  confirmed_at
)
values
  (
    '인카금융서비스',
    '2024',
    '2024 연간',
    8323,
    863,
    620,
    '확정',
    '재무제표 요약',
    'https://alphasquare.co.kr/home/financial-information?code=211050',
    '2024 연간 매출 추적 기준값입니다.',
    '2025-03-31'
  ),
  (
    '인카금융서비스',
    '2025',
    '2025 연간',
    10218,
    952,
    713,
    '공시 확인',
    '2025년 잠정 실적 공시 보도',
    'https://www.news2day.co.kr/article/20260212500279',
    '연매출 1조원 돌파. 전년 대비 매출 22.8% 증가.',
    '2026-02-12'
  ),
  (
    '인카금융서비스',
    '2026Q1',
    '2026 1분기',
    3012,
    260,
    225,
    '최신 공시',
    '2026년 1분기 실적 공시 보도',
    'https://www.news2day.co.kr/article/20260515500169',
    '분기 기준 사상 최대 매출. 전년 동기 대비 30.9% 증가.',
    '2026-05-15'
  ),
  (
    '인카금융서비스',
    '2026H1',
    '2026 상반기',
    null,
    null,
    null,
    '공시 대기',
    '상반기 종료 전',
    null,
    '2026-06-09 현재 2026년 상반기 결산 기간이 아직 종료되지 않았습니다.',
    null
  )
on conflict (company_name, period_key) do update
set period_label = excluded.period_label,
    amount_krw_100m = excluded.amount_krw_100m,
    operating_profit_krw_100m = excluded.operating_profit_krw_100m,
    net_income_krw_100m = excluded.net_income_krw_100m,
    status = excluded.status,
    source_label = excluded.source_label,
    source_url = excluded.source_url,
    note = excluded.note,
    confirmed_at = excluded.confirmed_at,
    updated_at = now();
