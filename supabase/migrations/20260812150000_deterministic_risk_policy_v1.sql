-- Deterministic risk policy v1.
-- These rows are the editable vocabulary used by the source-only alert engine.
-- A matching term alone never alerts: runtime still requires same-sentence
-- company + event binding and rejects generated summaries/search keywords.

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  trigger_mode,
  required_mode,
  priority,
  enabled,
  memo,
  rule_group,
  rule_type,
  decision,
  dashboard_visible,
  test_note
) values
  (
    'det_risk_sanction', '당사 제재·처분 사건', 'own', 'negative',
    array['제재','처분','등록 취소','업무 정지','기관주의','기관경고','과징금','과태료','시정 명령','영업 정지'],
    array['인카금융서비스','인카금융'], array['제재 대상 아님','처분 대상 아님','사실무근'],
    'any','any',1,true,
    '원문 같은 문장에서 당사와 제재 사건이 직접 결합된 경우에만 경보 후보',
    'risk_event:sanction','guardrail','alert_direct_own_risk',true,
    '회사명과 사건어의 단순 동시 출현은 부족함'
  ),
  (
    'det_risk_fraud', '당사 사기·불법 사건', 'own', 'negative',
    array['보험사기','편취','횡령','배임','고의 사고','허위 계약','허위 입원','가공 계약','불법 사채','사채놀이','보험 꺾기','약탈 영업'],
    array['인카금융서비스','인카금융'], array['사실무근','혐의 없음','예방','방지'],
    'any','any',2,true,
    '당사 또는 당사 소속 인력이 구체적 불법행위의 주체로 연결된 경우',
    'risk_event:fraud','guardrail','alert_direct_own_risk',true,
    '경쟁사 사건의 비교표·경력 언급은 제외'
  ),
  (
    'det_risk_consumer_harm', '당사 소비자 피해 사건', 'own', 'negative',
    array['소비자 피해','불완전판매','부당승환','보장 공백','민원 급증','민원 증가','고객정보 유출','고객 DB 유출'],
    array['인카금융서비스','인카금융'], array['피해 없음','피해 미발생','피해 지원','소비자 보호 강화'],
    'any','any',3,true,
    '피해가 당사 영업행위 또는 관리행위의 결과로 직접 적시된 경우',
    'risk_event:consumer_harm','guardrail','alert_direct_own_risk',true,
    '피해지원·예방 캠페인은 부정 경보 제외'
  ),
  (
    'det_risk_legal', '당사 수사·소송 사건', 'own', 'negative',
    array['압수수색','기소','구속','입건','고발','검찰 송치','경찰 수사','소송 제기','패소','수사 착수'],
    array['인카금융서비스','인카금융'], array['무혐의','혐의 없음','소송 승소'],
    'any','any',4,true,
    '당사 또는 당사 소속 인력이 수사·법적 조치의 직접 대상인 경우',
    'risk_event:legal','guardrail','alert_direct_own_risk',true,
    '출처로 DART·금감원이 언급된 일반 기사와 구분'
  ),
  (
    'det_risk_governance', '당사 내부통제·관리부실 사건', 'own', 'negative',
    array['내부통제 부실','내부통제 실패','내부통제 구멍','관리 부실','관리 구멍','관리 소홀','영업 관리 부실','모집질서 위반'],
    array['인카금융서비스','인카금융'], array['내부통제 강화','관리 강화','문제 없음'],
    'any','any',5,true,
    '기사의 비판 대상이 당사 조직·관리체계로 명시된 경우',
    'risk_event:governance','guardrail','alert_direct_own_risk',true,
    '업계 전체 제도개선 기사는 주의로만 분류'
  ),
  (
    'det_risk_reputation', '당사 평판 훼손 사건', 'own', 'negative',
    array['스캔들','약탈 영업','불법 영업','그늘','과제 직면','도덕적 해이','평판 훼손','신뢰 추락'],
    array['인카금융서비스','인카금융'], array['브랜드평판 1위','우수인증설계사'],
    'any','any',6,true,
    '당사를 제목·리드의 핵심 비판 대상으로 삼은 평판 리스크 기사',
    'risk_event:reputational','guardrail','alert_direct_own_risk',true,
    '단순 시장비교나 순위 하락은 주의로 분리'
  ),
  (
    'det_suppress_routine_ga_statistics', 'GA 정기 실적·점유율 통계 경보 제외', 'own', 'neutral',
    array['M/S','시장점유율','GA 생보실적','GA 손보실적','월간 판매실적'],
    array['인카금융서비스','인카금융'], array['제재','처분','사기','불완전판매','내부통제 부실'],
    'any','any',7,true,
    '월간·분기 순위표에 당사가 포함돼도 부정 경보로 보내지 않음',
    'alert_suppression:routine_statistics','guardrail','suppress_negative_alert',true,
    '보험저널 월간 M/S 연속 오탐 방지'
  ),
  (
    'det_suppress_brand_reputation_leader', '당사 브랜드평판 1위 경보 제외', 'own', 'positive',
    array['브랜드평판'], array['인카금융서비스','1위'], array['추락','하락','논란','조작'],
    'any','all',8,true,
    '당사 1위가 명시된 브랜드평판 기사는 긍정 성과',
    'alert_suppression:brand_reputation','guardrail','suppress_negative_alert',true,
    '브랜드평판 1위 기사 주의·부정 오탐 방지'
  ),
  (
    'det_suppress_certified_agent_positive', '우수인증설계사 성과 경보 제외', 'own', 'positive',
    array['우수인증설계사'], array['인카금융서비스','인카금융'], array['자격 취소','허위','제재','처분'],
    'any','any',9,true,
    '선정·배출·인터뷰 기사는 성과 기사로 고정',
    'alert_suppression:certified_agent','guardrail','suppress_negative_alert',true,
    '우수인증설계사 인터뷰 부정 알림 방지'
  ),
  (
    'det_suppress_preventive_security', '보안 예방·가입 기사 경보 제외', 'own', 'neutral',
    array['금융보안원','보안 체계 강화','보안 역량 강화','취약점 점검'],
    array['인카금융서비스','인카금융'], array['고객정보 유출','해킹 발생','침해사고 발생'],
    'any','any',10,true,
    '예방·회원사 가입은 사고 발생과 분리',
    'alert_suppression:preventive_security','guardrail','suppress_negative_alert',true,
    '금융보안원 가입 기사 부정 오탐 방지'
  )
on conflict (rule_key) do update
set
  label = excluded.label,
  category = excluded.category,
  tone = excluded.tone,
  trigger_terms = excluded.trigger_terms,
  required_terms = excluded.required_terms,
  exclude_terms = excluded.exclude_terms,
  trigger_mode = excluded.trigger_mode,
  required_mode = excluded.required_mode,
  priority = excluded.priority,
  enabled = excluded.enabled,
  memo = excluded.memo,
  rule_group = excluded.rule_group,
  rule_type = excluded.rule_type,
  decision = excluded.decision,
  dashboard_visible = excluded.dashboard_visible,
  test_note = excluded.test_note,
  updated_at = now();

create or replace function public.apply_deterministic_classification_repairs(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  update public.news_articles as article
  set
    category = repair.category,
    tone = repair.tone,
    own_mentioned = repair.own_mentioned,
    negative_target = repair.negative_target,
    classification_evidence = repair.classification_evidence,
    classification_confidence = repair.classification_confidence,
    classification_provider = repair.classification_provider,
    classification_ruleset_version = repair.classification_ruleset_version,
    document_type = repair.document_type,
    own_role = repair.own_role,
    risk_event_type = repair.risk_event_type,
    alert_eligible = repair.alert_eligible,
    classification_decision_path = repair.classification_decision_path
  from jsonb_to_recordset(p_rows) as repair(
    id bigint,
    category text,
    tone text,
    own_mentioned boolean,
    negative_target text,
    classification_evidence text,
    classification_confidence numeric,
    classification_provider text,
    classification_ruleset_version text,
    document_type text,
    own_role text,
    risk_event_type text,
    alert_eligible boolean,
    classification_decision_path jsonb
  )
  where article.id = repair.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.apply_deterministic_classification_repairs(jsonb) from public, anon, authenticated;
grant execute on function public.apply_deterministic_classification_repairs(jsonb) to service_role;
