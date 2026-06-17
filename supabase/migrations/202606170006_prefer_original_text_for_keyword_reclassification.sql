-- Prefer original article descriptions over generated summaries when applying
-- keyword ledger rules. Generated summaries may contain contextual boilerplate
-- from a different cluster and should not drive policy/regulation matching.

with rules as (
  select keyword, category, default_tone, match_target, context_terms, exclude_terms, priority
  from public.monitor_keywords
  where enabled is true and coalesce(analysis_excluded, false) is false
), article_texts as (
  select
    a.id,
    case
      when r.match_target = 'title_only' then coalesce(a.title, '')
      when r.match_target = 'summary_only' then coalesce(a.raw->>'description', a.raw->>'summary', a.summary, '')
      when r.match_target = 'source' then coalesce(a.source, '')
      when r.match_target = 'keyword' then coalesce(a.keyword, '')
      when r.match_target = 'all' then concat_ws(' ', a.title, coalesce(a.raw->>'description', a.raw->>'summary', a.summary), a.source, a.keyword)
      else concat_ws(' ', a.title, coalesce(a.raw->>'description', a.raw->>'summary', a.summary))
    end as target_text,
    r.keyword,
    r.category,
    r.default_tone,
    r.context_terms,
    r.exclude_terms,
    r.priority
  from public.news_articles a
  cross join rules r
), matched as (
  select distinct on (id)
    id,
    category as target_category,
    keyword as matched_keyword,
    default_tone,
    priority
  from article_texts m
  where lower(m.target_text) like '%' || lower(m.keyword) || '%'
    and not exists (
      select 1
      from unnest(coalesce(m.exclude_terms, '{}')) ex(term)
      where term <> ''
        and lower(m.target_text) like '%' || lower(term) || '%'
    )
    and (
      coalesce(array_length(m.context_terms, 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(m.context_terms, '{}')) ct(term)
        where term <> ''
          and lower(m.target_text) like '%' || lower(term) || '%'
      )
    )
  order by id, priority asc
), target as (
  select
    a.id,
    coalesce(m.target_category, 'other') as target_category,
    m.matched_keyword,
    coalesce(m.default_tone, 'neutral') as target_tone
  from public.news_articles a
  left join matched m on m.id = a.id
)
update public.news_articles a
   set category = t.target_category,
       tone = case
         when t.target_category = 'own' and a.tone in ('positive','neutral','caution','negative') then a.tone
         when t.target_category = 'regulation' then 'caution'
         when t.target_category = 'other' then 'neutral'
         else t.target_tone
       end,
       own_mentioned = (t.target_category = 'own'),
       classification_provider = 'rule_ledger_v2_original_text',
       classification_reason = case
         when t.matched_keyword is null then '분류 원장 기준 매칭 없음'
         else '원문 기준 분류 원장 키워드 매칭: ' || t.matched_keyword
       end,
       classification_evidence = t.matched_keyword,
       updated_at = now()
  from target t
 where a.id = t.id;

update public.news_articles
   set summary = '삼성생명이 사망보장에 암 치료 보장을 결합한 저해약환급금형 종신보험을 출시했습니다. 보험사 상품 출시와 보장 경쟁 흐름을 보여주는 기사입니다.',
       category = 'industry',
       tone = 'neutral',
       own_mentioned = false,
       negative_target = 'none',
       classification_provider = 'manual_correction_original_text',
       classification_evidence = '삼성생명 상품 출시',
       classification_reason = '원문 제목과 설명에 1200%룰·판매수수료 정책 문맥이 없어 보험사 상품 동향으로 보정',
       updated_at = now()
 where link = 'https://www.insnews.co.kr/news/articleView.html?idxno=91346'
    or link like '%idxno=91346%';
