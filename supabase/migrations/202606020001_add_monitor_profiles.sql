create table if not exists public.monitor_profiles (
  profile_key text primary key,
  profile jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_monitor_profiles_updated_at
  on public.monitor_profiles (updated_at desc);

drop trigger if exists set_monitor_profiles_updated_at on public.monitor_profiles;
create trigger set_monitor_profiles_updated_at
before update on public.monitor_profiles
for each row execute function public.set_updated_at();

alter table public.monitor_profiles enable row level security;
revoke all on public.monitor_profiles from anon, authenticated;

insert into public.monitor_profiles (profile_key, profile, updated_by)
values (
  'default',
  '{
    "companyName": "샘플회사",
    "teamName": "모니터링팀",
    "serviceName": "관심키워드 및 모니터링 자동화",
    "purpose": "정해둔 관심 키워드를 자동으로 검색하고, 자료를 모아 분석한 뒤 보고서와 알림으로 업무 흐름을 줄입니다.",
    "ownKeywords": ["샘플회사", "샘플서비스", "샘플회사 브랜드평판"],
    "industryContext": ["업종 문맥", "고객", "상품", "서비스", "정책", "규제", "시장 동향"],
    "excludeContext": ["무관 스포츠", "무관 업종", "단순 포토", "지역 선거", "채용"],
    "reportTone": "짧고 명확하게, 근거 기사와 판단을 분리하고 임원 보고에 바로 쓸 수 있게 작성합니다."
  }'::jsonb,
  'system'
)
on conflict (profile_key) do nothing;
