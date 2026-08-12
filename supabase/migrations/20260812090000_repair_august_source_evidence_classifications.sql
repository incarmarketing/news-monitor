begin;

-- Restore durable metadata from the saved context. Retrieval keywords and
-- generated summaries are not valid evidence that the company was mentioned.
with source_rows as (
    select
        n.id,
        n.raw,
        n.raw -> '_ai_context' as ctx,
        lower(concat_ws(
            ' ',
            n.title,
            n.raw ->> 'title',
            n.raw ->> 'description',
            n.raw ->> 'content',
            n.raw ->> 'body'
        )) as source_text
    from public.news_articles n
    where coalesce(n.pub_date, n.created_at) >= timestamptz '2026-08-01 00:00:00+09'
      and coalesce(n.pub_date, n.created_at) < timestamptz '2026-09-01 00:00:00+09'
      and jsonb_typeof(n.raw -> '_ai_context') = 'object'
), candidates as (
    select
        s.*,
        strpos(
            s.source_text,
            lower(convert_from(decode('EC9DB8ECB9B4EAB888EC9CB5', 'hex'), 'UTF8'))
        ) > 0 as source_own_mentioned
    from source_rows s
), restored as (
    select
        c.*,
        case
            when not c.source_own_mentioned then 'absent'
            when c.ctx ->> 'own_role' in ('primary', 'secondary', 'incidental') then c.ctx ->> 'own_role'
            else 'secondary'
        end as source_own_role,
        case
            when not c.source_own_mentioned and c.ctx ->> 'negative_target' = 'own' then 'none'
            else coalesce(nullif(c.ctx ->> 'negative_target', ''), 'none')
        end as source_negative_target,
        case lower(coalesce(c.ctx ->> 'alert_eligible', 'false'))
            when 'true' then true
            else false
        end as saved_alert_eligible,
        case lower(coalesce(c.ctx ->> 'clipping_recommended', 'false'))
            when 'true' then true
            else false
        end as saved_clipping_recommended
    from candidates c
)
update public.news_articles n
set
    own_mentioned = r.source_own_mentioned,
    negative_target = r.source_negative_target,
    classification_evidence = coalesce(nullif(n.classification_evidence, ''), r.ctx ->> 'evidence', ''),
    classification_reason = coalesce(nullif(n.classification_reason, ''), r.ctx ->> 'reason', ''),
    classification_confidence = case
        when (n.classification_confidence is null or n.classification_confidence = 0)
             and coalesce(r.ctx ->> 'confidence', '') ~ '^[0-9]+([.][0-9]+)?$'
            then (r.ctx ->> 'confidence')::numeric
        else coalesce(n.classification_confidence, 0)
    end,
    classification_provider = coalesce(nullif(n.classification_provider, ''), r.ctx ->> 'provider', ''),
    classification_ruleset_version = coalesce(
        nullif(n.classification_ruleset_version, ''),
        r.ctx ->> 'classification_ruleset_version',
        ''
    ),
    document_type = case
        when r.ctx ->> 'document_type' in (
            'routine_statistics', 'brand_reputation', 'certified_agent', 'sponsorship',
            'risk_event', 'company_profile', 'regulatory', 'industry_news', 'other'
        ) then r.ctx ->> 'document_type'
        else coalesce(nullif(n.document_type, ''), 'other')
    end,
    own_role = r.source_own_role,
    risk_event_type = case
        when r.ctx ->> 'risk_event_type' in (
            'sanction', 'fraud', 'consumer_harm', 'legal', 'governance',
            'reputational', 'market', 'none'
        ) then r.ctx ->> 'risk_event_type'
        else coalesce(nullif(n.risk_event_type, ''), 'none')
    end,
    alert_eligible = (
        r.source_own_mentioned
        and r.source_own_role = 'primary'
        and r.saved_alert_eligible
        and r.ctx ->> 'risk_event_type' in (
            'sanction', 'fraud', 'consumer_harm', 'legal', 'governance', 'reputational'
        )
    ),
    classification_decision_path = coalesce(
        nullif(n.classification_decision_path, '{}'::jsonb),
        r.ctx -> 'classification_decision_path',
        '{}'::jsonb
    ),
    clipping_recommended = case
        when not r.source_own_mentioned and r.ctx ->> 'category' in ('own', 'sponsorship') then false
        else coalesce(n.clipping_recommended, r.saved_clipping_recommended, false)
    end,
    clipping_reason = case
        when not r.source_own_mentioned and r.ctx ->> 'category' in ('own', 'sponsorship') then ''
        else coalesce(nullif(n.clipping_reason, ''), r.ctx ->> 'clipping_reason', '')
    end,
    raw = jsonb_set(
        coalesce(n.raw, '{}'::jsonb),
        '{_ai_context}',
        coalesce(r.ctx, '{}'::jsonb) || jsonb_build_object(
            'own_mentioned', r.source_own_mentioned,
            'own_role', r.source_own_role,
            'negative_target', r.source_negative_target,
            'alert_eligible', (
                r.source_own_mentioned
                and r.source_own_role = 'primary'
                and r.saved_alert_eligible
                and r.ctx ->> 'risk_event_type' in (
                    'sanction', 'fraud', 'consumer_harm', 'legal', 'governance', 'reputational'
                )
            )
        ),
        true
    )
from restored r
where n.id = r.id;

-- Explicit corrections for verified August false-positive company matches.
-- Keeping the IDs explicit makes the backfill narrow, reviewable, and safe.
with corrections(id, category, tone, document_type, expected_visible, review_note) as (
    values
        (161142::bigint, 'industry',   'neutral', 'industry_news',   true,  'Insurance research event; no company source evidence'),
        (162138::bigint, 'competitor', 'neutral', 'industry_news',   true,  'Kyobo Life sports event; no company source evidence'),
        (162223::bigint, 'competitor', 'neutral', 'industry_news',   true,  'Kyobo Life sports event; no company source evidence'),
        (181355::bigint, 'competitor', 'neutral', 'industry_news',   true,  'Samsung Fire mobility event; no company source evidence'),
        (183225::bigint, 'other',      'neutral', 'other',           false, 'BNK event outside insurance monitoring scope'),
        (195062::bigint, 'competitor', 'neutral', 'certified_agent', true,  'Global Financial Sales certified-agent article'),
        (195064::bigint, 'competitor', 'neutral', 'certified_agent', true,  'GA Korea certified-agent interview'),
        (195177::bigint, 'competitor', 'neutral', 'industry_news',   true,  'Sarangmoa Financial event; no company source evidence'),
        (202123::bigint, 'other',      'neutral', 'other',           false, 'Woori Financial CSR event outside insurance scope'),
        (203299::bigint, 'industry',   'neutral', 'industry_news',   true,  'Insurance academic event; no company source evidence')
), updated as (
    update public.news_articles n
    set
        category = c.category,
        tone = c.tone,
        own_mentioned = false,
        negative_target = 'none',
        classification_evidence = '',
        classification_reason = 'Retrieval keyword was not supported by company-name evidence in source fields',
        classification_confidence = 1,
        classification_provider = 'rules:source_evidence_guard_v1',
        classification_ruleset_version = 'classification-contract-v3-2026-08-12:source-evidence-backfill',
        document_type = c.document_type,
        own_role = 'absent',
        risk_event_type = 'none',
        alert_eligible = false,
        classification_decision_path = jsonb_build_object(
            'negative_shape', false,
            'own_is_primary', false,
            'direct_risk_event', false,
            'source_evidence', false,
            'source_evidence_guard', true
        ),
        clipping_recommended = false,
        clipping_reason = '',
        raw = jsonb_set(
            coalesce(n.raw, '{}'::jsonb),
            '{_ai_context}',
            coalesce(n.raw -> '_ai_context', '{}'::jsonb) || jsonb_build_object(
                'category', c.category,
                'tone', c.tone,
                'own_mentioned', false,
                'negative_target', 'none',
                'evidence', '',
                'reason', 'Retrieval keyword was not supported by company-name evidence in source fields',
                'confidence', 1,
                'provider', 'rules:source_evidence_guard_v1',
                'classification_ruleset_version', 'classification-contract-v3-2026-08-12:source-evidence-backfill',
                'document_type', c.document_type,
                'own_role', 'absent',
                'risk_event_type', 'none',
                'alert_eligible', false,
                'classification_decision_path', jsonb_build_object(
                    'negative_shape', false,
                    'own_is_primary', false,
                    'direct_risk_event', false,
                    'source_evidence', false,
                    'source_evidence_guard', true
                ),
                'clipping_recommended', false,
                'clipping_reason', ''
            ),
            true
        )
    from corrections c
    where n.id = c.id
    returning n.id
)
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
select
    '2026-08-12-source-evidence-hardening-v1',
    c.id,
    c.category,
    c.tone,
    c.expected_visible,
    'codex',
    c.review_note,
    now()
from corrections c
join updated u on u.id = c.id
on conflict (review_batch, article_id) do update
set
    expected_category = excluded.expected_category,
    expected_tone = excluded.expected_tone,
    expected_visible = excluded.expected_visible,
    reviewer = excluded.reviewer,
    review_note = excluded.review_note,
    updated_at = now();

-- Preserve the historical article but block a portal re-exposure from being
-- treated as a new alert. Its original publication date is 2026-04-20.
update public.news_articles n
set
    alert_eligible = false,
    classification_reason = 'Historical original from 2026-04-20; keep in archive and suppress new alert',
    classification_provider = 'rules:stale_reexposure_guard_v1',
    classification_ruleset_version = 'classification-contract-v3-2026-08-12:stale-reexposure-backfill',
    classification_decision_path = coalesce(n.classification_decision_path, '{}'::jsonb)
        || jsonb_build_object('stale_reexposure', true, 'alert_eligible', false),
    raw = jsonb_set(
        jsonb_set(coalesce(n.raw, '{}'::jsonb), '{_stale_reexposure}', 'true'::jsonb, true),
        '{_ai_context}',
        coalesce(n.raw -> '_ai_context', '{}'::jsonb) || jsonb_build_object(
            'alert_eligible', false,
            'provider', 'rules:stale_reexposure_guard_v1',
            'reason', 'Historical original from 2026-04-20; keep in archive and suppress new alert',
            'classification_ruleset_version', 'classification-contract-v3-2026-08-12:stale-reexposure-backfill',
            'classification_decision_path', coalesce(n.classification_decision_path, '{}'::jsonb)
                || jsonb_build_object('stale_reexposure', true, 'alert_eligible', false)
        ),
        true
    )
where n.id = 99;

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
    99,
    'own',
    'negative',
    false,
    'codex',
    'Direct company risk article, but original publication is from 2026-04-20 and must not alert again',
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
