-- Classification review batch 2026-06-23.
-- Purpose: keep a labeled validation set and apply the first measured correction pass.

begin;

create table if not exists public.monitor_classification_review_cases (
  review_batch text not null,
  article_id bigint not null,
  expected_category text not null
    check (expected_category in ('own', 'regulation', 'competitor', 'industry', 'sponsorship', 'other', 'exclude')),
  expected_tone text not null
    check (expected_tone in ('positive', 'neutral', 'caution', 'negative', 'exclude')),
  expected_visible boolean not null default true,
  review_note text,
  reviewer text not null default 'codex',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (review_batch, article_id)
);

drop trigger if exists set_monitor_classification_review_cases_updated_at
  on public.monitor_classification_review_cases;
create trigger set_monitor_classification_review_cases_updated_at
before update on public.monitor_classification_review_cases
for each row execute function public.set_updated_at();

alter table public.monitor_classification_review_cases enable row level security;
revoke all on public.monitor_classification_review_cases from anon, authenticated;

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
  ('exclude_obituary_notice_v1', '부고·인사 단신 제외', 'exclude', 'exclude',
   array['부고', '모친상', '부친상', '별세', '인사', '승진'],
   array[]::text[],
   array['인카금융서비스', '보험상품', '보험계약', '보험대리점', 'GA', '설계사', '금융당국'],
   6, true, '부고·인사 단신은 보도량 집계와 주요 이슈에서 제외한다.', 'notice_noise', 'exclude', 'exclude_from_dashboard', false, '생명보험협회 부고 기사 제외'),
  ('exclude_general_capital_market_policy_v1', '일반 자본시장 정책 제외', 'exclude', 'exclude',
   array['의무공개매수', '공개매수', '자본시장', 'PF 공적보증', '투기성 수요', '사모펀드', 'PEF', '벤처펀드'],
   array[]::text[],
   array['보험', '보험사', '생명보험', '손해보험', '보험대리점', 'GA', '보험설계사', '판매수수료', '1200%', '정착지원금'],
   7, true, '금융위·금감원 문구가 있어도 보험/GA 원문 문맥이 없으면 제외한다.', 'non_insurance_finance', 'exclude', 'exclude_from_dashboard', false, '일반 자본시장 정책 기사 제외'),
  ('include_insurance_product_trend_v1', '보험상품·보장 구조 동향', 'industry', 'neutral',
   array['치매보험', '실손보험', '건강보험', '신용생명보험', '외화증권', '보험 신상품', '보험상품', '손해율'],
   array['보험'],
   array['국민건강보험', '건강보험공단', '요양급여'],
   24, true, '보험상품, 보장 구조, 손해율 등 보험시장 흐름은 업계 동향으로 보존한다.', 'insurance_product', 'classify', 'industry_neutral', true, '치매보험·실손보험 동향 보존'),
  ('include_insurer_performance_brand_v1', '보험사 성과·서비스 품질 보도', 'competitor', 'neutral',
   array['우수콜센터', '서비스품질', '우수인증설계사', '브랜드평판', '지역 거점', '제휴', '후원'],
   array['생명', '손보', '손해보험', '생명보험', '보험사', '보험'],
   array['인카금융서비스', '인카금융'],
   25, true, '보험사 단위 성과·제휴·거점 강화는 경쟁/보험사 동향으로 분리한다.', 'insurer_activity', 'classify', 'competitor_neutral', true, 'NH농협생명·DB손보 등 보험사 활동 보존'),
  ('own_shareholder_return_positive_v1', '당사 주주환원·공시성 우호 보도', 'own', 'positive',
   array['인카금융서비스', '인카금융', '자사주', '자기주식', '소각', '취득', '신탁계약', '주주환원', '실적', '쾌속질주'],
   array['인카금융'],
   array['52주', '단순 시세표', '종목 시황'],
   14, true, '당사 직접 언급과 주주환원·실적 성과가 함께 나오면 긍정 보도로 분류한다.', 'own_positive', 'classify', 'own_positive', true, '자사주 매입·소각 보도는 긍정')
on conflict (rule_key) do update
set label = excluded.label,
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

insert into public.monitor_classification_review_cases (
  review_batch,
  article_id,
  expected_category,
  expected_tone,
  expected_visible,
  review_note
) values
  ('review_20260623_stratified_65', 6401, 'industry', 'neutral', true, '실손보험 손해율'),
  ('review_20260623_stratified_65', 7371, 'competitor', 'neutral', true, '보험사 브리핑 모음'),
  ('review_20260623_stratified_65', 8006, 'other', 'exclude', false, '금융소비자보호 일반 교육, 보험/GA 직접 문맥 부족'),
  ('review_20260623_stratified_65', 8019, 'other', 'neutral', false, 'PEF협회/사모펀드 일반 기사'),
  ('review_20260623_stratified_65', 8173, 'industry', 'neutral', true, '의료배상/재보험 컨소시엄'),
  ('review_20260623_stratified_65', 8279, 'competitor', 'neutral', true, '경쟁 GA 리포트'),
  ('review_20260623_stratified_65', 8504, 'competitor', 'neutral', true, '삼성화재 우수인증설계사 성과'),
  ('review_20260623_stratified_65', 9045, 'own', 'positive', true, '자사주 매입/소각 주주환원'),
  ('review_20260623_stratified_65', 9085, 'competitor', 'neutral', true, '경쟁 GA 성과'),
  ('review_20260623_stratified_65', 9599, 'own', 'positive', true, '자기주식 취득 신탁계약'),
  ('review_20260623_stratified_65', 9942, 'own', 'neutral', true, '당사 사업단/컨설팅 소개'),
  ('review_20260623_stratified_65', 10981, 'own', 'positive', true, '상장 GA 실적 흐름 속 당사 긍정 맥락'),
  ('review_20260623_stratified_65', 11030, 'industry', 'neutral', true, '생보사 시니어 사업 흐름'),
  ('review_20260623_stratified_65', 11348, 'regulation', 'caution', true, '보험사 CFO 소집/달러보험 관리'),
  ('review_20260623_stratified_65', 12039, 'industry', 'neutral', true, '우수인증설계사 제도'),
  ('review_20260623_stratified_65', 12320, 'competitor', 'caution', true, 'GA 브랜드평판 1위, 인카와 초박빙'),
  ('review_20260623_stratified_65', 12326, 'competitor', 'caution', true, 'GA 브랜드평판 1위, 인카 대비 경쟁 신호'),
  ('review_20260623_stratified_65', 12328, 'competitor', 'caution', true, 'GA 브랜드평판 1위, 인카 대비 경쟁 신호'),
  ('review_20260623_stratified_65', 12645, 'own', 'caution', true, '자사주 공시 목록 포함'),
  ('review_20260623_stratified_65', 14550, 'other', 'exclude', false, '경쟁 보험사 스포츠 캠페인 단순 노출'),
  ('review_20260623_stratified_65', 17273, 'sponsorship', 'positive', true, '당사 KLPGA 후원'),
  ('review_20260623_stratified_65', 17867, 'other', 'exclude', false, '부고'),
  ('review_20260623_stratified_65', 17873, 'industry', 'neutral', true, '치매보험 상품 구조 변화'),
  ('review_20260623_stratified_65', 18160, 'other', 'exclude', false, 'VC펀드 출자자에 교보생명 언급'),
  ('review_20260623_stratified_65', 18516, 'industry', 'neutral', true, '러닝 보험 상품 흐름'),
  ('review_20260623_stratified_65', 18648, 'regulation', 'neutral', true, '해외 규제혁신과 보험산업 시사점'),
  ('review_20260623_stratified_65', 18829, 'industry', 'neutral', true, 'AI 신용/보험 심사 인프라'),
  ('review_20260623_stratified_65', 18868, 'competitor', 'neutral', true, 'NH농협생명 서비스품질 인증'),
  ('review_20260623_stratified_65', 18977, 'sponsorship', 'neutral', true, '당사 대회 출전/전망'),
  ('review_20260623_stratified_65', 19071, 'other', 'exclude', false, '정치/선거 기사'),
  ('review_20260623_stratified_65', 19295, 'other', 'exclude', false, '메가박스 동명이슈'),
  ('review_20260623_stratified_65', 19347, 'other', 'exclude', false, '프로야구 접근성 기사'),
  ('review_20260623_stratified_65', 19368, 'other', 'exclude', false, '게임/프로야구 언급 기사'),
  ('review_20260623_stratified_65', 19469, 'other', 'exclude', false, '의무공개매수 제도 일반'),
  ('review_20260623_stratified_65', 19698, 'sponsorship', 'neutral', true, '당사 대회 시설/브랜드 노출'),
  ('review_20260623_stratified_65', 19717, 'competitor', 'neutral', true, '경쟁 GA 표창'),
  ('review_20260623_stratified_65', 19767, 'other', 'exclude', false, '프로농구 기사'),
  ('review_20260623_stratified_65', 19870, 'other', 'exclude', false, '프로농구 기사'),
  ('review_20260623_stratified_65', 20065, 'other', 'exclude', false, '메가박스 문화체험'),
  ('review_20260623_stratified_65', 20207, 'other', 'exclude', false, '메가커피 동명이슈'),
  ('review_20260623_stratified_65', 20392, 'competitor', 'neutral', true, '삼성화재 상품/브랜드 기사'),
  ('review_20260623_stratified_65', 20435, 'other', 'exclude', false, '메가박스 동명이슈'),
  ('review_20260623_stratified_65', 20515, 'other', 'exclude', false, '중앙그룹/메가박스 기사'),
  ('review_20260623_stratified_65', 20521, 'other', 'exclude', false, '프로야구 기사'),
  ('review_20260623_stratified_65', 20549, 'other', 'exclude', false, 'NBA/메가톤급 동명이슈'),
  ('review_20260623_stratified_65', 20550, 'other', 'exclude', false, '프로농구 기사'),
  ('review_20260623_stratified_65', 20611, 'sponsorship', 'neutral', true, '당사 대회 포토'),
  ('review_20260623_stratified_65', 20813, 'sponsorship', 'neutral', true, '당사 대회 포토'),
  ('review_20260623_stratified_65', 20863, 'industry', 'neutral', true, '기상데이터와 보험산업 협력'),
  ('review_20260623_stratified_65', 20893, 'other', 'exclude', false, '연예/프로야구 언급 기사'),
  ('review_20260623_stratified_65', 21050, 'other', 'exclude', false, 'PF 공적보증 일반'),
  ('review_20260623_stratified_65', 21062, 'industry', 'neutral', true, '보험 신상품 흐름'),
  ('review_20260623_stratified_65', 21063, 'industry', 'neutral', true, '생보사 외화증권 운용'),
  ('review_20260623_stratified_65', 21234, 'other', 'exclude', false, '여전사/저축은행 책무구조도'),
  ('review_20260623_stratified_65', 21388, 'other', 'exclude', false, '롯데카드 해킹 제재'),
  ('review_20260623_stratified_65', 21510, 'competitor', 'neutral', true, '롯데손보 제휴'),
  ('review_20260623_stratified_65', 21513, 'competitor', 'neutral', true, 'KB손보 후원/브랜드 활동'),
  ('review_20260623_stratified_65', 21862, 'other', 'exclude', false, '롯데카드 해킹 제재'),
  ('review_20260623_stratified_65', 21886, 'industry', 'neutral', true, '생명보험사 영업왕 평균 연령은 특정 경쟁사보다 업계 동향'),
  ('review_20260623_stratified_65', 21929, 'competitor', 'neutral', true, 'DB손보 지역 거점 강화'),
  ('review_20260623_stratified_65', 21961, 'sponsorship', 'neutral', true, '당사 대회 포토'),
  ('review_20260623_stratified_65', 21962, 'sponsorship', 'neutral', true, '당사 대회 포토'),
  ('review_20260623_stratified_65', 22086, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 결과'),
  ('review_20260623_stratified_65', 22089, 'sponsorship', 'neutral', true, '당사 대회 포토'),
  ('review_20260623_stratified_65', 22099, 'sponsorship', 'neutral', true, '당사 대회 포토')
on conflict (review_batch, article_id) do update
set expected_category = excluded.expected_category,
    expected_tone = excluded.expected_tone,
    expected_visible = excluded.expected_visible,
    review_note = excluded.review_note,
    reviewer = excluded.reviewer,
    updated_at = now();

update public.news_articles
set category = 'competitor',
    tone = 'caution',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'industry',
    classification_provider = 'review:20260623:ga_brand_reputation_caution',
    classification_reason = 'GA 브랜드평판에서 경쟁사가 1위이고 인카와 비교되는 기사라 긍정이 아니라 경쟁 주의 신호로 분류합니다.',
    classification_evidence = 'GA 브랜드평판 1위·인카 대비 경쟁 신호',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.93),
    clipping_recommended = true,
    clipping_reason = '경쟁 GA 브랜드 노출과 인카 대비 평판 흐름을 확인합니다.',
    updated_at = now()
where id in (12326, 12328);

update public.news_articles
set category = 'industry',
    tone = 'neutral',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'review:20260623:industry_general',
    classification_reason = '특정 경쟁사 리스크보다 보험업계 일반 흐름으로 보는 것이 맞습니다.',
    classification_evidence = '생보사 시니어 사업·영업왕 연령 등 업계 구조 변화',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.9),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
where id in (11030, 21886);

update public.news_articles
set category = 'competitor',
    tone = 'neutral',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'review:20260623:insurer_activity',
    classification_reason = '보험사 성과·제휴·거점 강화 기사로 경쟁/보험사 동향에 해당합니다.',
    classification_evidence = '보험사 서비스 품질, 제휴, 지역 거점, 우수인증설계사 성과',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.9),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
where id in (7371, 8504, 18868, 21510, 21929);

update public.news_articles
set category = 'industry',
    tone = 'neutral',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'review:20260623:insurance_product_trend',
    classification_reason = '치매보험 상품 구조 변화는 보험상품 시장 흐름으로 보존합니다.',
    classification_evidence = '치매보험 상품 구조 변화',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.9),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
where id = 17873;

update public.news_articles
set category = 'regulation',
    tone = 'neutral',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'review:20260623:insurance_regulation_signal',
    classification_reason = '해외 규제혁신 사례가 보험산업 시사점으로 연결되는 기사입니다.',
    classification_evidence = '보험산업 규제혁신 시사점',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.88),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
where id = 18648;

update public.news_articles
set category = 'own',
    tone = 'positive',
    status = 'classified',
    own_mentioned = true,
    negative_target = 'none',
    classification_provider = 'review:20260623:own_shareholder_return_positive',
    classification_reason = '당사 직접 언급과 주주환원·실적 우호 신호가 함께 확인되어 긍정 보도로 분류합니다.',
    classification_evidence = '자사주 매입·소각, 자기주식 취득, 상장 GA 실적 흐름 속 당사 언급',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.93),
    clipping_recommended = true,
    clipping_reason = '당사 우호 보도 또는 IR/평판 활용 후보입니다.',
    updated_at = now()
where id in (9045, 9599, 10981);

update public.news_articles
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'review:20260623:general_finance_or_notice_noise',
    classification_reason = '보험/GA 직접 문맥이 부족하거나 부고·일반 자본시장 정책 기사라 주요 모니터링에서 제외합니다.',
    classification_evidence = '금융소비자보호 일반 교육, 부고, VC/PEF, 의무공개매수, PF 보증 일반',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.94),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
where id in (8006, 17867, 18160, 19469, 21050);

commit;
