-- Private history; source bodies and before-values are never exposed to browsers.
create table public.classification_maintenance_runs (
    run_id text primary key,
    created_at timestamptz not null default now(),
    report jsonb not null default '{}'::jsonb,
    repairs jsonb not null default '[]'::jsonb
);
alter table public.classification_maintenance_runs enable row level security;
revoke all on public.classification_maintenance_runs from public, anon, authenticated;
grant select, insert on public.classification_maintenance_runs to service_role;

create function public.apply_classification_maintenance(
    p_run_id text, p_report jsonb, p_repairs jsonb,
    p_feedback jsonb, p_rules jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '1500ms'
set statement_timeout = '15s'
as $$
declare
    saved jsonb;
    actual_feedback jsonb;
    actual_rules jsonb;
    item jsonb;
    original public.news_articles%rowtype;
    expected public.news_articles%rowtype;
    proposed public.news_articles%rowtype;
    applied_ids jsonb := '[]'::jsonb;
    skipped_ids jsonb := '[]'::jsonb;
    changes jsonb := '[]'::jsonb;
    field_name text;
    cas_ok boolean;
    repair_count integer;
begin
    if p_run_id is null or length(trim(p_run_id)) = 0 or length(p_run_id) > 160
        or p_report->>'mode' is distinct from 'rules_only' then
        raise exception 'invalid maintenance run';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_run_id, 1));
    select report into saved from public.classification_maintenance_runs where run_id = p_run_id;
    if found then
        return saved;
    end if;
    if jsonb_typeof(p_repairs) is distinct from 'array' then
        raise exception 'invalid repairs';
    end if;
    repair_count := jsonb_array_length(p_repairs);
    if repair_count > 25
        or coalesce((p_report->>'row_count')::integer, 0) < 1
        or repair_count > (p_report->>'row_count')::numeric * 0.05
        or p_report->'gate'->>'passed' is distinct from 'true'
        or coalesce(p_report->>'block_reason', '') <> '' then
        raise exception 'maintenance safety gate rejected';
    end if;

    -- Never race with a new manual correction or edited keyword rule.
    lock table public.classification_feedback, public.monitor_context_rules in share mode;
    select coalesce(jsonb_agg(to_jsonb(f) - 'created_at' order by f.id), '[]'::jsonb)
        into actual_feedback from public.classification_feedback f;
    select coalesce(jsonb_agg(to_jsonb(r) - array['created_at', 'updated_at'] order by r.rule_key), '[]'::jsonb)
        into actual_rules from public.monitor_context_rules r;
    if actual_feedback is distinct from p_feedback or actual_rules is distinct from p_rules then
        raise exception 'classification configuration changed during audit';
    end if;

    for item in select value from jsonb_array_elements(p_repairs) loop
        select * into original from public.news_articles
            where id = (item->>'id')::bigint for update;
        if not found then
            skipped_ids := skipped_ids || jsonb_build_array(item->'id');
            continue;
        end if;
        expected := jsonb_populate_record(null::public.news_articles, item->'expected');
        proposed := jsonb_populate_record(null::public.news_articles, item->'patch');
        cas_ok := original.updated_at is not distinct from expected.updated_at
            and original.article_hash = item->>'article_hash'
            and original.title is not distinct from expected.title
            and original.link is not distinct from expected.link;
        for field_name in select jsonb_object_keys(item->'patch') loop
            if field_name not in (
                'category','tone','own_mentioned','negative_target','document_type','own_role',
                'risk_event_type','alert_eligible','classification_evidence','classification_confidence',
                'classification_provider','classification_reason','classification_ruleset_version',
                'classification_decision_path','clipping_recommended','clipping_reason','raw'
            ) then
                raise exception 'unexpected repair field';
            end if;
            cas_ok := cas_ok and (to_jsonb(original)->field_name is not distinct from to_jsonb(expected)->field_name);
        end loop;
        if not cas_ok then
            skipped_ids := skipped_ids || jsonb_build_array(original.id);
            continue;
        end if;

        if original.report_date < (now() at time zone 'Asia/Seoul')::date - 6
            or original.report_date > (now() at time zone 'Asia/Seoul')::date
            or coalesce(original.own_mentioned, false)
            or original.category in ('own', 'sponsorship')
            or original.tone = 'negative' or coalesce(original.alert_eligible, false)
            or original.negative_target = 'own'
            or original.classification_provider like 'manual%'
            or original.raw->>'_feedback_applied' = 'true'
            or original.raw->>'own_mentioned' = 'true'
            or original.raw->>'_tone' = 'negative' or original.raw->>'tone' = 'negative'
            or original.raw->'_ai_context'->>'tone' = 'negative'
            or original.raw->'_ai_context'->>'own_mentioned' = 'true'
            or original.raw->'_ai_context'->>'alert_eligible' = 'true'
            or exists (
                select 1 from public.classification_feedback f
                where (f.article_hash <> '' and f.article_hash = original.article_hash)
                    or (f.link <> '' and lower(split_part(f.link, '?', 1)) = lower(split_part(original.link, '?', 1)))
                    or (f.title <> '' and lower(trim(f.title)) = lower(trim(original.title)))
            )
            or (coalesce(original.title,'') || coalesce(original.raw->>'description','')
                || coalesce(original.raw->>'content','') || coalesce(original.raw->>'body','')) ~ '인카금융|인카금융서비스'
        then
            raise exception 'protected article in repair batch';
        end if;
        if proposed.classification_provider is distinct from 'rules:source-role-v1'
            or proposed.category is distinct from 'other' or proposed.tone is distinct from 'neutral'
            or proposed.own_mentioned is distinct from false
            or proposed.alert_eligible is distinct from false
            or proposed.negative_target is distinct from 'none'
            or proposed.clipping_recommended is distinct from false
            or proposed.classification_ruleset_version is distinct from p_report->>'ruleset'
            or coalesce(proposed.classification_reason, '') = ''
            or proposed.raw->'_ai_context'->>'provider' is distinct from 'rules:source-role-v1'
            or proposed.raw->'_ai_context'->>'category' is distinct from 'other'
            or proposed.raw->'_ai_context'->>'tone' is distinct from 'neutral'
            or proposed.raw->'_ai_context'->>'alert_eligible' is distinct from 'false'
            or proposed.raw->>'_category' is distinct from 'other'
            or proposed.raw->>'_tone' is distinct from 'neutral'
        then
            raise exception 'unapproved repair';
        end if;
        update public.news_articles set
            category=proposed.category, tone=proposed.tone, own_mentioned=false,
            negative_target='none', document_type=proposed.document_type,
            own_role=proposed.own_role, risk_event_type=proposed.risk_event_type,
            alert_eligible=false, classification_evidence=proposed.classification_evidence,
            classification_confidence=proposed.classification_confidence,
            classification_provider=proposed.classification_provider,
            classification_reason=proposed.classification_reason,
            classification_ruleset_version=proposed.classification_ruleset_version,
            classification_decision_path=proposed.classification_decision_path,
            clipping_recommended=false, clipping_reason='', raw=proposed.raw, updated_at=now()
        where id=original.id;
        applied_ids := applied_ids || jsonb_build_array(original.id);
        changes := changes || jsonb_build_array(jsonb_build_object(
            'id', original.id, 'before', to_jsonb(original), 'patch', item->'patch'
        ));
    end loop;
    saved := p_report || jsonb_build_object(
        'status','applied', 'applied_count',jsonb_array_length(applied_ids),
        'applied_ids',applied_ids, 'skipped_ids',skipped_ids, 'completed_at',now()
    );
    insert into public.classification_maintenance_runs(run_id,report,repairs)
        values(p_run_id,saved,changes);
    return saved;
end;
$$;
revoke all on function public.apply_classification_maintenance(text,jsonb,jsonb,jsonb,jsonb)
    from public, anon, authenticated;
grant execute on function public.apply_classification_maintenance(text,jsonb,jsonb,jsonb,jsonb)
    to service_role;
