import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("delivery labels keep event names without exposing internal alert hashes", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("main.jsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const code = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "cleanNotificationLabel").getText(ast);
  const context = vm.createContext({ String });
  vm.runInContext(code, context);
  assert.equal(context.cleanNotificationLabel("부정기사 감지 727c5a75f931e7190ad5ae92"), "부정기사 감지");
  assert.equal(context.cleanNotificationLabel("event-key", "negative_watch"), "부정기사 감지");
  assert.equal(context.cleanNotificationLabel("일일 언론 동향 2026.11.25 08:15"), "일일 언론 동향");
  assert.equal(context.cleanNotificationLabel("주간 언론 동향"), "주간 언론 동향");
  assert.equal(context.cleanNotificationLabel("월간 언론 동향"), "월간 언론 동향");
  assert.equal(context.cleanNotificationLabel("사용자가 지정한 발송"), "사용자가 지정한 발송");
});
