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
  'non_insurance_financial_legal_noise',
  '비보험 금융 법적분쟁 주요이슈 제외',
  'exclude',
  'neutral',
  array['채권사기', '채권 사기', '투자자 법적 대응', '법적 대응', '유사수신', '불법 리딩방', '코인 사기', '투자 사기'],
  array[]::text[],
  array['인카금융서비스', '인카금융', '보험', '손해보험', '생명보험', '보험사', '보험대리점', '법인보험대리점', 'GA', '보험설계사', '설계사', '판매수수료', '1200%'],
  7,
  '채권·투자자 법적분쟁 등 일반 금융 리스크는 보험·GA·당사 문맥이 없으면 수집 보관은 가능하되 주요 언론동향 이슈에서 제외한다.'
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
  where concat_ws(' ', title, summary, raw->>'title', raw->>'description', raw->>'summary', keyword, source) ~* '(채권\s*사기|투자자.{0,40}법적\s*대응|법적\s*대응.{0,40}투자자|유사수신|불법\s*리딩방|코인\s*사기|투자\s*사기)'
    and concat_ws(' ', title, summary, raw->>'title', raw->>'description', raw->>'summary', keyword, source) !~* '(인카금융서비스|인카금융|보험|손해보험|생명보험|보험사|보험대리점|법인보험대리점|GA|보험설계사|설계사|판매수수료|1200%)'
)
update public.news_articles a
   set category = 'other',
       tone = 'neutral',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_non_insurance_financial_legal_noise',
       classification_evidence = '보험·GA·당사 문맥 없는 채권/투자자 법적분쟁 기사',
       classification_reason = '일반 금융 법적분쟁 기사로 주요 언론동향 이슈에서 제외',
       updated_at = now()
  from target t
 where a.id = t.id;
