-- Transaction-only production verification. No article or audit history survives.
begin;
set local role service_role;
do $test$
declare
    feedback jsonb;
    rules jsonb;
    source_row public.news_articles%rowtype;
    expected jsonb;
    patch_value jsonb;
    item jsonb;
    report_value jsonb;
    result jsonb;
    repeated jsonb;
    bad_batch jsonb;
begin
    select coalesce(jsonb_agg(to_jsonb(f)-'created_at' order by id),'[]') into feedback
        from public.classification_feedback f;
    select coalesce(jsonb_agg(to_jsonb(r)-array['created_at','updated_at'] order by rule_key),'[]') into rules
        from public.monitor_context_rules r;
    select * into source_row from public.news_articles n
        where classification_provider='rules:source-role-v1'
        and report_date >= (now() at time zone 'Asia/Seoul')::date - 6
        and not exists (select 1 from public.classification_feedback f where f.article_hash=n.article_hash)
        order by id desc limit 1;
    if not found then raise exception 'verification requires an existing corrected source-role article'; end if;
    expected := to_jsonb(source_row);
    select jsonb_object_agg(key,value) into patch_value from jsonb_each(expected)
        where key in ('category','tone','own_mentioned','negative_target','document_type','own_role',
            'risk_event_type','alert_eligible','classification_evidence','classification_confidence',
            'classification_provider','classification_reason','classification_ruleset_version',
            'classification_decision_path','clipping_recommended','clipping_reason','raw');
    report_value := jsonb_build_object('mode','rules_only','row_count',500,
        'ruleset',source_row.classification_ruleset_version,'gate',jsonb_build_object('passed',true));
    item := jsonb_build_object('id',source_row.id,'article_hash',source_row.article_hash,
        'expected',expected,'patch',patch_value);

    result := public.apply_classification_maintenance('test-cas',report_value,
        jsonb_build_array(jsonb_set(item,'{expected,updated_at}',to_jsonb(now()-interval '1 day'))),feedback,rules);
    if result->>'applied_count' <> '0' or jsonb_array_length(result->'skipped_ids') <> 1 then
        raise exception 'CAS did not protect a concurrent change';
    end if;
    result := public.apply_classification_maintenance('test-valid',report_value,jsonb_build_array(item),feedback,rules);
    if result->>'applied_count' <> '1' then raise exception 'valid repair failed'; end if;
    repeated := public.apply_classification_maintenance('test-valid',report_value,jsonb_build_array(item),feedback,rules);
    if repeated <> result then raise exception 'idempotent retry failed'; end if;
    if (select jsonb_array_length(repairs) from public.classification_maintenance_runs where run_id='test-valid') <> 1 then
        raise exception 'before-value backup missing';
    end if;

    update public.news_articles set tone='negative' where id=source_row.id;
    select to_jsonb(n) into expected from public.news_articles n where id=source_row.id;
    item := jsonb_set(item,'{expected}',expected);
    begin
        perform public.apply_classification_maintenance('test-protected',report_value,jsonb_build_array(item),feedback,rules);
        raise exception 'negative protection missing';
    exception when raise_exception then
        if sqlerrm <> 'protected article in repair batch' then raise; end if;
    end;
    if exists (select 1 from public.classification_maintenance_runs where run_id='test-protected') then
        raise exception 'rejected repair persisted history';
    end if;

    select jsonb_agg(item) into bad_batch from generate_series(1,26);
    begin
        perform public.apply_classification_maintenance('test-cap',report_value,bad_batch,feedback,rules);
        raise exception 'batch cap missing';
    exception when raise_exception then
        if sqlerrm <> 'maintenance safety gate rejected' then raise; end if;
    end;
    begin
        perform public.apply_classification_maintenance('test-config',report_value,'[]','[]',rules);
        raise exception 'config protection missing';
    exception when raise_exception then
        if sqlerrm <> 'classification configuration changed during audit' then raise; end if;
    end;
end $test$;
select 'CAS, atomic backup, retry, negative protection, batch cap, config race: passed' as verification;
rollback;
