import test from "node:test";
import assert from "node:assert/strict";
import { auditPercent, auditLabel, auditStamp } from "../src/classificationAuditModel.mjs";
test("missing quality scores never appear as perfect or zero", () => {
  for (const value of [null, undefined, NaN, Infinity, "1", -1, 2]) assert.equal(auditPercent(value), "미측정");
  assert.equal(auditPercent(0), "0.0%"); assert.equal(auditPercent(.955), "95.5%");
});
test("operators see readable unknown states and Korean-time timestamps", () => {
  assert.equal(auditLabel("blocked"), "자동 보정 보류");
  assert.equal(auditLabel("PRIVATE_EXCEPTION"), "추가 확인 필요");
  assert.equal(auditStamp(null), "미기록");
  assert.match(auditStamp("2026-09-08T23:38:31Z"), /09\. 09\. 08:38/);
});
