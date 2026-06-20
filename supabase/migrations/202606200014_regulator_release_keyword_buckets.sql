with regulator_rows as (
  select
    id,
    concat_ws(
      ' ',
      title,
      summary,
      classification_reason,
      source,
      keyword,
      raw->>'description',
      raw->>'regulator_department',
      raw->>'regulator_keyword'
    ) as haystack
  from public.news_articles
  where source in ('금융감독원', '금융위원회')
     or link ~ 'fss\.or\.kr|fsc\.go\.kr'
),
classified as (
  select
    id,
    case
      when haystack ~* '디지털|보안|해킹|AI|마이데이터|플랫폼|전산|개인정보|침해|금융보안' then '디지털/보안'
      when haystack ~* '소비자|민원|분쟁|실손|보험금|청구|유의|보호|피해|장애인|불완전판매|광고|의료기관|가이드라인' then '소비자보호'
      when haystack ~* 'GA|법인보험대리점|보험대리점|대리점|설계사|판매수수료|수수료|정착지원금|부당승환|채널|모집|영업|시책|1200%?|분급' then '판매채널/GA'
      when haystack ~* '지급여력|자본|대출채권|경영개선|건전성|손해율|실적|리스크|적자|충당금|가계대출|가계부채|외환시장|보험권 간담회' then '건전성/자본'
      else '감독/검사'
    end as bucket
  from regulator_rows
)
update public.news_articles as article
set
  keyword = classified.bucket,
  category = 'regulation',
  summary = case
    when coalesce(article.summary, '') ~* '공식 보도자료|문맥 중심|별도 확인|이슈가 핵심|확인해야|점검|관찰|원문 기준 분류|1200%룰 시행' then ''
    else article.summary
  end,
  classification_reason = '금융당국 보도자료 자동 키워드: ' || classified.bucket,
  classification_provider = 'rules:regulator_keyword',
  classification_confidence = greatest(coalesce(article.classification_confidence, 0), 0.9),
  raw = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(article.raw, '{}'::jsonb),
          '{keyword}',
          to_jsonb(classified.bucket)
        ),
        '{keyword_query}',
        to_jsonb(classified.bucket)
      ),
      '{regulator_keyword}',
      to_jsonb(classified.bucket)
    ),
    '{description}',
    to_jsonb(classified.bucket)
  ),
  updated_at = now()
from classified
where article.id = classified.id;
