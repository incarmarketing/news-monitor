begin;

-- Complete the August source-evidence repair for a legacy row that had no
-- saved AI context. The company name is present directly in the headline.
update public.news_articles n
set
    category = 'own',
    tone = 'neutral',
    own_mentioned = true,
    negative_target = 'none',
    classification_evidence = 'Company name appears directly in the source headline',
    classification_reason = 'Source headline confirms a direct company mention; no negative event is present',
    classification_confidence = 1,
    classification_provider = 'rules:source_evidence_guard_v1',
    classification_ruleset_version = 'classification-contract-v3-2026-08-12:source-evidence-backfill',
    document_type = 'company_profile',
    own_role = 'primary',
    risk_event_type = 'market',
    alert_eligible = false,
    classification_decision_path = jsonb_build_object(
        'negative_shape', false,
        'own_is_primary', true,
        'direct_risk_event', false,
        'source_evidence', true,
        'source_evidence_guard', true
    ),
    clipping_recommended = false,
    clipping_reason = '',
    raw = jsonb_set(
        coalesce(n.raw, '{}'::jsonb),
        '{_ai_context}',
        coalesce(n.raw -> '_ai_context', '{}'::jsonb) || jsonb_build_object(
            'category', 'own',
            'tone', 'neutral',
            'own_mentioned', true,
            'negative_target', 'none',
            'evidence', 'Company name appears directly in the source headline',
            'reason', 'Source headline confirms a direct company mention; no negative event is present',
            'confidence', 1,
            'provider', 'rules:source_evidence_guard_v1',
            'classification_ruleset_version', 'classification-contract-v3-2026-08-12:source-evidence-backfill',
            'document_type', 'company_profile',
            'own_role', 'primary',
            'risk_event_type', 'market',
            'alert_eligible', false,
            'classification_decision_path', jsonb_build_object(
                'negative_shape', false,
                'own_is_primary', true,
                'direct_risk_event', false,
                'source_evidence', true,
                'source_evidence_guard', true
            ),
            'clipping_recommended', false,
            'clipping_reason', ''
        ),
        true
    )
where n.id = 171170
  and strpos(
      lower(concat_ws(
          ' ',
          n.title,
          n.raw ->> 'title',
          n.raw ->> 'description',
          n.raw ->> 'content',
          n.raw ->> 'body'
      )),
      lower(convert_from(decode('EC9DB8ECB9B4EAB888EC9CB5', 'hex'), 'UTF8'))
  ) > 0;

insert into public.monitor_classification_review_cases (
    review_batch,
    article_id,
    expected_category,
    expected_tone,
    expected_visible,
    reviewer,
    review_note,
    updated_at
)
values (
    '2026-08-12-source-evidence-hardening-v1',
    171170,
    'own',
    'neutral',
    true,
    'codex',
    'Legacy stock-movement article with a direct company mention in the source headline',
    now()
)
on conflict (review_batch, article_id) do update
set
    expected_category = excluded.expected_category,
    expected_tone = excluded.expected_tone,
    expected_visible = excluded.expected_visible,
    reviewer = excluded.reviewer,
    review_note = excluded.review_note,
    updated_at = now();

commit;
