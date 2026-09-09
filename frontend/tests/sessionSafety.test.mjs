import assert from "node:assert/strict";
import test from "node:test";
import { getStoredSession, dashboardSessionLabel } from "../src/liveData.js";

test("blocked session storage does not crash public reading", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  try {
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    assert.equal(getStoredSession(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete globalThis.sessionStorage;
  }
});
test("invalid expiry is not an active login or an administrator", () => {
  const invalid = {session_token:"test-token",session_expires_at:"invalid",role:"admin"};
  assert.equal(dashboardSessionLabel(invalid), "로그인 안 됨 · 조회 전용");
});
test("sidebar labels distinguish anonymous, viewer and admin sessions", () => {
  const active = {session_token:"test-token",session_expires_at:new Date(Date.now()+60000).toISOString(),display_name:"검증 사용자"};
  assert.equal(dashboardSessionLabel(null), "로그인 안 됨 · 조회 전용");
  assert.equal(dashboardSessionLabel({...active,role:"viewer"}), "검증 사용자 · 조회 전용");
  assert.equal(dashboardSessionLabel({...active,role:"admin"}), "검증 사용자 · 관리자");
});
