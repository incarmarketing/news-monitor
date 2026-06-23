-- Classification operating model.
-- Goal: stop one-off code exceptions by keeping category definitions, context rules,
-- and regression examples in Supabase as an editable operating ledger.

create table if not exists public.monitor_classification_taxonomy (
  category text not null,
  subcategory text not null,
  label text not null,
  purpose text,
  include_guidance text,
  exclude_guidance text,
  dashboard_priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category, subcategory)
);

drop trigger if exists set_monitor_classification_taxonomy_updated_at on public.monitor_classification_taxonomy;
create trigger set_monitor_classification_taxonomy_updated_at
before update on public.monitor_classification_taxonomy
for each row execute function public.set_updated_at();

alter table public.monitor_classification_taxonomy enable row level security;
revoke all on public.monitor_classification_taxonomy from anon, authenticated;

alter table public.monitor_context_rules
  add column if not exists rule_group text,
  add column if not exists rule_type text not null default 'classify',
  add column if not exists decision text,
  add column if not exists dashboard_visible boolean not null default true,
  add column if not exists test_note text;

alter table public.monitor_context_rules
  drop constraint if exists monitor_context_rules_rule_type_check;

alter table public.monitor_context_rules
  add constraint monitor_context_rules_rule_type_check
  check (rule_type in ('classify', 'exclude', 'tone', 'priority', 'guardrail'));

create table if not exists public.monitor_classification_test_cases (
  case_key text primary key,
  title text not null,
  body text not null default '',
  source text,
  keyword text,
  expected_category text not null,
  expected_tone text not null,
  expected_in_dashboard boolean not null default true,
  reason text,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_monitor_classification_test_cases_updated_at on public.monitor_classification_test_cases;
create trigger set_monitor_classification_test_cases_updated_at
before update on public.monitor_classification_test_cases
for each row execute function public.set_updated_at();

alter table public.monitor_classification_test_cases enable row level security;
revoke all on public.monitor_classification_test_cases from anon, authenticated;

insert into public.monitor_classification_taxonomy (
  category,
  subcategory,
  label,
  purpose,
  include_guidance,
  exclude_guidance,
  dashboard_priority
) values
  ('own', 'direct_company', '당사 직접 보도', '인카금융서비스가 기사 주체로 직접 언급된 기사', '회사명, 임원, 실적, 영업조직, 브랜드평판, 주가, 공시가 실제 기사 제목/본문에 등장', '보험업계 일반 기사에 당사가 언급되지 않으면 제외', 10),
  ('own', 'quality_award', '당사 성과/품질', '우수인증설계사, 수상, 평판, 사회공헌 등 우호 활용 후보', '당사 직접 언급과 성과성 표현이 함께 있을 때', '협회 전체 발표만 있고 당사명이 없으면 업계 동향', 11),
  ('regulation', 'sales_commission', '수수료/1200%룰', '보험/GA 판매수수료와 정착지원금 제도 변화', '보험, GA, 보험설계사, 법인보험대리점, 수수료, 정착지원금, 부당승환 문맥', '카드, 증권, 은행, 가상자산 수수료 기사', 20),
  ('regulation', 'supervision', '감독/검사/제재', '보험/GA 관련 금융당국 감독 이슈', '보험·GA·설계사 문맥과 금융위/금감원 감독 신호가 함께 있을 때', '금감원 전자공시시스템을 단순 출처로 인용한 비보험 기업 실적 기사', 21),
  ('competitor', 'ga_competitor', 'GA 경쟁사', '대형 GA 및 보험대리점 경쟁 환경', '경쟁 GA명, 설계사수, 정착률, 매출, 브랜드평판, 제휴, 영업조직 문맥', '동명이인, 스포츠, 음식점, 영화관 등 브랜드 오탐', 30),
  ('industry', 'insurance_company', '보험사/업계 동향', '보험사 상품, 실적, 채널, 소비자보호 흐름', '생명보험, 손해보험, 보험상품, 보험계약, 손해율, 보험금, 실손 문맥', '스포츠 후원, 단순 광고, 비보험 금융업권', 40),
  ('sponsorship', 'brand_event', '브랜드/스폰서십', '당사 주최·후원 행사 노출', '인카금융 더헤븐 마스터즈처럼 당사 주최/후원 명칭이 확인되는 기사', '단순 골프 경기 기사 중 당사 브랜드 맥락이 없으면 제외', 50),
  ('exclude', 'non_insurance_finance', '비보험 금융 노이즈', '보험/GA 업무와 무관한 금융권 일반 기사 제거', '카드, 은행, 증권, 가상자산, 대출 등 비보험 업권이 주제이고 보험/GA 문맥이 없을 때', '보험사·GA가 기사 주체로 등장하면 제외하지 않음', 90),
  ('exclude', 'sports_noise', '스포츠/포토 노이즈', '보험사명 또는 설계사 단어 때문에 유입된 스포츠 기사 제거', '프로야구, 프로농구, 프로배구, 골프 경기, 포토 기사', '당사 주최/후원 브랜드 노출 기사는 스폰서십으로 분리', 91)
on conflict (category, subcategory) do update
set
  label = excluded.label,
  purpose = excluded.purpose,
  include_guidance = excluded.include_guidance,
  exclude_guidance = excluded.exclude_guidance,
  dashboard_priority = excluded.dashboard_priority,
  enabled = true,
  updated_at = now();

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  priority,
  enabled,
  memo,
  rule_group,
  rule_type,
  decision,
  dashboard_visible,
  test_note
) values
  ('exclude_non_insurance_disclosure_noise', '비보험 전자공시/가상자산 실적 노이즈', 'exclude', 'exclude',
   array['두나무','업비트','빗썸','코인거래소','가상자산','전자공시시스템','DART','공시시스템','영업이익','순이익'],
   array['전자공시시스템','영업이익','순이익','매출','가상자산','코인'],
   array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','1200%','정착지원금','부당승환','판매수수료'],
   8, true, '금융감독원 전자공시시스템은 출처성 문구일 수 있으므로 보험/GA 문맥 없으면 제외', 'non_insurance_finance', 'exclude', 'exclude_from_dashboard', false, '두나무 실적 기사는 주요 이슈 제외'),
  ('exclude_non_insurance_card_bank_security', '카드·은행·증권 일반 감독 노이즈', 'exclude', 'exclude',
   array['롯데카드','카드사','신용카드','은행권','증권사','한국투자증권','새마을금고','가계대출','주택담보대출'],
   array['금융위','금융위원회','금감원','금융감독원','제재','해킹','내부통제','보고의무','공시','감독'],
   array['보험','GA','보험설계사','법인보험대리점','보험대리점','1200%','정착지원금','판매수수료','부당승환'],
   9, true, '비보험 금융업권 감독 기사는 보험/GA 원문 문맥 없으면 제외', 'non_insurance_finance', 'exclude', 'exclude_from_dashboard', false, '롯데카드 해킹 제재는 주요 이슈 제외'),
  ('include_insurance_ga_sales_conduct', '보험/GA 판매질서 문맥', 'regulation', 'caution',
   array['1200%','1200%룰','판매수수료','모집수수료','정착지원금','부당승환','승환계약','불완전판매'],
   array['보험','보험사','GA','보험GA','보험설계사','설계사','보험대리점','법인보험대리점','보험계약'],
   array['카드','증권','은행','가상자산','코인','주식수익률'],
   12, true, '보험/GA 판매채널과 함께 등장할 때만 정책/주의로 분류', 'sales_conduct', 'classify', 'regulation_caution', true, '1200%룰 기사는 보험/GA 문맥 필수'),
  ('include_own_positive_quality_award', '당사 품질/성과 보도', 'own', 'positive',
   array['인카금융서비스','인카금융','우수인증설계사','최다','1위','수상','선정','배출'],
   array['인카금융','인카금융서비스'],
   array['스포츠','포토','단순 순위표 후순위'],
   13, true, '당사 직접 언급과 성과성 표현이 함께 있으면 긍정으로 분류', 'own_quality', 'classify', 'own_positive', true, '우수인증설계사 당사 보도는 긍정'),
  ('exclude_sports_photo_noise', '스포츠/포토 노이즈', 'exclude', 'exclude',
   array['프로야구','프로농구','프로배구','KBO','축구','골프','KLPGA','포토','티샷','라운드'],
   array['선수','경기','대회','라운드','순위','스코어','포토'],
   array['인카금융 더헤븐','인카금융서비스','보험대리점','법인보험대리점','보험설계사','1200%','정착지원금'],
   20, true, '보험사 스포츠 후원 또는 설계사 동명이슈는 업무 관련성이 낮으면 제외', 'sports_noise', 'exclude', 'exclude_from_dashboard', false, '스포츠 기사는 당사 브랜드 맥락 없으면 제외')
on conflict (rule_key) do update
set
  label = excluded.label,
  category = excluded.category,
  tone = excluded.tone,
  trigger_terms = excluded.trigger_terms,
  required_terms = excluded.required_terms,
  exclude_terms = excluded.exclude_terms,
  priority = excluded.priority,
  enabled = excluded.enabled,
  memo = excluded.memo,
  rule_group = excluded.rule_group,
  rule_type = excluded.rule_type,
  decision = excluded.decision,
  dashboard_visible = excluded.dashboard_visible,
  test_note = excluded.test_note,
  updated_at = now();

insert into public.monitor_classification_test_cases (
  case_key,
  title,
  body,
  source,
  keyword,
  expected_category,
  expected_tone,
  expected_in_dashboard,
  reason
) values
  ('exclude_dunamu_disclosure_earnings', '수수료 장사에 갇힌 두나무…거래 급감에 영업이익 78% 추락', '금융감독원 전자공시시스템에 따르면 두나무 매출과 영업이익이 감소했다.', 'sjsori.com', '금융감독원', 'other', 'exclude', false, '전자공시시스템 출처성 문구이며 보험/GA 문맥 없음'),
  ('exclude_lotte_card_hacking_sanction', '금융위, 다음달 롯데카드 제재 절차 마무리', '롯데카드 해킹 사안과 제재 절차를 다룬 기사입니다.', 'newscj.com', '금융감독원', 'other', 'exclude', false, '카드사 제재 기사로 보험/GA 문맥 없음'),
  ('include_ga_1200_rule', '설계사 쟁탈전에 소비자 피해 불똥…1200%룰 앞두고 보험업계 긴장', 'GA 업계 정착지원금 경쟁과 부당승환 우려를 다룬 기사입니다.', '뉴시스', '1200%', 'regulation', 'caution', true, '보험/GA 판매질서 핵심 정책 이슈'),
  ('own_positive_certified_agent', '인카금융서비스, 우수인증설계사 2262명 배출', '인카금융서비스가 GA업계 최다 규모 우수인증설계사를 배출했다.', '보험매일', '인카금융서비스', 'own', 'positive', true, '당사 직접 성과성 보도'),
  ('exclude_generic_sports_photo', '[포토] 서교림 인카금융 와이어투 와이어 우승', '골프 경기 장면 중심 포토 기사입니다.', 'ppss.kr', '인카금융', 'sponsorship', 'neutral', false, '당사 주최 브랜드 맥락이 약한 경기/포토성 기사는 일반 주요 이슈에서 제외')
on conflict (case_key) do update
set
  title = excluded.title,
  body = excluded.body,
  source = excluded.source,
  keyword = excluded.keyword,
  expected_category = excluded.expected_category,
  expected_tone = excluded.expected_tone,
  expected_in_dashboard = excluded.expected_in_dashboard,
  reason = excluded.reason,
  enabled = true,
  updated_at = now();
