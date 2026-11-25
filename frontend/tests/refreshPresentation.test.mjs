import test from "node:test";
import assert from "node:assert/strict";
import { refreshFailureMessage } from "../src/refreshPresentation.js";

test("collection connection failures explain the action without exposing API identifiers", () => {
  const cases = [
    ["github_dispatch_failed · status_401", "기사 수집 연결의 GitHub 인증을 확인해 주세요."],
    ["missing_github_dispatch_token", "기사 수집 연결 설정을 확인해 주세요."],
    ["github_dispatch_failed status_403", "기사 수집 연결의 GitHub 실행 권한을 확인해 주세요."],
    ["status_429", "요청이 많아 수집을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."],
    ["missing_dashboard_session", "운영 로그인 상태를 확인해 주세요."],
  ];
  for (const [message, expected] of cases) assert.equal(refreshFailureMessage(new Error(message)), expected);
  assert.equal(refreshFailureMessage(null), "기사 수집을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.");
});
