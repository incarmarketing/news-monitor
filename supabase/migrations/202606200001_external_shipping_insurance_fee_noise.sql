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
  'external_shipping_insurance_fee_noise',
  '호르무즈·해운 보험 수수료 오탐 제외',
  'exclude',
  'exclude',
  array['호르무즈', '호르무즈 해협', '이란', '통항', '선박', '해운', '유조선', '해협', '중동', '원유', '해상 통항'],
  array['보험 수수료', '보험수수료', '보험증권', '보험 증권', '통항 수수료', '수수료 부과', '보험료', '보험사'],
  array['생명보험', '손해보험', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '인카금융', '금융감독원', '금감원', '금융위원회', '금융위', '보험업법', '불완전판매', '보험사기', '실손', '손해율', '보험금'],
  6,
  '호르무즈·이란·선박 통항 기사에서 보험 수수료/보험증권이 언급되는 경우 보험사·GA 업계 분석 대상이 아니라 국제·해운 노이즈로 제외한다.'
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
    enabled = true;

with target as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(호르무즈|이란|통항|선박|해운|유조선|해협|중동|원유|해상 통항)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험 수수료|보험수수료|보험증권|보험 증권|통항 수수료|수수료 부과|보험료|보험사)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|GA|인카금융|금융감독원|금감원|금융위원회|금융위|보험업법|불완전판매|보험사기|실손|손해율|보험금)'
)
update public.news_articles a
   set category = 'other',
       tone = 'exclude',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_external_shipping_insurance_fee_noise',
       classification_evidence = '호르무즈·이란·선박 통항 보험 수수료 문맥',
       classification_reason = '보험사·GA 분석 대상이 아닌 국제·해운 통항 비용 기사로 제외',
       updated_at = now()
  from target t
 where a.id = t.id;
