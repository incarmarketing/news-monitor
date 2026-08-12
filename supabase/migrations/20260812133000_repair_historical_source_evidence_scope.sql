-- Repair only high-confidence historical source-evidence contradictions.
-- Retrieval keywords and generated summaries are deliberately excluded from
-- company evidence. The update is idempotent and preserves topical categories
-- when they are already regulation, competitor, industry, or other.

begin;

with source_rows as (
  select
    id,
    category,
    tone,
    own_mentioned,
    negative_target,
    document_type,
    own_role,
    risk_event_type,
    alert_eligible,
    clipping_recommended,
    classification_provider,
    classification_reason,
    classification_decision_path,
    keyword,
    raw,
    position(
      U&'\C778\CE74\AE08\C735' in regexp_replace(
        concat_ws(
          ' ',
          coalesce(title, ''),
          coalesce(raw->>'title', ''),
          coalesce(raw->>'description', ''),
          coalesce(raw->>'content', ''),
          coalesce(raw->>'body', '')
        ),
        '\s+',
        '',
        'g'
      )
    ) > 0 as source_own,
    position(
      U&'\C778\CE74\AE08\C735' in regexp_replace(
        concat_ws(' ', coalesce(title, ''), coalesce(raw->>'title', '')),
        '\s+',
        '',
        'g'
      )
    ) > 0 as title_own
  from public.news_articles
),
prepared as (
  select
    *,
    coalesce(
      nullif(case when raw->>'keyword_category' in ('regulation', 'competitor', 'industry', 'other') then raw->>'keyword_category' end, ''),
      nullif(case when raw->>'query_category' in ('regulation', 'competitor', 'industry', 'other') then raw->>'query_category' end, ''),
      nullif(case when raw->>'category' in ('regulation', 'competitor', 'industry', 'other') then raw->>'category' end, ''),
      nullif(case when raw->>'_category' in ('regulation', 'competitor', 'industry', 'other') then raw->>'_category' end, '')
    ) as contextual_category
  from source_rows
),
candidates as (
  select
    *,
    case
      when source_own or category not in ('own', 'sponsorship') then category
      when contextual_category is not null then contextual_category
      else 'other'
    end as new_category,
    case
      when not source_own and tone = 'positive' then 'neutral'
      else tone
    end as new_tone
  from prepared
  where source_own is distinct from coalesce(own_mentioned, false)
     or (not source_own and category in ('own', 'sponsorship'))
     or (not source_own and tone = 'positive')
)
update public.news_articles as article
set
  category = candidate.new_category,
  tone = candidate.new_tone,
  own_mentioned = candidate.source_own,
  negative_target = case
    when not candidate.source_own and candidate.negative_target = 'own' then 'none'
    else candidate.negative_target
  end,
  own_role = case
    when not candidate.source_own then 'absent'
    when candidate.title_own then 'primary'
    else 'secondary'
  end,
  document_type = case
    when not candidate.source_own and candidate.category in ('own', 'sponsorship') then
      case candidate.new_category
        when 'regulation' then 'regulatory'
        when 'competitor' then 'industry_news'
        when 'industry' then 'industry_news'
        else 'other'
      end
    else candidate.document_type
  end,
  risk_event_type = case
    when not candidate.source_own and candidate.category in ('own', 'sponsorship') then 'none'
    else candidate.risk_event_type
  end,
  alert_eligible = case
    when not candidate.source_own then false
    else candidate.alert_eligible
  end,
  clipping_recommended = case
    when not candidate.source_own and (
      candidate.category in ('own', 'sponsorship') or candidate.tone = 'positive'
    ) then false
    else candidate.clipping_recommended
  end,
  classification_provider = 'rules:source-evidence-repair-v1',
  classification_reason = case
    when candidate.source_own
      then 'Restored company evidence found in the source title or body.'
    else 'Removed company scope unsupported by the source title or body.'
  end,
  classification_decision_path = coalesce(candidate.classification_decision_path, '{}'::jsonb)
    || jsonb_build_object(
      'source_evidence_repair',
      jsonb_build_object(
        'version', 'source-evidence-repair-v1',
        'applied_at', now(),
        'source_own', candidate.source_own,
        'previous_category', candidate.category,
        'new_category', candidate.new_category,
        'previous_tone', candidate.tone,
        'new_tone', candidate.new_tone,
        'previous_own_mentioned', candidate.own_mentioned,
        'new_own_mentioned', candidate.source_own,
        'previous_negative_target', candidate.negative_target,
        'previous_document_type', candidate.document_type,
        'previous_own_role', candidate.own_role,
        'previous_risk_event_type', candidate.risk_event_type,
        'previous_alert_eligible', candidate.alert_eligible,
        'previous_clipping_recommended', candidate.clipping_recommended,
        'previous_provider', candidate.classification_provider,
        'previous_reason', candidate.classification_reason
      )
    ),
  updated_at = now()
from candidates as candidate
where article.id = candidate.id;

commit;
