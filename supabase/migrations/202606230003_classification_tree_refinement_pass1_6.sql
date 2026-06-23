-- Classification tree refinement, pass 1-6.
-- Purpose: reduce dashboard noise without adding AI calls.
-- Evidence text intentionally excludes the search keyword to avoid false context.

begin;

insert into public.monitor_classification_taxonomy (
  category, subcategory, label, purpose, include_guidance, exclude_guidance, dashboard_priority
) values
  ('exclude', 'non_insurance_fintech_disclosure', '비보험 핀테크/공시 노이즈', '금감원·금융위 키워드 때문에 유입된 가상자산, 전자금융, 전자공시 일반 기사를 주요 모니터링에서 제외합니다.', '두나무, 업비트, 가상자산, 핀테크 샌드박스, 전자공시시스템처럼 보험/GA 문맥이 없는 금융권 일반 기사', '보험사, GA, 보험대리점, 보험설계사, 판매수수료, 1200%룰, 부당승환 등 보험 영업 문맥이 있으면 제외하지 않습니다.', 91),
  ('exclude', 'non_insurance_card_bank_security', '비보험 카드·은행·증권 노이즈', '카드사, 은행, 증권사 제재/해킹/공시 기사 중 보험·GA 관련성이 없는 기사를 제외합니다.', '롯데카드 해킹, 은행권 제재, 증권사 보고의무, 대출·새마을금고 일반 감독 기사', '보험/GA/설계사/판매수수료/부당승환/보험계약 문맥이 함께 있으면 제외하지 않습니다.', 92),
  ('exclude', 'sports_photo_noise', '스포츠·포토 노이즈', '동명이슈, 포토 기사, 스포츠 경기 기사처럼 언론관리 판단에 쓰기 어려운 기사를 제외합니다.', '프로야구, 프로농구, 프로배구, KBO, 축구, 골프, KLPGA, 티샷, 라운드, 포토 기사', '인카금융서비스 주최/후원 맥락이 명확한 경우 sponsorship으로 별도 관리합니다.', 93),
  ('exclude', 'public_welfare_health_noise', '공적복지·건보 노이즈', '국민건강보험, 복지부, 요양급여 등 민영 보험/GA와 다른 공적 보건·복지 기사를 제외합니다.', '국민건강보험공단, 건강보험공단, 복지부, 요양급여, 비급여 일반 의료 정책', '실손보험, 보험금, 보험사, 보험사기, 손해율 등 민영 보험 문맥이 있으면 제외하지 않습니다.', 94),
  ('exclude', 'shipping_macro_insurance_noise', '해운·거시 보험료 노이즈', '호르무즈, 선박, 해운 보험료처럼 보험이라는 단어만 있는 거시·해운 기사를 제외합니다.', '호르무즈 해협, 선박 통항, 유조선, 원유, 해운 보험료 부담 기사', '손해보험사, 보험상품, 보험계약, 보험업계 영업·규제 문맥이 있으면 제외하지 않습니다.', 95),
  ('exclude', 'stock_market_listing_noise', '주식시황·시세표 노이즈', '단순 시황, 52주 고저가, 장중 수급, 특징주 기사 중 PR 주요 이슈가 아닌 항목을 제외합니다.', '52주 최고가/최저가, 장중수급, 코스피·코스닥 마감시황, 단순 시세표 기사', '인카금융서비스 직접 언급, 보험업계 분석, 보험주 섹터 분석은 별도 판단합니다.', 96)
on conflict (category, subcategory) do update
set label = excluded.label,
    purpose = excluded.purpose,
    include_guidance = excluded.include_guidance,
    exclude_guidance = excluded.exclude_guidance,
    dashboard_priority = excluded.dashboard_priority,
    enabled = true,
    updated_at = now();

insert into public.monitor_context_rules (
  rule_key, label, category, tone, trigger_terms, required_terms, exclude_terms, priority,
  enabled, memo, rule_group, rule_type, decision, dashboard_visible, test_note
) values
  ('exclude_non_insurance_fintech_disclosure_v2', '비보험 핀테크·전자공시 제외', 'exclude', 'exclude',
   array['두나무','업비트','빗썸','코인원','코빗','가상자산','암호화폐','전자공시시스템','공시시스템','DART','핀테크','전자금융','결제대행','PG사'],
   array[]::text[],
   array['인카금융','생명보험','손해보험','보험사','보험회사','보험업계','보험상품','보험계약','보험대리점','법인보험대리점','보험설계사','보험GA','1200%','정착지원금','판매수수료','부당승환','승환계약'],
   8, true, '금감원/금융위 검색어로 유입된 비보험 핀테크·공시성 기사를 주요 이슈에서 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '두나무·핀테크 샌드박스 기사 제외'),
  ('exclude_non_insurance_card_bank_security_v2', '비보험 카드·은행·증권 제외', 'exclude', 'exclude',
   array['롯데카드','카드사','신용카드','은행권','은행업','한국투자증권','투자증권','증권사','금융투자','저축은행','새마을금고','가계대출','주택담보대출','대부업','캐피탈'],
   array[]::text[],
   array['인카금융','생명보험','손해보험','보험사','보험회사','보험업계','보험상품','보험계약','보험대리점','법인보험대리점','보험설계사','보험GA','1200%','정착지원금','판매수수료','부당승환','승환계약','미래에셋생명','한화생명','교보생명','삼성생명','흥국생명','동양생명','DB손해보험','KB손해보험','롯데손해보험','NH농협손해보험','농협손해보험','메리츠화재','삼성화재','현대해상','DB손보','KB손보','롯데손보'],
   9, true, '카드·은행·증권 제재/해킹 기사는 보험/GA 문맥이 없으면 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '롯데카드 해킹 제재 기사 제외. 보험사명이 함께 나오면 제외하지 않음'),
  ('exclude_sports_photo_noise_v2', '스포츠·포토 제외', 'exclude', 'exclude',
   array['프로야구','프로농구','프로배구','KBO','축구','월드컵','KLPGA','US오픈','티샷','라운드','골프','[포토]','포토뉴스'],
   array[]::text[],
   array['인카금융','인카금융서비스','보험대리점','법인보험대리점','보험설계사','보험GA','1200%','정착지원금','판매수수료','부당승환'],
   20, true, '스포츠 경기·포토성 기사는 당사 브랜드 맥락이 없으면 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '일반 스포츠/포토 기사 제외'),
  ('exclude_public_welfare_health_noise_v2', '공적복지·건보 제외', 'exclude', 'exclude',
   array['국민건강보험공단','건강보험공단','보건복지부','복지부','요양급여','건강보험 부당 청구','가짜진료','진료행위','비급여'],
   array[]::text[],
   array['인카금융','생명보험','손해보험','보험사','보험회사','보험업계','보험상품','보험계약','보험대리점','법인보험대리점','보험설계사','보험GA','보험사기','보험금','보험료','실손','손해율','1200%','정착지원금','판매수수료','부당승환'],
   21, true, '공적 건강보험/복지부 의료정책은 민영보험 문맥이 없으면 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '건보/복지부 일반 의료 기사 제외'),
  ('exclude_shipping_macro_insurance_noise_v2', '해운·거시 보험료 제외', 'exclude', 'exclude',
   array['호르무즈','이란','해협','유조선','해운','선박','통항','해상 통항','중동','원유','국제해사기구','IMO'],
   array['보험','보험료','보험수수료','통항료','위험해역'],
   array['인카금융','생명보험','손해보험','보험사','보험회사','보험업계','보험상품','보험계약','보험대리점','법인보험대리점','보험설계사','보험GA','1200%','정착지원금','판매수수료','부당승환'],
   22, true, '해운/거시 리스크 속 보험료 언급은 보험업 영업 이슈가 아니면 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '호르무즈 선박 보험료 기사 제외'),
  ('exclude_stock_market_listing_noise_v2', '단순 주식시황·시세표 제외', 'exclude', 'exclude',
   array['52주','최고가','최저가','장중','신고가','신저가','코스피','코스닥','특징주','마감시황','보험지수','업종별','테마별','장중수급'],
   array[]::text[],
   array['인카금융','보험업계','보험주','생명보험','손해보험','보험사','보험회사','GA','법인보험대리점'],
   23, true, '단순 시황/시세표는 주가 대시보드 영역이며 PR 주요 이슈에서 제외', 'exclude_noise', 'exclude', 'exclude_from_dashboard', false, '단순 52주/장중수급 기사 제외')
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

insert into public.monitor_classification_test_cases (
  case_key, title, body, source, keyword, expected_category, expected_tone, expected_in_dashboard, reason
) values
  ('tree_pass1_dunamu_disclosure', '수수료 장사에 갇힌 두나무…거래 급감에 영업이익 78% 추락', '금융감독원 전자공시시스템에 따르면 두나무 매출과 영업이익이 감소했다.', 'sjsori.com', '금융감독원', 'other', 'exclude', false, '전자공시시스템 출처 문구일 뿐 보험/GA 문맥이 없습니다.'),
  ('tree_pass1_fintech_sandbox', '금융규제 샌드박스 핀테크 맞춤형으로 바뀐다', '금융위가 핀테크 기업 대상 샌드박스 제도를 개편한다.', 'digitaltoday.co.kr', '금융위원회', 'other', 'exclude', false, '핀테크 일반 규제 기사로 보험/GA 영업 영향이 직접적이지 않습니다.'),
  ('tree_pass2_lotte_card_hacking', '금융위, 다음달 롯데카드 제재 절차 마무리', '롯데카드 해킹에 따른 금융당국 제재 절차 기사입니다.', 'newscj.com', '금융감독원', 'other', 'exclude', false, '카드사 제재 기사로 보험/GA 문맥이 없습니다.'),
  ('tree_pass2_bank_security', '은행권 책무구조도 제재 기준 명확해야', '은행권 내부통제 제도와 제재 기준 기사입니다.', 'newsian.co.kr', '금감원', 'other', 'exclude', false, '은행권 일반 내부통제 기사입니다.'),
  ('tree_pass3_photo_article', '[포토] 스타트업 박람회 둘러보는 금융위원회 부위원장', '행사 사진 중심의 포토 기사입니다.', 'popcornnews.net', '포토', 'other', 'exclude', false, '사진성 기사로 판단 근거 가치가 낮습니다.'),
  ('tree_pass3_sports_without_own', '프로야구 구단 보험 가입 소식', '프로야구 경기 운영 관련 기사입니다.', 'sports.example', '보험', 'other', 'exclude', false, '보험 단어가 있어도 스포츠 경기 문맥입니다.'),
  ('tree_pass4_public_health', '건강보험공단 요양급여 부당청구 점검 강화', '국민건강보험공단과 복지부가 요양급여를 점검합니다.', 'medical.example', '보험', 'other', 'exclude', false, '공적 건강보험/복지부 의료정책 기사입니다.'),
  ('tree_pass5_hormuz_shipping', '호르무즈 해협 통항 대비 선사 보험료 부담 경감', '해운 선사의 통항 보험료 부담과 관련한 금융위 보도자료입니다.', '금융위원회', '감독/검사', 'other', 'exclude', false, '해운·거시 보험료 이슈로 보험업 영업/GA 문맥이 아닙니다.'),
  ('tree_pass6_stock_listing', '52주 최고가 25개, 최저가 556개…코스피 마감', '종목별 52주 고저가를 나열한 시황 기사입니다.', 'stock.example', '보험', 'other', 'exclude', false, '단순 시황/시세표성 기사입니다.'),
  ('tree_keep_own_quality_award', '인카금융서비스, 우수인증설계사 2262명 배출', '인카금융서비스가 GA업계 최다 규모 우수인증설계사를 배출했다.', '보험매일', '인카금융서비스', 'own', 'positive', true, '당사 직접 성과 보도는 긍정 기사로 유지해야 합니다.'),
  ('tree_keep_ga_sales_rule', '설계사 쟁탈전에 소비자 피해 불똥…1200%룰 앞두고 보험업계 긴장', 'GA 업계 정착지원금 경쟁과 부당승환 우려를 다룹니다.', '뉴시스', '1200%', 'regulation', 'caution', true, '보험/GA 판매질서 문맥이므로 주요 주의 이슈입니다.'),
  ('tree_keep_mixed_finance_insurer_accident', '6년간 금융사고 1조…우리은행·미래에셋생명·롯데카드 각 업권 최다', '은행, 보험사, 카드사 업권별 금융사고 규모를 비교한 기사입니다.', 'IT조선', '금융감독원', 'industry', 'caution', true, '보험사명이 직접 포함된 금융권 종합 리스크 기사는 보험업계 동향으로 보존합니다.')
on conflict (case_key) do update
set title = excluded.title,
    body = excluded.body,
    source = excluded.source,
    keyword = excluded.keyword,
    expected_category = excluded.expected_category,
    expected_tone = excluded.expected_tone,
    expected_in_dashboard = excluded.expected_in_dashboard,
    reason = excluded.reason,
    enabled = true,
    updated_at = now();

with source_rows as (
  select
    id,
    coalesce(title,'') || ' ' || coalesce(source,'') || ' ' || coalesce(summary,'') || ' ' ||
    coalesce(raw->>'title','') || ' ' || coalesce(raw->>'description','') || ' ' ||
    coalesce(raw->>'summary','') || ' ' || coalesce(raw->>'content','') as evidence
  from public.news_articles
  where coalesce(status,'') <> 'excluded_by_keyword_ledger'
    and coalesce(tone,'') <> 'exclude'
    and coalesce(category,'') <> 'own'
), bucketed as (
  select id, 'pass1_non_insurance_finance' as pass, 1 as pass_order, '비보험 핀테크/전자공시 일반 기사로 보험·GA 문맥이 없어 제외합니다.' as reason, '핀테크/전자공시 노이즈' as evidence_label from source_rows
  where evidence ~* '(두나무|업비트|빗썸|코인원|코빗|가상자산|암호화폐|전자공시시스템|공시시스템|DART|핀테크|전자금융|결제대행|PG사)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약)'
  union all
  select id, 'pass2_card_bank_security', 2, '카드·은행·증권권역 기사로 보험·GA 문맥이 없어 제외합니다.', '비보험 금융권 노이즈' from source_rows
  where evidence ~* '(롯데카드|카드사|신용카드|은행권|은행업|한국투자증권|투자증권|증권사|금융투자|저축은행|새마을금고|가계대출|주택담보대출|대부업|캐피탈)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약|미래에셋생명|한화생명|교보생명|삼성생명|흥국생명|동양생명|DB손해보험|KB손해보험|롯데손해보험|NH농협손해보험|농협손해보험|메리츠화재|삼성화재|현대해상|DB손보|KB손보|롯데손보)'
  union all
  select id, 'pass3_sports_photo', 3, '스포츠/포토성 기사로 당사 브랜드 또는 보험·GA 판단 문맥이 없어 제외합니다.', '스포츠·포토 노이즈' from source_rows
  where evidence ~* '(프로야구|프로농구|프로배구|KBO|축구|월드컵|KLPGA|US오픈|티샷|라운드|골프|\[포토\]|^포토|포토뉴스)'
    and evidence !~* '(인카금융|인카금융서비스)'
  union all
  select id, 'pass4_public_welfare_health', 4, '공적 건강보험·복지·의료정책 기사로 민영보험/GA 문맥이 없어 제외합니다.', '공적복지·건보 노이즈' from source_rows
  where evidence ~* '(국민건강보험공단|건강보험공단|보건복지부|복지부|요양급여|건강보험[[:space:]]*부당[[:space:]]*청구|가짜진료|진료행위|비급여)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약)'
  union all
  select id, 'pass5_shipping_macro', 5, '해운·거시 이슈의 보험료 언급으로 보험업/GA 영업 문맥이 없어 제외합니다.', '해운·거시 보험료 노이즈' from source_rows
  where evidence ~* '(호르무즈|이란|해협|유조선|해운|선박|통항|해상[[:space:]]*통항|중동|원유|국제해사기구|IMO)'
    and evidence ~* '(보험|보험료|보험수수료|통항료|위험해역)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약)'
  union all
  select id, 'pass6_stock_market_listing', 6, '단순 주식시황·시세표 기사로 PR 주요이슈가 아니므로 제외합니다.', '주식시황·시세표 노이즈' from source_rows
  where evidence ~* '(52주|최고가|최저가|장중|신고가|신저가|코스피|코스닥|특징주|마감시황|보험지수|업종별|테마별|장중수급)'
    and evidence !~* '(인카금융|보험업계|보험주|생명보험|손해보험|보험사|보험회사|GA|법인보험대리점)'
), ranked as (
  select distinct on (id) id, pass, pass_order, reason, evidence_label
  from bucketed
  order by id, pass_order
)
update public.news_articles as article
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    own_mentioned = false,
    negative_target = 'none',
    classification_provider = 'rules:classification_tree_refinement_v2:' || ranked.pass,
    classification_reason = ranked.reason,
    classification_evidence = ranked.evidence_label,
    classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.93),
    clipping_recommended = false,
    clipping_reason = '',
    updated_at = now()
from ranked
where article.id = ranked.id;

update public.news_articles
set category = 'industry',
    tone = 'caution',
    status = 'classified',
    own_mentioned = false,
    negative_target = 'industry',
    classification_provider = 'rules:classification_tree_correction_v1:insurance_company_keep',
    classification_reason = '금융권 종합 기사지만 보험사명이 직접 포함되어 보험업계 리스크 동향으로 보존합니다.',
    classification_evidence = '보험사명 포함 금융권 종합 기사',
    classification_confidence = greatest(coalesce(classification_confidence, 0), 0.91),
    clipping_recommended = true,
    clipping_reason = '보험사명이 포함된 금융권 리스크 동향으로 시장 관찰 가치가 있습니다.',
    updated_at = now()
where classification_provider='rules:classification_tree_refinement_v2:pass2_card_bank_security'
  and (
    coalesce(title,'') ~* '(미래에셋생명|한화생명|교보생명|삼성생명|흥국생명|동양생명|DB손해보험|KB손해보험|롯데손해보험|NH농협손해보험|농협손해보험|메리츠화재|삼성화재|현대해상|DB손보|KB손보|롯데손보)'
    or coalesce(summary,'') ~* '(미래에셋생명|한화생명|교보생명|삼성생명|흥국생명|동양생명|DB손해보험|KB손해보험|롯데손해보험|NH농협손해보험|농협손해보험|메리츠화재|삼성화재|현대해상|DB손보|KB손보|롯데손보)'
  );

commit;
