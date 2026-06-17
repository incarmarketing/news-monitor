-- BigKinds-style keyword/context ledger seed.
-- This keeps the operating classification rules reproducible across GitHub Actions,
-- local refreshes, and new Supabase environments.

insert into public.monitor_keywords (
  keyword,
  enabled,
  category,
  subcategory,
  entity_type,
  is_search_keyword,
  require_article_mention,
  match_target,
  match_mode,
  default_tone,
  analysis_excluded,
  priority,
  context_terms,
  exclude_terms,
  memo,
  updated_at
) values
  ('인카금융서비스', true, 'own', 'direct_company', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 10, array[]::text[], array[]::text[], '당사 정식명. 기사 본문 직접 언급이 있을 때만 당사 기사로 분류', now()),
  ('인카금융', true, 'own', 'direct_company', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 11, array[]::text[], array[]::text[], '당사 약칭. 제목·요약에 실제 등장할 때만 당사 기사로 분류', now()),
  ('인카', true, 'own', 'brand_alias', 'organization', true, true, 'title_summary', 'context', 'neutral', false, 30, array['금융','보험','GA','보험대리점','설계사','브랜드평판','주가','공시']::text[], array[]::text[], '짧은 브랜드명이라 보험·금융 문맥이 함께 있을 때만 당사로 인정', now()),

  ('한화생명금융서비스', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 20, array[]::text[], array[]::text[], '대형 GA 경쟁사. 브랜드평판·설계사·정착지원금 등 경쟁 동향 관찰', now()),
  ('지에이코리아', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 21, array[]::text[], array[]::text[], 'GA 경쟁사 정식 표기', now()),
  ('GA코리아', true, 'competitor', 'ga_competitor', 'organization', false, true, 'title_summary', 'keyword', 'neutral', false, 22, array[]::text[], array[]::text[], '지에이코리아 영문식/약식 표기 보정용', now()),
  ('글로벌금융판매', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 23, array[]::text[], array[]::text[], 'GA 경쟁사 정식명. 글로벌 금융 일반 기사와 분리', now()),
  ('글로벌금융', true, 'competitor', 'ga_competitor', 'organization', false, true, 'title_summary', 'context', 'neutral', false, 24, array['글로벌금융판매','보험','보험대리점','법인보험대리점','GA','보험GA','설계사']::text[], array['글로벌 금융시장','글로벌 금융위기','글로벌 금융 안정','글로벌 금융 허브']::text[], '검색어로 쓰지 않고 글로벌금융판매 보정용으로만 사용', now()),
  ('메가금융서비스', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 25, array[]::text[], array[]::text[], 'GA 경쟁사 정식명', now()),
  ('메가', true, 'competitor', 'ga_competitor', 'organization', false, true, 'title_summary', 'context', 'neutral', false, 26, array['메가금융서비스','보험','보험대리점','법인보험대리점','GA','보험GA','설계사']::text[], array['메가커피','메가MGC','메가박스','메가스터디','메가 히트','메가 런치','메가 세일','메가 이벤트']::text[], '검색어로 쓰지 않고 메가금융서비스 보정용으로만 사용', now()),
  ('에이플러스에셋', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 27, array[]::text[], array[]::text[], 'GA 경쟁사', now()),
  ('피플라이프', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'context', 'neutral', false, 28, array['보험','GA','보험대리점','설계사']::text[], array[]::text[], 'GA 경쟁사. 일반 생활 기사와 분리', now()),
  ('리치앤코', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 29, array[]::text[], array[]::text[], 'GA 경쟁사', now()),
  ('프라임에셋', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 30, array[]::text[], array[]::text[], 'GA 경쟁사', now()),
  ('굿리치', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'context', 'neutral', false, 31, array['보험','GA','보험대리점','설계사','비교추천','보험앱']::text[], array[]::text[], 'GA/보험 플랫폼 경쟁사', now()),
  ('영진에셋', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 32, array[]::text[], array[]::text[], 'GA 경쟁사', now()),
  ('유퍼스트', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'context', 'neutral', false, 33, array['보험','GA','보험대리점','설계사']::text[], array[]::text[], 'GA 경쟁사', now()),
  ('사랑모아금융서비스', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 34, array[]::text[], array[]::text[], 'GA 경쟁사', now()),
  ('한금서', true, 'competitor', 'ga_competitor', 'organization', true, true, 'title_summary', 'keyword', 'neutral', false, 35, array[]::text[], array[]::text[], '한국금융서비스 약칭. GA 경쟁사 키워드로 관리', now()),

  ('보험설계사', true, 'industry', 'sales_channel', 'topic', true, false, 'title_summary', 'context', 'neutral', false, 40, array['보험','GA','보험대리점','수수료','정착지원금','영업','모집','불완전판매']::text[], array['프로야구','프로농구','프로배구','골프','포토']::text[], '설계사 채널 동향. 스포츠·포토성 기사 제외', now()),
  ('설계사', true, 'industry', 'sales_channel', 'topic', true, false, 'title_summary', 'context', 'neutral', false, 41, array['보험','GA','보험대리점','수수료','정착지원금','영업','모집','불완전판매']::text[], array['건축 설계사','인테리어 설계사','게임 설계사','프로야구','프로농구','프로배구','골프','포토']::text[], '보험 문맥이 함께 있을 때만 업계 동향으로 인정', now()),
  ('보험대리점', true, 'industry', 'sales_channel', 'topic', true, false, 'title_summary', 'keyword', 'neutral', false, 42, array[]::text[], array[]::text[], 'GA/보험대리점 채널 일반 동향', now()),
  ('법인보험대리점', true, 'industry', 'sales_channel', 'topic', true, false, 'title_summary', 'keyword', 'neutral', false, 43, array[]::text[], array[]::text[], 'GA 채널 일반 동향', now()),
  ('우수인증설계사', true, 'industry', 'sales_channel', 'topic', true, false, 'title_summary', 'keyword', 'neutral', false, 44, array[]::text[], array[]::text[], '설계사 품질·인증 관련 업계 동향', now()),
  ('손해보험', true, 'industry', 'insurance_company', 'keyword', true, false, 'title_summary', 'keyword', 'neutral', false, 60, array[]::text[], array['프로야구','프로농구','프로배구','골프','포토','후원','스폰서십']::text[], '손해보험사·상품·시장 동향. 스포츠 후원성 노이즈는 제외', now()),
  ('생명보험', true, 'industry', 'insurance_company', 'keyword', true, false, 'title_summary', 'keyword', 'neutral', false, 61, array[]::text[], array['프로야구','프로농구','프로배구','골프','포토','후원','스폰서십']::text[], '생명보험사·상품·시장 동향. 스포츠 후원성 노이즈는 제외', now()),
  ('보험사', true, 'industry', 'insurance_company', 'keyword', true, false, 'title_summary', 'context', 'neutral', false, 62, array['보험','실적','상품','계약','영업','민원','감독','판매채널']::text[], array['프로야구','프로농구','프로배구','골프','포토','후원','스폰서십']::text[], '보험사 일반 동향', now()),
  ('보험업계', true, 'industry', 'market_trend', 'topic', true, false, 'title_summary', 'keyword', 'neutral', false, 63, array[]::text[], array[]::text[], '보험업계 일반 흐름', now()),
  ('브랜드평판', true, 'industry', 'brand_reputation', 'topic', true, false, 'title_summary', 'context', 'neutral', false, 70, array['보험','GA','보험대리점','손해보험','생명보험','인카금융서비스','한화생명금융서비스']::text[], array['화장품','배우','가수','예능','아이돌','스포츠']::text[], '보험/GA 브랜드평판만 관찰', now()),

  ('1200%', true, 'regulation', 'commission_rule', 'topic', true, false, 'title_summary', 'keyword', 'caution', false, 15, array[]::text[], array[]::text[], '보험 판매수수료 1200%룰 핵심 정책 키워드', now()),
  ('판매수수료', true, 'regulation', 'commission_rule', 'topic', true, false, 'title_summary', 'context', 'caution', false, 16, array['보험','GA','보험대리점','설계사','1200%','분급']::text[], array['카드수수료','배달수수료','플랫폼수수료','중개수수료']::text[], '보험 판매수수료 문맥에서만 정책 이슈로 인정', now()),
  ('분급', true, 'regulation', 'commission_rule', 'topic', true, false, 'title_summary', 'context', 'caution', false, 17, array['보험','수수료','GA','설계사','보험대리점']::text[], array[]::text[], '수수료 분급 체계 관련 정책 이슈', now()),
  ('정착지원금', true, 'regulation', 'recruiting_compensation', 'topic', true, false, 'title_summary', 'context', 'caution', false, 18, array['보험','GA','설계사','보험대리점','영입','스카우트']::text[], array[]::text[], '설계사 영입 경쟁 및 규제 리스크 관찰', now()),
  ('불완전판매', true, 'regulation', 'sales_conduct', 'topic', true, false, 'title_summary', 'keyword', 'caution', false, 19, array[]::text[], array[]::text[], '소비자보호·영업행위 리스크', now()),
  ('부당승환', true, 'regulation', 'sales_conduct', 'topic', true, false, 'title_summary', 'keyword', 'caution', false, 20, array[]::text[], array[]::text[], '승환계약·영업행위 리스크', now()),
  ('책무구조도', true, 'regulation', 'internal_control', 'topic', true, false, 'title_summary', 'keyword', 'caution', false, 21, array[]::text[], array[]::text[], '내부통제·책무구조 관련 정책 이슈', now()),
  ('내부통제', true, 'regulation', 'internal_control', 'topic', true, false, 'title_summary', 'context', 'caution', false, 22, array['보험','금융','GA','책무구조도','금감원','금융위']::text[], array[]::text[], '금융권 내부통제 정책 이슈', now()),
  ('금융감독원', true, 'regulation', 'authority', 'organization', true, false, 'title_summary', 'context', 'caution', false, 23, array['보험','GA','설계사','수수료','불완전판매','부당승환','내부통제','검사','제재']::text[], array[]::text[], '보험/GA 관련 감독 이슈일 때 정책으로 분류', now()),
  ('금감원', true, 'regulation', 'authority', 'organization', true, false, 'title_summary', 'context', 'caution', false, 24, array['보험','GA','설계사','수수료','불완전판매','부당승환','내부통제','검사','제재']::text[], array[]::text[], '금융감독원 약칭', now()),
  ('금융위원회', true, 'regulation', 'authority', 'organization', true, false, 'title_summary', 'context', 'caution', false, 25, array['보험','GA','설계사','수수료','불완전판매','부당승환','내부통제','제도','법안']::text[], array[]::text[], '보험/GA 관련 정책 이슈일 때 분류', now()),
  ('금융위', true, 'regulation', 'authority', 'organization', true, false, 'title_summary', 'context', 'caution', false, 26, array['보험','GA','설계사','수수료','불완전판매','부당승환','내부통제','제도','법안']::text[], array[]::text[], '금융위원회 약칭', now()),
  ('제도', true, 'regulation', 'policy_general', 'topic', false, false, 'title_summary', 'context', 'caution', false, 90, array['보험','GA','보험대리점','설계사','수수료','금감원','금융위','소비자보호']::text[], array[]::text[], '너무 넓은 단어라 검색어로 쓰지 않고 정책 문맥 보정용으로만 사용', now()),

  ('프로야구', true, 'exclude', 'sports_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 10, array[]::text[], array[]::text[], '보험사 스포츠 후원·선수 기사 제외 후보', now()),
  ('프로농구', true, 'exclude', 'sports_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 11, array[]::text[], array[]::text[], '보험사 스포츠 후원·선수 기사 제외 후보', now()),
  ('프로배구', true, 'exclude', 'sports_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 12, array[]::text[], array[]::text[], '보험사 스포츠 후원·선수 기사 제외 후보', now()),
  ('골프', true, 'exclude', 'sports_noise', 'noise', false, false, 'title_summary', 'context', 'exclude', true, 13, array['선수','대회','라운드','순위','스코어']::text[], array[]::text[], '스포츠 경기 기사 제외 후보', now()),
  ('포토', true, 'exclude', 'media_format_noise', 'noise', false, false, 'title_summary', 'context', 'exclude', true, 14, array['선수','경기','시상식','대회']::text[], array[]::text[], '사진 중심 기사 제외 후보', now()),
  ('메가커피', true, 'exclude', 'brand_homonym_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 20, array[]::text[], array[]::text[], '메가금융서비스 오탐 방지', now()),
  ('메가박스', true, 'exclude', 'brand_homonym_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 21, array[]::text[], array[]::text[], '메가금융서비스 오탐 방지', now()),
  ('메가스터디', true, 'exclude', 'brand_homonym_noise', 'noise', false, false, 'title_summary', 'keyword', 'exclude', true, 22, array[]::text[], array[]::text[], '메가금융서비스 오탐 방지', now())
on conflict (keyword, category) do update
   set enabled = excluded.enabled,
       subcategory = excluded.subcategory,
       entity_type = excluded.entity_type,
       is_search_keyword = excluded.is_search_keyword,
       require_article_mention = excluded.require_article_mention,
       match_target = excluded.match_target,
       match_mode = excluded.match_mode,
       default_tone = excluded.default_tone,
       analysis_excluded = excluded.analysis_excluded,
       priority = excluded.priority,
       context_terms = excluded.context_terms,
       exclude_terms = excluded.exclude_terms,
       memo = excluded.memo,
       updated_at = now();

with rules as (
  select keyword, category, default_tone, match_target, context_terms, exclude_terms, priority
  from public.monitor_keywords
  where enabled is true and coalesce(analysis_excluded, false) is false
), article_texts as (
  select
    a.id,
    case
      when r.match_target = 'title_only' then coalesce(a.title, '')
      when r.match_target = 'summary_only' then coalesce(a.summary, '')
      when r.match_target = 'source' then coalesce(a.source, '')
      when r.match_target = 'keyword' then coalesce(a.keyword, '')
      when r.match_target = 'all' then concat_ws(' ', a.title, a.summary, a.source, a.keyword)
      else concat_ws(' ', a.title, a.summary)
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
       classification_provider = 'rule_ledger_v2',
       classification_reason = case
         when t.matched_keyword is null then '분류 원장 기준 매칭 없음'
         else '분류 원장 키워드 매칭: ' || t.matched_keyword
       end,
       classification_evidence = t.matched_keyword,
       updated_at = now()
  from target t
 where a.id = t.id;
