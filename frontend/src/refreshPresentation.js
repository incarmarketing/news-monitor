export function refreshFailureMessage(error) {
  const message = String(error?.message || error || "");
  if (/github.*(?:status_401|\b401\b)/i.test(message)) return "기사 수집 연결의 GitHub 인증을 확인해 주세요.";
  if (/missing_github_dispatch_token/i.test(message)) return "기사 수집 연결 설정을 확인해 주세요.";
  if (/github.*(?:status_403|\b403\b)/i.test(message)) return "기사 수집 연결의 GitHub 실행 권한을 확인해 주세요.";
  if (/429|rate.limit/i.test(message)) return "요청이 많아 수집을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (/missing_dashboard_session|invalid_session/i.test(message)) return "운영 로그인 상태를 확인해 주세요.";
  return "기사 수집을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
