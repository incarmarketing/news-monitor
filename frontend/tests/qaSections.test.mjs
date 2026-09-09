import assert from "node:assert/strict";
import test from "node:test";
import { navItems } from "../src/data.js";
import { sections, expectedSection, validateSectionState } from "../scripts/qa-sections.mjs";

test("QA follows all current navigation entries, not retired screens", () => {
  assert.deepEqual(sections.map(row => row.id), navItems.map(row => row.id));
  for (const id of ["stocks", "clipping", "scraps"]) assert.ok(sections.some(row => row.id === id));
  assert.ok(!sections.some(row => row.id === "risk"));
});
test("QA acknowledges the intentional mobile report redirect", () => {
  assert.equal(expectedSection("reports", 390), "overview");
  assert.equal(expectedSection("reports", 1241), "reports");
});
test("QA cannot pass a fallback dashboard or a crashed empty workspace", () => {
  assert.ok(validateSectionState({requested:"stocks",width:1366,actual:"overview",visibleText:"x".repeat(40)}).length);
  assert.ok(validateSectionState({requested:"stocks",width:1366,actual:"stocks",visibleText:"",errors:["ReferenceError"]}).length);
  assert.deepEqual(validateSectionState({requested:"stocks",width:1366,actual:"stocks",visibleText:"x".repeat(40)}), []);
});
