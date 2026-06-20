-- Pass 11: keep Incar-hosted golf tournament coverage as a brand/sponsorship track.
-- Generic sports noise still stays excluded; only company-hosted tournament coverage is preserved.

alter table public.monitor_context_rules
  drop constraint if exists monitor_context_rules_category_check;

alter table public.monitor_context_rules
  add constraint monitor_context_rules_category_check
  check (category = any (array['own'::text, 'regulation'::text, 'competitor'::text, 'industry'::text, 'sponsorship'::text, 'other'::text, 'exclude'::text]));

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  priority,
  memo
) values
(
  'own_sponsored_golf_scoreboard_noise',
  '인카 골프대회 경기결과/포토 기사 스폰서십 보존',
  'sponsorship',
  'neutral',
  array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈', '인카금융서비스 더헤븐 마스터즈', '인카금융 더 헤븐', '인카금융 더헤븐', '더헤븐CC', 'KLPGA', '골프', '라운드', '티샷', '버디', '이글', '스윙', '선두', '공동', '순위', '우승', '상금', '언더파', '타수', '선수'],
  array['인카금융'],
  array[]::text[],
  27,
  '당사 주최 골프대회 경기결과·포토성 보도는 리스크/당사 성과와 분리해 브랜드·스폰서십 노출 트랙으로 보존한다.'
),
(
  'own_golf_sports_preview_noise',
  '인카 골프대회 스포츠 프리뷰/선수 기록 스폰서십 보존',
  'sponsorship',
  'neutral',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['KLPGA', '골프', '우승 후보', '개막', '디펜딩 챔피언', '방어', '노승희', '안송이', '400경기', '금자탑', '기념보드', '꽃다발', '선수', '티샷', '포토', '청사진', '액티브Shot', '인생이야기', '별들의 격돌'],
  array[]::text[],
  28,
  '당사 주최 대회 프리뷰·선수 기록은 제외하지 않고 낮은 우선순위의 스폰서십 노출로 관리한다.'
),
(
  'own_golf_event_logistics_noise',
  '인카 골프대회 관람·프로암·셔틀 안내 스폰서십 보존',
  'sponsorship',
  'neutral',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['주차', '셔틀', '날씨', '관람 정보', '갤러리', '프로암', '이모저모'],
  array[]::text[],
  29,
  '대회 운영·관람 안내성 기사는 리스크 분석에서 분리하되 당사 주최 이벤트 노출로 보존한다.'
),
(
  'own_golf_event_preview_noise',
  '인카 골프대회 경기 프리뷰·시설 홍보 스폰서십 보존',
  'sponsorship',
  'neutral',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['PREVIEW', '프리뷰', '3승 사냥', '더헤븐리조트', '커뮤니티 시설', '샬롬 뷰', '품격 높인다'],
  array[]::text[],
  30,
  '당사 대회명이 들어간 경기 프리뷰·시설 홍보는 제외하지 않고 스폰서십 트랙으로 압축 관리한다.'
),
(
  'third_party_tournament_partner_marketing_noise',
  '인카 골프대회 내 협찬사 마케팅 기사 스폰서십 보존',
  'sponsorship',
  'neutral',
  array['인카금융', '인카금융 더헤븐', 'KLPGA', '하루틴', '협찬사'],
  array['협찬사', '마케팅'],
  array[]::text[],
  31,
  '제3 협찬사 중심 기사라도 당사 주최 대회 노출 문맥이면 별도 스폰서십 트랙에 보존한다.'
)
on conflict (rule_key) do update
set label = excluded.label,
    category = excluded.category,
    tone = excluded.tone,
    trigger_terms = excluded.trigger_terms,
    required_terms = excluded.required_terms,
    exclude_terms = excluded.exclude_terms,
    priority = excluded.priority,
    memo = excluded.memo,
    enabled = true,
    updated_at = now();

with source_rows as (
  select
    id,
    concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) as haystack
  from public.news_articles
),
own_golf_sponsorship as (
  select
    id,
    haystack,
    haystack ~* '(기부|확정형[[:space:]]*기부|사회공헌|브랜드|협약|후원|스폰서|주최|홍보|마케팅|ESG|파트너십)' as is_brand_story
  from source_rows
  where (
      haystack ~* '(인카금융[[:space:]]*더[[:space:]]*헤븐|인카금융[[:space:]]*더헤븐|인카금융서비스[^.。!?]{0,35}마스터즈|인카금융[^.。!?]{0,35}마스터즈|더헤븐CC)'
      or (
        haystack ~* '(인카금융|인카금융서비스)'
        and haystack ~* '(KLPGA|골프|마스터즈|대회|라운드|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|선수|후원|스폰서|주최|협찬사|프로암|갤러리|관람)'
      )
    )
),
updated as (
  update public.news_articles a
     set category = 'sponsorship',
         tone = case when s.is_brand_story then 'positive' else 'neutral' end,
         own_mentioned = true,
         negative_target = 'none',
         clipping_recommended = s.is_brand_story,
         clipping_reason = case
           when s.is_brand_story then '당사 주최 대회의 브랜드·스폰서십 노출 성과로 보존할 기사입니다.'
           else ''
         end,
         classification_provider = 'rule_sponsorship_track_v1',
         classification_evidence = '당사 주최 골프대회 브랜드/스폰서십 기사',
         classification_reason = '리스크·당사 성과 기사와 분리해 브랜드/스폰서십 트랙으로 보존',
         updated_at = now()
    from own_golf_sponsorship s
   where a.id = s.id
  returning a.id
)
select count(*) as sponsorship_reclassified_count
from updated;
