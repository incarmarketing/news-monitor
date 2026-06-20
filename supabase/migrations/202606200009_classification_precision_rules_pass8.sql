-- Pass 8: cover rank-first competitor reputation headlines such as "1위 한화생명금융서비스".

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
    and haystack ~* '((한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋).{0,45}(1위|선두|탈환)|(1위|선두|탈환).{0,45}(한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋))'
    and haystack !~* '(인카금융|인카금융서비스).{0,35}(1위|선두|최고|최상위)'
),
brand_updated as (
  update public.news_articles a
     set category = 'competitor',
         tone = 'caution',
         own_mentioned = true,
         negative_target = 'none',
         classification_provider = 'rule_precision_reclass_v10',
         classification_evidence = '경쟁사 1위 브랜드평판 순위표 기사',
         classification_reason = '브랜드평판 기사에서 경쟁사가 1위이고 당사는 순위표에 함께 언급된 기사로 당사 긍정이 아닌 경쟁사/시장 관찰로 분리',
         updated_at = now()
    from brand_reputation_against_own b
   where a.id = b.id
  returning a.id
)
select count(*) as brand_reclassified
from brand_updated;
