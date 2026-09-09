import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("successful scrap analysis constructs a local report before saving", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx",import.meta.url),"utf8");
  const ast=ts.createSourceFile("main.jsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  const names=new Set(["buildLocalScrapAnalysisReport","formatNotificationDisplayTime","formatKstDateKey"]);
  const code=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(ast)).join("\n");
  const context=vm.createContext({Date,Intl,Number,Array,String});
  vm.runInContext(code,context);
  const report=context.buildLocalScrapAnalysisReport({report:{title:"검증 보고서"},analysis:"완료"},"검증",[{article_hash:"test-hash"}]);
  assert.equal(report.title,"검증 보고서");
  assert.equal(report.articleCount,1);
  assert.match(report.time,/^\d{2}:\d{2}$/);
  assert.match(report.date,/^\d{4}-\d{2}-\d{2}$/);
});
