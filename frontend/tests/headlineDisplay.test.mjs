import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { displayHeadline, resolvePublisher } from "../src/publisherIdentity.js";

const cases = JSON.parse(readFileSync(new URL("../../tests/fixtures/headline_cases.json", import.meta.url), "utf8"));
for (const [article, expected] of cases) {
  test(`display headline: ${article.title}`, () => {
    const before = structuredClone(article);
    const publisher = resolvePublisher(article);
    assert.equal(displayHeadline(article), expected);
    assert.equal(displayHeadline({ ...article, title: expected }), expected);
    assert.deepEqual(article, before);
    assert.equal(resolvePublisher(article), publisher);
  });
}

test("string and missing titles remain safe", () => {
  assert.equal(displayHeadline("보험 소식 - 뉴스핌"), "보험 소식");
  assert.equal(displayHeadline(null), "");
});
