alter table public.monitor_keywords
  add column if not exists match_mode text not null default 'keyword',
  add column if not exists context_terms text[] not null default '{}',
  add column if not exists exclude_terms text[] not null default '{}',
  add column if not exists priority integer not null default 100,
  add column if not exists memo text;

alter table public.monitor_keywords
  drop constraint if exists monitor_keywords_match_mode_check;

alter table public.monitor_keywords
  add constraint monitor_keywords_match_mode_check
  check (match_mode in ('keyword', 'context', 'strict', 'exact'));

create index if not exists idx_monitor_keywords_enabled_priority
  on public.monitor_keywords (enabled, category, priority, created_at);

update public.monitor_keywords
   set match_mode = 'context',
       context_terms = array['글로벌금융판매', '보험', '보험대리점', '법인보험대리점', 'GA', '보험GA', '설계사'],
       exclude_terms = array['글로벌 금융시장', '글로벌 금융위기', '글로벌 금융 안정', '글로벌 금융 허브'],
       priority = least(priority, 20),
       memo = coalesce(memo, 'GA 경쟁사 키워드로 쓰는 경우 글로벌 금융 일반 뉴스와 분리한다.')
 where keyword in ('글로벌금융', '글로벌 금융')
   and category in ('competitor', 'industry');

update public.monitor_keywords
   set match_mode = 'context',
       context_terms = array['메가금융서비스', '보험', '보험대리점', '법인보험대리점', 'GA', '보험GA', '설계사'],
       exclude_terms = array['메가커피', '메가MGC', '메가박스', '메가스터디', '메가 히트', '메가 런치', '메가 세일', '메가 이벤트'],
       priority = least(priority, 20),
       memo = coalesce(memo, 'GA 경쟁사 키워드로 쓰는 경우 메가 일반 생활·유통 뉴스와 분리한다.')
 where keyword in ('메가', '메가금융')
   and category in ('competitor', 'industry');

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
) values
(
  'insurance_keyword_real_estate_noise',
  '보험 키워드 부동산 거래 오탐 제외',
  'exclude',
  'exclude',
  array['오피스빌딩', '사무실', '거래금액', '거래량', '부동산', '임대료', '상업용 부동산'],
  array['생명보험', '손해보험', '보험'],
  array['보험상품', '보험금', '보험료', '보험계약', '보험대리점', 'GA', '설계사', '금감원', '금융위'],
  8,
  '생명보험/손해보험 키워드에 부동산 거래 기사들이 끼는 현상을 줄인다. 보험 상품·감독·판매채널 문맥이면 제외하지 않는다.'
)
on conflict (rule_key) do update
set label = excluded.label,
    category = excluded.category,
    tone = excluded.tone,
    trigger_terms = excluded.trigger_terms,
    required_terms = excluded.required_terms,
    exclude_terms = excluded.exclude_terms,
    priority = excluded.priority,
    memo = excluded.memo,
    enabled = true;
