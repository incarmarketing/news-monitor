-- Pass 9: competitor leader overrides own-name protection when both appear in a truncated reputation headline.

with source_rows as (
  select
    id,
    concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) as haystack
  from public.news_articles
),
brand_reputation_against_own as (
  select id
  from source_rows
  where haystack ~* '(브랜드평판|평판[[:space:]]*랭킹|평판[[:space:]]*순위)'
    and haystack ~* '(인카금융|인카금융서비스)'
    and haystack ~* '((한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋).{0,60}(1위|선두|탈환)|(1위|선두|탈환).{0,60}(한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋))'
),
brand_updated as (
  update public.news_articles a
     set category = 'competitor',
         tone = 'caution',
         own_mentioned = true,
         negative_target = 'none',
         classification_provider = 'rule_precision_reclass_v11',
         classification_evidence = '경쟁사 1위 브랜드평판 순위표 기사',
         classification_reason = '경쟁사 1위가 명확한 브랜드평판 기사로, 제목에 인카금융이 함께 있어도 당사 긍정/직접 이슈가 아닌 경쟁사/시장 관찰로 분리',
         updated_at = now()
    from brand_reputation_against_own b
   where a.id = b.id
  returning a.id
)
select count(*) as brand_reclassified
from brand_updated;
