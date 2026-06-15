create table if not exists public.monitor_context_rules (
  rule_key text primary key,
  label text not null,
  category text not null default 'other'
    check (category in ('own', 'regulation', 'competitor', 'industry', 'other', 'exclude')),
  tone text not null default 'neutral'
    check (tone in ('positive', 'neutral', 'caution', 'negative', 'exclude')),
  trigger_terms text[] not null default '{}',
  required_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  priority integer not null default 100,
  enabled boolean not null default true,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_monitor_context_rules_updated_at on public.monitor_context_rules;
create trigger set_monitor_context_rules_updated_at
before update on public.monitor_context_rules
for each row execute function public.set_updated_at();

create index if not exists idx_monitor_context_rules_enabled_priority
  on public.monitor_context_rules (enabled, priority);

alter table public.monitor_context_rules enable row level security;
revoke all on public.monitor_context_rules from anon, authenticated;

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  priority,
  memo
) values (
  'ga_sales_commission_1200',
  '1200%룰·GA 판매수수료 문맥',
  'regulation',
  'caution',
  array['1200%', '1200％', '1200%룰', '1200% 룰', '판매수수료', '모집수수료', '정착지원금', '부당승환', '승환계약', '설계사 영입', '스카우트 경쟁'],
  array['보험', '보험사', '생명보험', '손해보험', '보험대리점', '법인보험대리점', 'GA', '보험GA', '보험설계사', '설계사', '보험모집인', '보험계약', '금감원', '금융감독원', '금융위', '금융위원회', '보험업법'],
  array['수익률', '주식', '증권', '코스피', '코스닥', 'SK하이닉스', '하이닉스', '삼성전자', '반도체', '제약바이오', '바이오', '신세계', '백화점', '가구', '유튜브', '숭실대', '대학생', 'IPO', '공모주', '코인'],
  10,
  '빅카인즈 보험 1200% 검색 샘플 기준. 1200% 단독 검색어는 주식 수익률·유통 노이즈가 많아 보험 판매채널 문맥을 필수 조건으로 둔다.'
) on conflict (rule_key) do update
set label = excluded.label,
    category = excluded.category,
    tone = excluded.tone,
    trigger_terms = excluded.trigger_terms,
    required_terms = excluded.required_terms,
    exclude_terms = excluded.exclude_terms,
    priority = excluded.priority,
    memo = excluded.memo,
    enabled = true;
