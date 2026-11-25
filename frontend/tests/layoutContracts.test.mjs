import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("desktop overview has a scoped viewport layout rather than clipped document overflow", () => {
  const css = fs.readFileSync(new URL("../src/dashboard-workbench.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 1201px\)/);
  assert.match(css, /app-shell\[data-active-section="overview"\].*height: 100dvh/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /(?:html|body)\s*\{[^}]*overflow:\s*hidden/s);
});

test("form controls share one visual contract across feature stylesheets", () => {
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(shared, /--control-height: 40px/);
  assert.match(shared, /--control-font-size: 16px/);
  assert.match(shared, /--control-radius: 4px/);
  for (const file of ["monitoring-workbench.css", "mediaRegistry.css", "classificationAudit.css"]) {
    const css = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(css, /var\(--control-height\)/);
    assert.doesNotMatch(css, /select\s*\{[^}]*font-size:\s*(?:14|17|18)px/s);
  }
  const registry = fs.readFileSync(new URL("../src/mediaRegistry.css", import.meta.url), "utf8");
  assert.match(registry, /\.registry-table :is\(th,td\):nth-child\(3\)/);
  assert.doesNotMatch(registry, /\.media-registry :is\(th,td\):nth-child\(3\)/);
});
