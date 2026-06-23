-- Exclude non-insurance financial disclosure and crypto-exchange earnings articles.
-- Regulator names such as FSS are often cited only as the disclosure system source.
-- They should not become policy/caution items unless the article body has insurance/GA context.

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
  ('두나무', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['전자공시시스템','DART','영업이익','순이익','가상자산','수수료'], array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','1200%','정착지원금','부당승환','판매수수료'], 'exclude', true, 10, '가상자산 거래소 실적·공시 기사는 보험/GA 본문 문맥 없으면 제외'),
  ('업비트', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['전자공시시스템','DART','영업이익','순이익','가상자산','수수료'], array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','1200%','정착지원금','부당승환','판매수수료'], 'exclude', true, 11, '가상자산 거래소 실적·공시 기사는 보험/GA 본문 문맥 없으면 제외'),
  ('빗썸', 'exclude', 'non_insurance_finance', 'organization', true, false, false, 'title_summary', 'context', array['전자공시시스템','DART','영업이익','순이익','가상자산','수수료'], array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','1200%','정착지원금','부당승환','판매수수료'], 'exclude', true, 12, '가상자산 거래소 실적·공시 기사는 보험/GA 본문 문맥 없으면 제외'),
  ('코인거래소', 'exclude', 'non_insurance_finance', 'keyword', true, false, false, 'title_summary', 'context', array['전자공시시스템','DART','영업이익','순이익','가상자산','수수료'], array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','1200%','정착지원금','부당승환','판매수수료'], 'exclude', true, 13, '가상자산 거래소·디지털자산 일반 기사는 보험/GA 문맥 없으면 제외'),
  ('전자공시시스템', 'exclude', 'non_insurance_disclosure', 'keyword', true, false, false, 'title_summary', 'context', array['금융감독원','매출','영업이익','순이익','공시'], array['보험대리점','법인보험대리점','보험설계사','보험GA','인카금융','보험업법','1200%','정착지원금','부당승환','판매수수료'], 'exclude', true, 14, '전자공시시스템 단순 인용 실적 기사는 보험/GA 문맥 없으면 제외')
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
      raw->>'title',
      raw->>'description',
      raw->>'summary',
      raw->>'content',
      raw->>'body'
    ) as evidence
  from public.news_articles
),
non_insurance_disclosure as (
  select id
  from source_rows
  where evidence ~* '(두나무|업비트|빗썸|코인원|코빗|가상자산|가상화폐|암호화폐|코인거래소|디지털자산|전자공시시스템|DART|공시시스템)'
    and evidence ~* '(금융감독원[[:space:]]*전자공시시스템|전자공시시스템|DART|영업이익|순이익|매출|거래[[:space:]]*급감|수수료[[:space:]]*장사|가상자산|코인)'
    and evidence !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금|판매수수료|부당승환|승환계약)'
)
update public.news_articles article
set
  category = 'other',
  tone = 'exclude',
  status = 'excluded_by_keyword_ledger',
  clipping_recommended = false,
  classification_reason = '비보험 가상자산/공시 기사: 보험·GA 본문 문맥 없음',
  classification_evidence = '금융감독원·전자공시시스템은 출처성 문구이며 보험/GA 감독 이슈가 아님',
  classification_provider = 'rules:non_insurance_disclosure_noise_v1',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.94),
  updated_at = now()
from non_insurance_disclosure target
where article.id = target.id;
