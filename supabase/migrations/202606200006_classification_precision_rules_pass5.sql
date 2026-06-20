-- Pass 5: prevent Latin source domains such as donga.com from being treated as GA context.
-- The shipping/geopolitics exclusion rule should not be kept alive by a bare "GA"
-- match inside an English domain or path.

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
) values (
  'external_geopolitical_shipping_noise',
  '호르무즈·지정학 해운보험 단순 기사 제외',
  'exclude',
  'exclude',
  array['호르무즈', '이란', '해협', '유조선', '해운', '선박', '통항', '해상통항', '해상 통항', '중동', '원유'],
  array['보험', '보험사', '보험업계', '해운·보험업계', '안전항로', '유료 호위', '위험해역', '국제해사기구', 'IMO', '보험 약관'],
  array['인카금융', '보험대리점', '법인보험대리점', '보험GA', '보험설계사', '설계사', '1200%', '정착지원금', '불완전판매', '보험사기', '실손', '손해율'],
  20,
  '호르무즈·이란·해운 통항 기사에서 보험/보험업계가 부수적으로만 쓰인 경우 국내 보험/GA 모니터링 대상에서 제외한다. 영문 도메인 내 ga는 GA 문맥으로 보지 않는다.'
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
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|보험대리점|법인보험대리점|보험GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기|실손|손해율)'
),
updated as (
  update public.news_articles a
     set category = 'other',
         tone = 'exclude',
         own_mentioned = false,
         negative_target = 'none',
         clipping_recommended = false,
         clipping_reason = '',
         classification_provider = 'rule_precision_noise_v7',
         classification_evidence = '호르무즈·지정학 해운보험 단순 기사',
         classification_reason = '호르무즈·지정학 해운보험 단순 기사로 보험/GA/당사 리스크 분석 대상에서 제외',
         updated_at = now()
    from geopolitical_shipping_noise n
   where a.id = n.id
  returning a.id
)
select count(*) as reclassified_count
from updated;
