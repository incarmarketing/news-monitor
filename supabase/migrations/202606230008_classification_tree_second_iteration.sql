-- Classification tree second iteration.
-- Purpose: rerun the corpus after pass 21-31, tighten conflicting branches,
-- and normalize excluded/noise status consistently.

begin;

insert into public.monitor_context_rules (
  rule_key, label, category, tone, trigger_terms, required_terms, exclude_terms,
  priority, enabled, memo, rule_group, rule_type, decision, dashboard_visible, test_note
) values
  (
    'tree_pass32_status_mark_existing_noise',
    'Existing excluded noise status marker',
    'exclude',
    'exclude',
    array['메가박스','프로야구','프로농구','NBA','MLB','유소년 농구','축구','농구','야구','배우','연예','포토'],
    array[]::text[],
    array['인카금융 더헤븐','인카금융서비스','인카금융','법인보험대리점','보험설계사','GA','1200%'],
    32,
    true,
    'Already excluded sports/entertainment noise should carry excluded_by_keyword_ledger status consistently.',
    'classification_tree_iter2',
    'exclude',
    'mark_excluded_noise',
    false,
    'Second-pass status normalization.'
  ),
  (
    'tree_pass33_brand_rank_competitor_caution',
    'GA/insurance brand-rank competitor caution',
    'competitor',
    'caution',
    array['브랜드평판','1위','초박빙'],
    array['독립 보험대리점','법인보험대리점','보험대리점','GA','인카금융','한화생명금융서비스','에이플러스에셋'],
    array['배우','라이징 배우','변우석','박지훈','박보영','대군부인','연예','아이돌'],
    33,
    true,
    'Brand-rank articles are competitor caution only in insurance/GA context, never entertainment ranking context.',
    'classification_tree_iter2',
    'classify',
    'brand_rank_competitor_caution',
    true,
    'GA brand-rank conflict guard.'
  ),
  (
    'tree_pass34_commission_law_regulation',
    'Commission-law ruling regulation caution',
    'regulation',
    'caution',
    array['타사 보험설계사','보험 모집 위탁','모집 수수료','지급 수수료','손금 인정','비용 처리'],
    array['대법','판결','위법','수수료','보험설계사'],
    array[]::text[],
    34,
    true,
    'Court rulings on insurance solicitor commission treatment are regulatory/legal caution unless a named GA competitor is involved.',
    'classification_tree_iter2',
    'classify',
    'commission_law_regulation',
    true,
    'Commission-law ruling guard.'
  ),
  (
    'tree_pass35_direct_own_business_only',
    'Direct own-company business mention only',
    'own',
    'neutral',
    array['인카금융서비스','인카금융'],
    array[]::text[],
    array['더헤븐','마스터즈','KLPGA','포토','서교림','우승','브랜드평판'],
    35,
    true,
    'Own-company classification should not absorb sponsorship/golf or competitor brand-rank articles just because Incar appears.',
    'classification_tree_iter2',
    'guardrail',
    'own_business_only',
    true,
    'Own/sponsorship conflict guard.'
  ),
  (
    'tree_pass36_market_talk_channel_noise',
    'Stock-market talk show/channel noise',
    'exclude',
    'exclude',
    array['돈나무','캐시우드','슈카월드','주식시장 대담','방한'],
    array[]::text[],
    array['보험업법','보험설계사','보험대리점','법인보험대리점','인카금융','GA코리아','지에이코리아'],
    36,
    true,
    'Stock-market talk-show or investment personality articles should stay excluded even if a finance channel is mentioned.',
    'classification_tree_iter2_regression',
    'exclude',
    'market_talk_channel_noise',
    false,
    'Market-talk channel noise regression guard.'
  ),
  (
    'tree_pass37_ga_korea_violation_competitor',
    'GA Korea violation competitor caution',
    'competitor',
    'caution',
    array['GA코리아','지에이코리아','보험업법 위반','타사 보험설계사','모집 수수료'],
    array['GA코리아','지에이코리아'],
    array[]::text[],
    37,
    true,
    'GA Korea legal/commission violation articles are competitor caution, not generic regulation.',
    'classification_tree_iter2_regression',
    'classify',
    'ga_korea_violation_competitor',
    true,
    'GA Korea ruling regression guard.'
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
  where coalesce(category,'') = 'other'
    and coalesce(tone,'') = 'exclude'
    and coalesce(status,'') <> 'excluded_by_keyword_ledger'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(메가박스|프로야구|프로농구|nba|mlb|유소년 농구|축구|농구|야구|배우|연예|포토)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) !~ '(인카금융 더헤븐|인카금융서비스|인카금융|법인보험대리점|보험설계사|\mga\M|1200%)'
)
update public.news_articles a
set status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_iter2:status_mark_existing_noise',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(주가조작|슈퍼리치|준항고|공윤위|퇴직 공직자|재취업|생산적 금융협의체|8대 금융지주|금융지주와 맞손|키움증권|퇴직연금|irp|스테이블코인|토큰증권|쿠콘|두나무|가상자산|코인거래소|디지털자산)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) !~ '(보험연수원|보험저널|보험매일|보험신보|한국보험신문|보험판매|보험대리점|법인보험대리점|보험설계사|\mga\M|1200%|부당승환|불완전판매|판매수수료|변액보험|인카금융|보험회사|보험사|손해보험|생명보험)'
    and not (coalesce(category,'') = 'other' and coalesce(tone,'') = 'exclude' and coalesce(status,'') = 'excluded_by_keyword_ledger')
)
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_iter2:general_finance_noise_strict',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'')) ~ '(인카금융서비스|인카금융)'
    and lower(coalesce(title,'')) !~ '(더헤븐|마스터즈|klpga|포토|서교림|우승|브랜드평판|한화생명금융서비스|에이플러스에셋|뒤이어|초박빙)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(자사주|자기주식|소각|취득|주주환원|신인 설계사|영업지원 교육|우수인증설계사|최다|1위|수상|선정|배출|인터뷰)'
    and not (coalesce(category,'') = 'own' and coalesce(tone,'') = 'positive')
)
update public.news_articles a
set category = 'own',
    tone = 'positive',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:own_positive_direct_performance',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where (
      lower(coalesce(title,'')) ~ '(인카금융서비스|인카금융)'
      or lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(인카금융서비스의 정착지원금|인카금융서비스.*점검|인카금융서비스.*검사|인카금융서비스.*감소)'
    )
    and lower(coalesce(title,'')) !~ '(더헤븐|마스터즈|klpga|포토|서교림|우승|브랜드평판)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(역성장|감소폭|주식등의 수.*감소|지분율.*감소|최저가|하락|점검|검사|정착지원금|관리 부실)'
    and not (coalesce(category,'') = 'own' and coalesce(tone,'') = 'caution')
)
update public.news_articles a
set category = 'own',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:own_caution_direct_risk',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(브랜드평판.*1위|1위.*브랜드평판|초박빙)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(독립 보험대리점|법인보험대리점|보험대리점|보험ga|ga업계|\mga\M|인카금융|한화생명금융서비스|에이플러스에셋)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(배우|라이징 배우|변우석|박지훈|박보영|대군부인|연예|아이돌)'
    and not (coalesce(category,'') = 'competitor' and coalesce(tone,'') = 'caution')
)
update public.news_articles a
set category = 'competitor',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:brand_rank_competitor_caution',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(타사 보험설계사|보험 모집 위탁|모집 수수료|지급 수수료|손금 인정|비용 처리)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(대법|판결|위법|수수료|보험설계사)'
    and not (coalesce(category,'') = 'regulation' and coalesce(tone,'') = 'caution')
)
update public.news_articles a
set category = 'regulation',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:commission_law_regulation',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(한화손해보험|한화손보|db손해보험|db손보|nh농협손해보험|농협손해보험|미래에셋생명|삼성화재|kb손해보험|롯데손해보험|신한라이프|흥국생명|abl생명)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(신용등급|a\+|채널|브랜드|거점|사옥|제휴|유튜브|봉사|후원)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(1200%|판매수수료|불완전판매|부당승환|검사|제재)'
    and not (coalesce(category,'') = 'competitor' and coalesce(tone,'') = 'neutral')
)
update public.news_articles a
set category = 'competitor',
    tone = 'neutral',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:insurer_activity_competitor',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where coalesce(category,'') in ('industry','regulation')
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(도수치료|판매수수료|모집수수료|불완전판매|1200%|부당승환|미스터리 쇼핑|보험 불판|소비자 신뢰|수수료|보험금 심사기준|체외충격파)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(보험|실손보험|보험설계사|보험대리점|법인보험대리점|금감원|금융위|\mga\M)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(증권|키움증권|irp|퇴직연금|카드|은행)'
    and coalesce(tone,'') <> 'caution'
)
update public.news_articles a
set category = 'regulation',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2:regulation_caution',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(돈나무|캐시우드|슈카월드|주식시장 대담|방한)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) !~ '(보험업법|보험설계사|보험대리점|법인보험대리점|인카금융|ga코리아|지에이코리아)'
    and not (coalesce(category,'') = 'other' and coalesce(tone,'') = 'exclude' and coalesce(status,'') = 'excluded_by_keyword_ledger')
)
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_iter2_regression:market_talk_channel_noise',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(ga코리아|지에이코리아)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'')) ~ '(보험업법 위반|타사 보험설계사|모집 수수료|지급 수수료|손금 인정|비용 처리|대법)'
    and not (coalesce(category,'') = 'competitor' and coalesce(tone,'') = 'caution')
)
update public.news_articles a
set category = 'competitor',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then 'classified' else a.status end,
    classification_provider = 'rules:classification_tree_iter2_regression:ga_korea_violation_competitor',
    updated_at = now()
from target
where a.id = target.id;

update public.news_articles
set status = 'classified',
    classification_provider = 'rules:classification_tree_iter2:commission_law_status_normalized',
    updated_at = now()
where id = 17276
  and category = 'regulation'
  and tone = 'caution'
  and status = 'new';

commit;
