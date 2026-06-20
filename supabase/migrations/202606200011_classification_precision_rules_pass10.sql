-- Pass 10: remove general sports noise and Incar tournament event-preview/facility articles.

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
  'general_sports_noise',
  '보험/당사 문맥 없는 일반 스포츠 기사 제외',
  'exclude',
  'exclude',
  array['프로야구', '프로농구', '프로배구', 'KBO', '월드컵', '축구', '야구', '농구', '배구', '골프', 'KLPGA', 'US오픈', '우천취소'],
  array[]::text[],
  array['인카금융', '보험', '보험사', '생명보험', '손해보험', '보험대리점', '법인보험대리점', '보험설계사', '보험GA', '금융감독원', '금감원', '금융위원회', '금융위', '1200%', '정착지원금', '불완전판매', '소비자보호'],
  26,
  '스포츠 키워드로 수집됐지만 보험/GA/당사/당국 문맥이 없는 일반 경기·날씨·선수·흥행 기사는 모니터링 대상에서 제외한다.'
),
(
  'own_golf_event_preview_noise',
  '인카 골프대회 경기 프리뷰·시설 홍보 기사 제외',
  'exclude',
  'exclude',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['PREVIEW', '프리뷰', '3승 사냥', '더헤븐리조트', '커뮤니티 시설', '샬롬 뷰', '품격 높인다'],
  array['후원', '스폰서', '브랜드', '마케팅', '기부', '사회공헌', 'ESG', '개최', '확대'],
  27,
  '당사 대회명이 들어가도 기사 초점이 경기 프리뷰·선수 전망·리조트 시설이면 당사 보도/리스크 분석에서 제외한다.'
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
    coalesce(title, '') as title,
    concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) as haystack
  from public.news_articles
),
general_sports_noise as (
  select id
  from source_rows
  where haystack ~* '(프로야구|프로농구|프로배구|KBO|월드컵|축구|야구|농구|배구|골프|KLPGA|US오픈|우천취소|구장|경기[[:space:]]*진행|비거리|스포츠[[:space:]]*바|비키니[[:space:]]*미녀|황금[[:space:]]*패치)'
    and haystack !~* '(인카금융|보험|보험사|생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|보험GA|금융감독원|금감원|금융위원회|금융위|1200%|정착지원금|불완전판매|소비자보호)'
),
own_golf_event_preview_noise as (
  select id
  from source_rows
  where haystack ~* '(인카금융|인카금융서비스|인카금융[[:space:]]*더헤븐|인카금융[[:space:]]*더[[:space:]]*헤븐|더헤븐CC)'
    and title ~* '(PREVIEW|프리뷰|3승[[:space:]]*사냥|사냥|더헤븐리조트|커뮤니티[[:space:]]*시설|샬롬[[:space:]]*뷰|품격[[:space:]]*높인다|우승[[:space:]]*후보|선수)'
    and title !~* '(후원|스폰서|브랜드|마케팅|기부|사회공헌|ESG|개최|확대|확정형[[:space:]]*기부)'
),
noise as (
  select id, '보험/당사 문맥 없는 일반 스포츠 기사' as reason from general_sports_noise
  union
  select id, '인카 골프대회 경기 프리뷰·시설 홍보 기사' as reason from own_golf_event_preview_noise
),
updated as (
  update public.news_articles a
     set category = 'other',
         tone = 'exclude',
         own_mentioned = false,
         negative_target = 'none',
         clipping_recommended = false,
         clipping_reason = '',
         classification_provider = 'rule_precision_noise_v12',
         classification_evidence = n.reason,
         classification_reason = n.reason || '로 보험/GA/당사 리스크 분석 대상에서 제외',
         updated_at = now()
    from noise n
   where a.id = n.id
  returning a.id
)
select count(*) as reclassified_count
from updated;
