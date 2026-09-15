export const auditLabels = {
  own: "당사", competitor: "GA", industry: "보험사", regulation: "정책/규제", sponsorship: "스폰서십", other: "기타", exclude: "제외",
  positive: "긍정", neutral: "중립", caution: "주의", negative: "부정",
  blocked: "자동 보정 보류", audited: "점검 완료", applied: "보정 처리 완료", started: "점검 중",
  manual_protected: "수동 분류 보호", original_required: "원문 확인 필요", limited_source: "근거 부족", source_review: "분류 재검토",
  gate_required: "검증 통과 전 적용 보류",
  validated_candidate: "검증 통과 · 적용 후보", source_verified_review: "원문 확인 · 분류 검토",
  source_role: "업종 무관 기사", insurance_subject: "보험사·GA 구분",
  safety_contract_failed: "당사·경보 보호 검증 미달", family_regression_failed: "유형별 회귀 검증 미달",
  own_mention_accuracy: "당사 언급 일치율", visibility_accuracy: "분류상 노출 일치율",
  unreviewed_alert_labels: "경보 정답 미검토", verified: "반영 확인 완료",
  verification_conflict: "반영 후 변경 감지", verification_pending: "반영 확인 대기", not_needed: "변경 없음",
  manual_rule_gap: "수동 수정 유지 · 규칙 재검토",
  reviewed_case_gate_failed: "검증 기준 미달", repair_volume_exceeded: "보정 상한 초과", empty_scan: "조회 기사 없음",
  category_accuracy: "분류 일치율", tone_accuracy: "논조 일치율", exact_accuracy: "분류·논조 동시 일치율",
  alert_precision: "경보 정확도", alert_recall: "부정 경보 탐지율",
  insufficient_cases: "전체 검증 표본 부족", insufficient_positive_cases: "실제 부정 기사 표본 부족", insufficient_negative_cases: "비부정 기사 표본 부족",
};

export function auditLabel(value) { return auditLabels[value] || (value ? "추가 확인 필요" : "미기록"); }
export function auditPercent(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(1)}%` : "미측정"; }
export function auditStamp(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "미기록" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
