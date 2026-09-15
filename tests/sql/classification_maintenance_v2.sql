begin;
set local role service_role;
set local statement_timeout='20s';
do $test$
declare
    n public.news_articles%rowtype;
    feedback jsonb;
    rules jsonb;
    report jsonb;
    gate jsonb;
    item jsonb;
    patch_value jsonb;
    result jsonb;
    changed jsonb;
    bad jsonb;
begin
    select coalesce(jsonb_agg(to_jsonb(f)-'created_at' order by id),'[]') into feedback from public.classification_feedback f;
    select coalesce(jsonb_agg(to_jsonb(r)-array['created_at','updated_at'] order by rule_key),'[]') into rules from public.monitor_context_rules r;
    select * into n from public.news_articles a where tone='neutral' and category='industry'
        and not own_mentioned and report_date=(now() at time zone 'Asia/Seoul')::date
        and not exists(select 1 from public.classification_feedback f where f.article_hash=a.article_hash)
        order by id desc limit 1 for update;
    if not found then raise exception 'No transaction-only test row'; end if;
    update public.news_articles set title='삼성화재, 보험 상품 서비스 개선', link='https://example.com/maintenance-test',
        category='competitor', tone='neutral', own_mentioned=false, negative_target='none', alert_eligible=false,
        clipping_recommended=false, classification_provider='rules:test',
        raw='{"description":"삼성화재가 보험 상품과 계약자 안내 서비스를 개선했다."}'::jsonb where id=n.id;
    select * into n from public.news_articles where id=n.id;
    gate := '{"version":"scoped-v2","passed":true,"common":{"passed":true,"case_count":72,"own_mention_accuracy":1,"alert_precision":1,"alert_recall":1,"alert_confusion":{"true_positive":8,"false_negative":0,"false_positive":0,"true_negative":64}},"delivery":{"passed":true,"case_count":4,"exact_accuracy":1},"families":{"insurance_subject":{"passed":true,"case_count":20,"repair_cases":10,"protected_cases":10,"exact_accuracy":1}}}'::jsonb;
    report := jsonb_build_object('mode','rules_only','row_count',500,'ruleset','test-v2','gate',gate);
    patch_value := jsonb_build_object('category','industry','tone','neutral','own_mentioned',false,'negative_target','none',
        'document_type','other','own_role','absent','risk_event_type','none','alert_eligible',false,
        'classification_evidence',n.title,'classification_confidence',1,
        'classification_provider','rules:insurance-subject-v1','classification_reason','source-backed test',
        'classification_ruleset_version','test-v2','classification_decision_path','{}'::jsonb,
        'clipping_recommended',false,'clipping_reason','');
    patch_value := patch_value || jsonb_build_object('raw',n.raw || patch_value || jsonb_build_object(
        '_category','industry','_tone','neutral','_ai_context',jsonb_build_object(
            'provider','rules:insurance-subject-v1','category','industry','tone','neutral','alert_eligible',false)));
    item := jsonb_build_object('id',n.id,'article_hash',n.article_hash,'family','insurance_subject','expected',to_jsonb(n),'patch',patch_value);

    begin
        perform public.apply_classification_maintenance('test-v2-bad-family',jsonb_set(report,'{gate,families,insurance_subject,exact_accuracy}','0.95'),jsonb_build_array(item),feedback,rules);
        raise exception 'family bypass';
    exception when raise_exception then if sqlerrm <> 'repair family validation failed' then raise; end if; end;
    begin
        perform public.apply_classification_maintenance('test-v2-bad-safety',jsonb_set(report,'{gate,common,alert_precision}','0.5'),jsonb_build_array(item),feedback,rules);
        raise exception 'safety bypass';
    exception when raise_exception then if sqlerrm <> 'classification safety contract failed' then raise; end if; end;
    begin
        perform public.apply_classification_maintenance('test-v2-bad-source',report,jsonb_build_array(jsonb_set(item,'{patch,raw,description}','"tampered source"')),feedback,rules);
        raise exception 'source bypass';
    exception when raise_exception then if sqlerrm <> 'source data changed by classification repair' then raise; end if; end;
    begin
        perform public.apply_classification_maintenance('test-v2-bad-config',report,jsonb_build_array(item),'[]',rules);
        raise exception 'configuration bypass';
    exception when raise_exception then if sqlerrm <> 'classification configuration changed during audit' then raise; end if; end;
    begin
        perform public.apply_classification_maintenance('test-v2-duplicate',report,jsonb_build_array(item,item),feedback,rules);
        raise exception 'duplicate bypass';
    exception when raise_exception then if sqlerrm <> 'duplicate repair article' then raise; end if; end;
    select jsonb_agg(item) into bad from generate_series(1,26);
    begin
        perform public.apply_classification_maintenance('test-v2-volume',report,bad,feedback,rules);
        raise exception 'volume bypass';
    exception when raise_exception then if sqlerrm <> 'maintenance safety gate rejected' then raise; end if; end;

    result := public.apply_classification_maintenance('test-v2-cas',report,
        jsonb_build_array(jsonb_set(item,'{expected,updated_at}',to_jsonb(now()-interval '1 day'))),feedback,rules);
    if result->>'applied_count' <> '0' then raise exception 'CAS failed'; end if;
    result := public.apply_classification_maintenance('test-v2-valid',report,jsonb_build_array(item),feedback,rules);
    if result->>'applied_count' <> '1' then raise exception 'valid repair failed'; end if;
    if public.apply_classification_maintenance('test-v2-valid',report,jsonb_build_array(item),feedback,rules) <> result then
        raise exception 'retry not idempotent'; end if;
    if (select jsonb_array_length(repairs) from public.classification_maintenance_runs where run_id='test-v2-valid') <> 1 then
        raise exception 'backup missing'; end if;

    update public.news_articles set tone='negative' where id=n.id;
    select to_jsonb(a) into changed from public.news_articles a where id=n.id;
    begin
        perform public.apply_classification_maintenance('test-v2-protected',report,jsonb_build_array(jsonb_set(item,'{expected}',changed)),feedback,rules);
        raise exception 'negative protection failed';
    exception when raise_exception then if sqlerrm <> 'protected article in repair batch' then raise; end if; end;
end $test$;
select 'family, common safety, source preservation, config race, duplicate, cap, CAS, valid write, retry, backup, negative protection: passed' as verification;
rollback;
