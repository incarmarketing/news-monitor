-- Guard against classifying own-company brand reputation #1 coverage as caution.
-- Example: "인카금융서비스, 독립 보험대리점 브랜드평판 7월 1위...한화생명금융서비스 2위"

with target as (
  select id
  from public.news_articles
  where coalesce(title, '') ~* '(인카금융서비스|인카금융)'
    and coalesce(title, '') ~* '(브랜드평판|평판)'
    and coalesce(title, '') ~* '(1위|선두|정상|최고|수성|탈환)'
    and (
      coalesce(title, '') ~* '(인카금융서비스|인카금융).{0,90}(브랜드평판|평판).{0,90}(1위|선두|정상|최고|수성|탈환)'
      or coalesce(title, '') ~* '(인카금융서비스|인카금융).{0,90}(1위|선두|정상|최고|수성|탈환)'
    )
    and coalesce(title, '') !~* '(인카금융서비스|인카금융).{0,70}(2위|3위|뒤이어|초박빙|추격).{0,70}(1위|선두|정상|최고|수성|탈환)'
)
update public.news_articles a
set category = 'own',
    tone = 'positive',
    own_mentioned = true,
    negative_target = 'none',
    status = case when coalesce(a.status, '') = 'excluded_by_keyword_ledger' then 'classified' else coalesce(a.status, 'classified') end,
    classification_provider = 'rules:20260710:own_brand_reputation_positive_guard',
    classification_evidence = '당사 브랜드평판 1위 직접 보도',
    classification_reason = '당사명이 제목에 직접 노출되고 브랜드평판 1위 성과가 확인되어 긍정 보도로 분류합니다.',
    clipping_recommended = true,
    clipping_reason = '당사 브랜드평판 1위 성과성 보도',
    updated_at = now()
from target
where a.id = target.id;
