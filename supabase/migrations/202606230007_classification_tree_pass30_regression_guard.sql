-- Classification tree regression guard, pass 30-31.
-- Purpose: prevent newer broad rules from breaking earlier reviewed cases.

begin;

insert into public.monitor_context_rules (
  rule_key, label, category, tone, trigger_terms, required_terms, exclude_terms,
  priority, enabled, memo, rule_group, rule_type, decision, dashboard_visible, test_note
) values
  (
    'tree_pass30_own_stock_caution_override',
    'Own stock-market caution override',
    'own',
    'caution',
    array['자사주','자기주식','주식등의 수','주가'],
    array['인카금융'],
    array[]::text[],
    30,
    true,
    'Direct Incar stock-market mentions become caution when criticism, decline, decrease, or low-price context appears.',
    'classification_tree_pass30',
    'tone',
    'own_stock_caution',
    true,
    'Own stock-market caution regression guard.'
  ),
  (
    'tree_pass31_named_insurer_product_competitor',
    'Named insurer product/activity competitor override',
    'competitor',
    'neutral',
    array['삼성화재','DB손해보험','DB손보','KB손해보험','현대해상','롯데손해보험','한화손해보험','한화손보','NH농협손해보험','농협손해보험','메리츠화재','흥국화재','미래에셋생명','한화생명','교보생명','신한라이프'],
    array['운전자보험','보험상품','상품','출시','판매','특약','빗길','포트홀','침수','도로위험','교통사고','풍수해'],
    array['1200%','판매수수료','불완전판매','부당승환','검사','제재'],
    31,
    true,
    'If a specific insurer is named with product, launch, sale, or coverage context, classify as competitor activity rather than generic industry flow.',
    'classification_tree_pass30',
    'classify',
    'named_insurer_product_competitor',
    true,
    'Named insurer product/activity regression guard.'
  )
on conflict (rule_key) do update set
  label = excluded.label,
  category = excluded.category,
  tone = excluded.tone,
  trigger_terms = excluded.trigger_terms,
  required_terms = excluded.required_terms,
  exclude_terms = excluded.exclude_terms,
  priority = excluded.priority,
  enabled = excluded.enabled,
  memo = excluded.memo,
  rule_group = excluded.rule_group,
  rule_type = excluded.rule_type,
  decision = excluded.decision,
  dashboard_visible = excluded.dashboard_visible,
  test_note = excluded.test_note,
  updated_at = now();

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(인카금융서비스|인카금융)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(자사주|자기주식|주식등의 수|주가)'
    and lower(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(source,'')) ~ '(주가 누르기|비판|공시 급증|감소|하락|최저가|지분율)'
    and coalesce(category,'') = 'own'
)
update public.news_articles a
set category = 'own',
    tone = 'caution',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass30:own_stock_caution_override',
    updated_at = now()
from target
where a.id = target.id;

with target as (
  select id
  from public.news_articles
  where lower(coalesce(title,'')) ~ '(삼성화재|db손해보험|db손보|kb손해보험|현대해상|롯데손해보험|한화손해보험|한화손보|nh농협손해보험|농협손해보험|메리츠화재|흥국화재|미래에셋생명|한화생명|교보생명|신한라이프)'
    and lower(coalesce(title,'')) ~ '(빗길|포트홀|침수|도로위험|교통사고|풍수해|운전자보험|보험상품|상품|출시|판매|특약)'
    and lower(coalesce(title,'')) !~ '(1200%|판매수수료|불완전판매|부당승환|검사|제재)'
    and coalesce(category,'') in ('industry','regulation','competitor')
)
update public.news_articles a
set category = 'competitor',
    tone = 'neutral',
    status = case when coalesce(a.status,'') = 'excluded_by_keyword_ledger' then null else a.status end,
    classification_provider = 'rules:classification_tree_pass30:named_insurer_product_competitor',
    updated_at = now()
from target
where a.id = target.id;

commit;
