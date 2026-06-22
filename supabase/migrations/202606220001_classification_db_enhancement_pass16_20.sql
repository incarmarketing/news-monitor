-- Pass 16-20: strengthen DB-backed classification without relying on generated summaries.
-- The monitor keyword ledger keeps English category IDs; article rows keep the existing
-- backend values that the frontend normalizes for display.

insert into public.monitor_keywords (
  keyword,
  category,
  subcategory,
  entity_type,
  enabled,
  is_search_keyword,
  require_article_mention,
  match_target,
  match_mode,
  context_terms,
  exclude_terms,
  default_tone,
  analysis_excluded,
  priority,
  memo
) values
  ('롯데카드', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','해킹','내부통제'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 12, '카드사 감독/제재 기사는 보험·GA 원문 문맥이 없으면 주요 이슈에서 제외'),
  ('카드사', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','해킹','내부통제'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 13, '비보험 카드 업권 감독 기사 제외'),
  ('신용카드', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','해킹','내부통제'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 14, '비보험 카드 상품·감독 기사 제외'),
  ('은행권', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','내부통제','보고의무'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 15, '은행권 일반 감독 이슈 제외'),
  ('한국투자증권', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','보고의무','공시'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 16, '증권사 제재/공시 기사는 보험·GA 문맥 없으면 제외'),
  ('증권사', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','제재','보고의무','공시'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 17, '비보험 증권업 감독 기사 제외'),
  ('새마을금고', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','건전성','특별관리'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 18, '상호금융 일반 감독 이슈 제외'),
  ('가계대출', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','점검','간담회'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 19, '대출 정책 일반 기사는 보험/GA 주요 이슈에서 제외'),
  ('주택담보대출', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','점검','간담회'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 20, '대출 정책 일반 기사는 보험/GA 주요 이슈에서 제외'),
  ('가상자산', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['금융위','금융위원회','금감원','금융감독원','감독','제재'], array['보험','GA','보험설계사','법인보험대리점'], 'exclude', true, 21, '가상자산 감독 이슈 제외'),
  ('보험 판매수수료', 'regulation', 'sales_commission', 'topic', true, true, false, 'title_summary', 'context', array['보험','GA','보험설계사','법인보험대리점','수수료'], array['카드','증권','은행'], 'caution', false, 24, '보험/GA 수수료 제도 변화 핵심 정책어'),
  ('1200%룰', 'regulation', 'sales_commission', 'topic', true, true, false, 'title_summary', 'context', array['보험','GA','보험설계사','법인보험대리점','수수료','정착지원금'], array['카드','증권','은행'], 'caution', false, 25, '보험 판매수수료 개편과 GA 채널 영향 추적'),
  ('부당승환', 'regulation', 'sales_conduct', 'topic', true, true, false, 'title_summary', 'context', array['보험','보험계약','설계사','GA','소비자'], array['증권','펀드','카드'], 'caution', false, 26, '보험계약 승환 및 소비자 피해 우려 신호'),
  ('불완전판매', 'regulation', 'sales_conduct', 'topic', true, true, false, 'title_summary', 'context', array['보험','보험상품','보험설계사','GA','소비자보호'], array['증권','ELS','펀드','카드'], 'caution', false, 27, '보험 판매품질·소비자보호 핵심 신호'),
  ('정착지원금', 'competitor', 'ga_recruiting', 'topic', true, true, false, 'title_summary', 'context', array['GA','보험설계사','법인보험대리점','스카우트','영입'], array['취업지원금','청년지원금'], 'caution', false, 28, 'GA 설계사 영입 경쟁과 1200%룰 전후 영향 추적'),
  ('우수인증설계사', 'own', 'quality_award', 'topic', true, true, false, 'title_summary', 'context', array['인카금융','인카금융서비스','GA','설계사'], array['협회 전체 발표만 있고 당사 미언급'], 'positive', false, 29, '당사 직접 언급 시 영업조직 품질 성과로 분류')
on conflict (keyword, category) do update
set
  subcategory = excluded.subcategory,
  entity_type = excluded.entity_type,
  enabled = excluded.enabled,
  is_search_keyword = excluded.is_search_keyword,
  require_article_mention = excluded.require_article_mention,
  match_target = excluded.match_target,
  match_mode = excluded.match_mode,
  context_terms = excluded.context_terms,
  exclude_terms = excluded.exclude_terms,
  default_tone = excluded.default_tone,
  analysis_excluded = excluded.analysis_excluded,
  priority = excluded.priority,
  memo = excluded.memo,
  updated_at = now();

with source_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      source,
      keyword,
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
non_insurance_finance as (
  select id
  from source_rows
  where evidence ~* '(금융위|금융위원회|금감원|금융감독원|제재|제재심|검사|감독|금융보안|해킹|내부통제|보고의무|공시제도|개정\s*상법)'
    and evidence ~* '(롯데카드|카드사|신용카드|은행권?|은행업|한국투자증권|투자증권|증권사|금융투자|저축은행|새마을금고|가계대출|주택담보대출|부동산|대부업|캐피탈|가상자산|코인|핀테크|전자금융|PG사|결제대행)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약)'
)
update public.news_articles article
set
  category = 'other',
  tone = 'exclude',
  status = 'excluded_by_keyword_ledger',
  classification_reason = '비보험 금융감독 기사: 보험/GA 원문 문맥 없음',
  classification_evidence = '카드·은행·증권 등 비보험 업권 신호가 보험/GA 문맥보다 우선됨',
  classification_provider = 'rules:classification_db_pass16',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.92),
  updated_at = now()
from non_insurance_finance target
where article.id = target.id;

with source_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      source,
      keyword,
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
insurance_sales_conduct as (
  select id
  from source_rows
  where evidence ~* '(보험\s*판매수수료|1200%룰|1200%|부당승환|승환계약|불완전판매|정착지원금|보험설계사|법인보험대리점|보험대리점|보험GA|GA)'
    and evidence ~* '(보험|보험업계|보험상품|보험계약|설계사|법인보험대리점|GA|금감원|금융감독원|금융위|금융위원회|소비자보호)'
    and evidence !~* '(카드사|롯데카드|신용카드|증권사|은행권|새마을금고|가계대출|주택담보대출|가상자산)'
)
update public.news_articles article
set
  category = 'regulation',
  tone = 'caution',
  classification_reason = '보험/GA 판매질서 및 수수료 제도 이슈',
  classification_evidence = '원문에서 보험·GA·설계사 문맥과 판매수수료/승환/불완전판매 신호가 함께 확인됨',
  classification_provider = 'rules:classification_db_pass17',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.88),
  updated_at = now()
from insurance_sales_conduct target
where article.id = target.id
  and coalesce(article.category, '') not in ('own', '당사');

with source_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      source,
      keyword,
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
own_quality_positive as (
  select id
  from source_rows
  where evidence ~* '(인카금융서비스|인카금융)'
    and evidence ~* '(우수인증설계사|GA업계\s*최다|최다\s*기록|브랜드평판\s*1위|수상|선정|협약|성과|배출)'
    and evidence !~* '(부정|논란|제재|검사|압수수색|불완전판매|부당승환|사기|횡령|배임|고발|피해|과징금|과태료)'
)
update public.news_articles article
set
  category = 'own',
  tone = 'positive',
  classification_reason = '당사 직접 성과성 보도',
  classification_evidence = '당사명이 원문에 직접 등장하고 성과·수상·배출 등 우호 신호가 확인됨',
  classification_provider = 'rules:classification_db_pass18',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.9),
  updated_at = now()
from own_quality_positive target
where article.id = target.id;

with source_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      source,
      keyword,
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
insurance_industry_risk as (
  select id
  from source_rows
  where evidence ~* '(보험사기|요양병원|실손|민원|소비자민원|끼워팔기|계약자\s*보호|건전성|경영개선|손해율)'
    and evidence ~* '(보험|보험사|손해보험|생명보험|보험업계|금감원|금융감독원)'
    and evidence !~* '(인카금융서비스|인카금융)'
)
update public.news_articles article
set
  category = 'industry',
  tone = 'caution',
  classification_reason = '보험업계 주의 관찰 이슈',
  classification_evidence = '당사 직접 부정은 아니지만 보험업계 소비자보호·건전성·민원 신호가 확인됨',
  classification_provider = 'rules:classification_db_pass19',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.84),
  updated_at = now()
from insurance_industry_risk target
where article.id = target.id
  and coalesce(article.category, '') not in ('own', '당사');

with source_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      source,
      keyword,
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
unsupported_positive as (
  select id
  from source_rows
  where evidence !~* '(인카금융서비스|인카금융)'
    and evidence !~* '(우호|성과|수상|선정|협약|사회공헌|기부|후원)'
)
update public.news_articles article
set
  tone = case when article.tone in ('positive', '긍정') then 'neutral' else article.tone end,
  classification_reason = case
    when article.tone in ('positive', '긍정') then '당사 직접 언급 없는 긍정 판정 보정'
    else classification_reason
  end,
  classification_provider = case
    when article.tone in ('positive', '긍정') then 'rules:classification_db_pass20'
    else classification_provider
  end,
  updated_at = now()
from unsupported_positive target
where article.id = target.id
  and article.tone in ('positive', '긍정')
  and coalesce(article.category, '') not in ('own', '당사');
