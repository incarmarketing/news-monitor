-- Classification precision pass 4.
-- Separate own sponsorship PR from sports previews/photos and broaden Hormuz shipping noise.

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
  'external_geopolitical_shipping_noise',
  '호르무즈·지정학 해운보험 단순 기사 제외',
  'exclude',
  'exclude',
  array['호르무즈', '이란', '해협', '유조선', '해운', '선박', '통항', '해상통항', '해상 통항', '중동', '원유'],
  array['보험', '보험사', '보험업계', '해운·보험업계', '안전항로', '유료 호위', '위험해역', '국제해사기구', 'IMO', '보험 약관'],
  array['인카금융', '보험대리점', '법인보험대리점', '보험GA', 'GA', '보험설계사', '설계사', '1200%', '정착지원금', '불완전판매', '보험사기', '실손', '손해율'],
  20,
  '호르무즈·이란·해운 통항 기사에서 보험/보험업계가 부수적으로만 쓰인 경우 국내 보험/GA 모니터링 대상에서 제외한다.'
),
(
  'own_golf_sports_preview_noise',
  '인카 골프대회 스포츠 프리뷰/선수 기록 기사 제외',
  'exclude',
  'exclude',
  array['인카금융', '인카금융서비스', '더헤븐CC', '인카금융 더헤븐', '인카금융 더 헤븐', '대회 주최사 인카금융서비스', '타이틀스폰서로 합류', '공동 주최사'],
  array['KLPGA', '골프', '우승 후보', '개막', '디펜딩 챔피언', '방어', '노승희', '안송이', '400경기', '금자탑', '기념보드', '꽃다발', '선수', '티샷', '포토', '청사진', '액티브Shot', '인생이야기', '별들의 격돌'],
  array['인카금융서비스, KLPGA 정규 골프대회 후원', '인카금융, KLPGA', '후원', '스폰서', '브랜드', '마케팅', '기부', '사회공헌', 'ESG'],
  21,
  '당사명이 타이틀스폰서/주최사로 들어가도 기사 초점이 선수·경기 프리뷰·사진이면 제외한다. 회사 후원/브랜드/기부 스토리는 유지한다.'
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

with geopolitical_shipping_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(호르무즈|이란|해협|유조선|해운|선박|통항|해상통항|해상[[:space:]]*통항|중동|원유)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험|보험사|보험업계|해운·보험업계|안전항로|유료[[:space:]]*호위|위험해역|국제해사기구|IMO|보험[[:space:]]*약관)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|보험대리점|법인보험대리점|보험GA|GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기|실손|손해율)'
),
own_golf_sports_preview_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(인카금융|인카금융서비스|더헤븐CC|인카금융[[:space:]]*더헤븐|인카금융[[:space:]]*더[[:space:]]*헤븐|대회[[:space:]]*주최사[[:space:]]*인카금융서비스|타이틀스폰서로[[:space:]]*합류|공동[[:space:]]*주최사)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(KLPGA|골프|우승[[:space:]]*후보|개막|디펜딩[[:space:]]*챔피언|방어|노승희|안송이|400경기|금자탑|기념보드|꽃다발|선수|티샷|포토|청사진|액티브Shot|인생이야기|별들의[[:space:]]*격돌)'
    and title !~* '(후원|스폰서|주최|브랜드|마케팅|기부|사회공헌|ESG)'
),
noise as (
  select id, '호르무즈·지정학 해운보험 단순 기사' as reason from geopolitical_shipping_noise
  union
  select id, '인카 골프대회 스포츠 프리뷰/선수 기록 기사' as reason from own_golf_sports_preview_noise
)
update public.news_articles a
   set category = 'other',
       tone = 'exclude',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_precision_noise_v6',
       classification_evidence = n.reason,
       classification_reason = n.reason || '로 보험/GA/당사 리스크 분석 대상에서 제외',
       updated_at = now()
  from noise n
 where a.id = n.id;
