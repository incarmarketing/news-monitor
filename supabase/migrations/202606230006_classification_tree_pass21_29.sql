-- Classification tree refinement, pass 21-29.
-- Purpose: harden DB-first classification against accumulated real article cases.
-- These rules reduce false positives before expensive AI analysis is used.

begin;

insert into public.monitor_context_rules (
  rule_key, label, category, tone, trigger_terms, required_terms, exclude_terms,
  priority, enabled, memo, rule_group, rule_type, decision, dashboard_visible, test_note
) values
  (
    'tree_pass21_non_sponsorship_sports_noise',
    'Non-sponsorship sports/entertainment noise',
    'exclude',
    'exclude',
    array['메가박스','프로야구','프로농구','NBA','MLB','유소년 농구'],
    array[]::text[],
    array['인카금융 더헤븐','인카금융서비스','인카금융','법인보험대리점','보험설계사','GA','1200%'],
    21,
    true,
    'Exclude sports/movie exposure unless it is an Incar sponsorship or insurance/GA context.',
    'classification_tree_pass21_29',
    'exclude',
    'exclude_from_dashboard',
    false,
    'Sports/movie noise excluding sponsorship.'
  ),
  (
    'tree_pass22_general_finance_policy_noise',
    'Non-insurance finance/regulatory noise',
    'exclude',
    'exclude',
    array['주가조작','슈퍼리치','준항고','공윤위','퇴직 공직자','재취업','생산적 금융협의체','8대 금융지주','금융지주와 맞손','키움증권','퇴직연금','IRP','스테이블코인','토큰증권','쿠콘','두나무','가상자산'],
    array[]::text[],
    array['보험판매','보험대리점','법인보험대리점','보험설계사','GA','1200%','부당승환','불완전판매','판매수수료','변액보험','인카금융'],
    22,
    true,
    'Exclude general finance, securities, fintech, and digital-asset articles when insurance/GA operating context is absent.',
    'classification_tree_pass21_29',
    'exclude',
    'exclude_from_dashboard',
    false,
    'General finance policy/disclosure noise.'
  ),
  (
    'tree_pass23_own_tone_split',
    'Own-company positive/caution tone split',
    'own',
    'neutral',
    array['인카금융서비스','인카금융','자사주','자기주식','소각','취득','주주환원','신인 설계사','영업지원 교육','우수인증설계사','최다','1위','수상','선정','배출','인터뷰','역성장','감소폭','지분율 감소','최저가','하락','점검','검사','정착지원금','관리 부실'],
    array['인카금융'],
    array[]::text[],
    23,
    true,
    'Split direct Incar mentions into positive and caution by content, not by mention alone.',
    'classification_tree_pass21_29',
    'tone',
    'own_tone_split',
    true,
    'Direct own-company tone correction.'
  ),
  (
    'tree_pass24_competitor_caution',
    'Competitor GA caution signal',
    'competitor',
    'caution',
    array['브랜드평판 1위','1위 브랜드평판','초박빙','GA코리아','보험업법 위반','타사 보험설계사','모집 수수료'],
    array['GA','보험설계사','보험대리점','법인보험대리점','인카'],
    array[]::text[],
    24,
    true,
    'Treat competitor superiority versus Incar and GA legal/compliance signals as caution.',
    'classification_tree_pass21_29',
    'tone',
    'competitor_caution',
    true,
    'Brand-rank and GA compliance correction.'
  ),
  (
    'tree_pass25_insurance_regulation_caution',
    'Insurance sales/regulatory caution signal',
    'regulation',
    'caution',
    array['도수치료','판매수수료','모집수수료','불완전판매','1200%','부당승환','미스터리 쇼핑','보험 불판','소비자 신뢰','수수료'],
    array['보험','실손보험','보험설계사','GA','보험대리점','법인보험대리점','금감원','금융위'],
    array['증권','키움증권','IRP','퇴직연금'],
    25,
    true,
    'Classify insurance product, sales conduct, commissions, and consumer-protection changes as regulatory caution.',
    'classification_tree_pass21_29',
    'classify',
    'regulation_caution',
    true,
    'Insurance regulation/sales conduct correction.'
  ),
  (
    'tree_pass26_insurer_activity_competitor',
    'Insurer individual activity',
    'competitor',
    'neutral',
    array['한화손해보험','한화손보','DB손해보험','DB손보','NH농협손해보험','농협손해보험','미래에셋생명','삼성화재','KB손해보험','롯데손해보험','신한라이프','흥국생명','ABL생명'],
    array['신용등급','A+','채널','브랜드','거점','사옥','제휴','유튜브','봉사','후원'],
    array['1200%','판매수수료','불완전판매','부당승환','검사','제재'],
    26,
    true,
    'Separate insurer credit-rating, partnership, channel, office, and campaign activity from broad industry flow.',
    'classification_tree_pass21_29',
    'classify',
    'competitor_neutral',
    true,
    'Insurer activity correction.'
  ),
  (
    'tree_pass27_insurer_performance_stats_neutral',
    'Insurer performance statistics neutralization',
    'regulation',
    'neutral',
    array['보험회사 경영실적','보험사 순익','생보사 손보사 순익'],
    array[]::text[],
    array['환투기','외화 포지션','검사','제재'],
    27,
    true,
    'Treat insurer earnings/performance statistics as neutral statistics, not regulatory risk.',
    'classification_tree_pass21_29',
    'tone',
    'regulation_stats_neutral',
    true,
    'Performance-stat article correction.'
  ),
  (
    'tree_pass28_tradepress_product_risk_industry',
    'Trade-press product/lifestyle risk industry flow',
    'industry',
    'neutral',
    array['빗길','포트홀','침수','도로위험','교통사고','풍수해','운전자보험','보험상품'],
    array['보험저널','보험매일','보험신보','한국보험신문'],
    array['수수료','불완전판매','1200%','검사','제재','금감원','금융위'],
    28,
    true,
    'Trade-press product and lifestyle-risk articles are industry flow, not competitor risk, unless sales/regulatory terms appear.',
    'classification_tree_pass21_29',
    'classify',
    'industry_product_risk',
    true,
    'Trade-press product/lifestyle risk correction.'
  ),
  (
    'tree_pass29_non_insurance_market_noise',
    'Non-insurance market noise',
    'exclude',
    'exclude',
    array['증시 광풍','대만 보험설계사','가상자산','두나무','코인','비트코인','거래소','업비트','코스피','최고가','최저가'],
    array[]::text[],
    array['인카금융서비스','인카금융','보험회사','보험사','손해보험','생명보험','보험대리점','GA','설계사 수','정착지원금','1200%','판매수수료','보험업계','보험계약','보험금','보험료'],
    29,
    true,
    'Exclude general securities, stock-market, and crypto noise when insurance/GA context is absent.',
    'classification_tree_pass21_29',
    'exclude',
    'exclude_from_dashboard',
    false,
    'Dunamu/stock-market/crypto noise correction.'
  )
on conflict (rule_key) do update set
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

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(메가박스|프로야구|프로농구|nba|mlb|유소년 농구)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) !~ '(인카금융 더헤븐|인카금융서비스|인카금융|법인보험대리점|보험설계사|\yga\y|1200%)'
)
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_pass21_29:pass21_non_sponsorship_sports_noise',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(주가조작|슈퍼리치|준항고|공윤위|퇴직 공직자|재취업|생산적 금융협의체|8대 금융지주|금융지주와 맞손|키움증권|퇴직연금|irp|스테이블코인|토큰증권|쿠콘|두나무|가상자산)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) !~ '(보험판매|보험대리점|법인보험대리점|보험설계사|\yga\y|1200%|부당승환|불완전판매|판매수수료|변액보험|인카금융)'
)
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_pass21_29:pass22_general_finance_policy_noise',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(인카금융서비스|인카금융)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(자사주|자기주식|소각|취득|주주환원|신인 설계사|영업지원 교육|우수인증설계사|최다|1위|수상|선정|배출|인터뷰)'
)
update public.news_articles a
set category = 'own',
    tone = 'positive',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:own_positive',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(인카금융서비스|인카금융)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(역성장|감소폭|주식등의 수.*감소|지분율.*감소|최저가|하락|점검|검사|정착지원금|관리 부실)'
)
update public.news_articles a
set category = 'own',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:own_caution',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(브랜드평판.*1위|1위.*브랜드평판|초박빙|ga코리아.*보험업법 위반|타사 보험설계사.*수수료|보험업법 위반)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(ga|보험설계사|보험대리점|법인보험대리점|인카)'
)
update public.news_articles a
set category = 'competitor',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:competitor_caution',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where coalesce(category,'') in ('industry','regulation')
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(도수치료|판매수수료|모집수수료|불완전판매|1200%|부당승환|미스터리 쇼핑|보험 불판|소비자 신뢰|수수료)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(보험|실손보험|보험설계사|ga|보험대리점|법인보험대리점|금감원|금융위)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(증권|키움증권|irp|퇴직연금)'
)
update public.news_articles a
set category = 'regulation',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:regulation_caution',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(한화손해보험|한화손보|db손해보험|db손보|nh농협손해보험|농협손해보험|미래에셋생명|삼성화재|kb손해보험|롯데손해보험|신한라이프|흥국생명|abl생명)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(신용등급|a\\+|채널|브랜드|거점|사옥|제휴|유튜브|봉사|후원)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(1200%|판매수수료|불완전판매|부당승환|검사|제재)'
)
update public.news_articles a
set category = 'competitor',
    tone = 'neutral',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:insurer_activity',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where coalesce(category,'') = 'sponsorship'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(1억원 쾌척|기부|후원|사회공헌|아름다운 홀인원)'
)
update public.news_articles a
set tone = 'positive',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:sponsorship_positive',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'')) ~ '(보험회사 경영실적|보험사 순익|생보사.*손보사.*순익|[0-9]분기 보험회사 경영실적)'
    and coalesce(category,'') in ('regulation','industry')
    and coalesce(tone,'') in ('caution','negative')
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(환투기|외화 포지션|검사|제재)'
)
update public.news_articles a
set category = 'regulation',
    tone = 'neutral',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:insurer_performance_stats_neutral',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'')) ~ '(빗길|포트홀|침수|도로위험|교통사고|풍수해|운전자보험|보험상품)'
    and coalesce(category,'') in ('competitor','regulation')
    and coalesce(source,'') ~ '(보험저널|보험매일|보험신보|한국보험신문)'
    and lower(coalesce(title,'')) !~ '(수수료|불완전판매|1200%|검사|제재|금감원|금융위)'
)
update public.news_articles a
set category = 'industry',
    tone = 'neutral',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass21_29:tradepress_product_risk_industry',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(증시 광풍|대만 보험설계사|가상자산|두나무|코인|비트코인|거래소|업비트|코스피 [0-9]+|최고가 [0-9]+개|최저가 [0-9]+개)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) !~ '(인카금융서비스|인카금융|인카 |보험회사|보험사|손해보험|생명보험|보험대리점|\yga\y|설계사 수|정착지원금|1200%|판매수수료|보험업계|보험계약|보험금|보험료)'
)
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_pass21_29:non_insurance_market_noise',
    updated_at = now()
from target
where a.id = target.id;

commit;
