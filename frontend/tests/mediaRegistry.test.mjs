import test from "node:test";
import assert from "node:assert/strict";
import { registryRows, registryError, safeArticleUrl, validRegistryPayload } from "../src/mediaRegistryModel.mjs";
import { resolvePublisher } from "../src/publisherIdentity.js";

test("registry has no fabricated fallback rows", () => assert.deepEqual(registryRows(null, "media"), []));
test("article-level publisher correction wins over RSS label", () => assert.equal(resolvePublisher({source:"google",rss_source_name:"뉴스1",raw:{publisher_manual_override:"검증언론"}}),"검증언론"));
test("malformed data fails validation instead of crashing the view", () => {
  assert.equal(validRegistryPayload({}),false);
  assert.equal(validRegistryPayload({rows:[{}],total:1},"media"),false);
  assert.equal(validRegistryPayload({media:[],unknown:[],reporters:[],own_articles:0}),true);
});
test("unknown publishers have their own queue", () => {
  const data = {media: [{name: "보험저널"}], unknown: [{host: "news.google.com"}]};
  assert.equal(registryRows(data, "unknown")[0].host, "news.google.com");
  assert.equal(registryRows(data, "media", "보험").length, 1);
});
test("reporter search includes outlet", () => assert.equal(registryRows({reporters: [{name: "홍길동", media: "보험저널"}]}, "reporters", "보험").length, 1));
test("authorization errors never claim saved", () => assert.match(registryError(new Error("missing_dashboard_session")), /로그인/));
test("portal aliases explain article-scoped resolution", () => assert.match(registryError(new Error("portal_requires_article_resolution")), /기사별/));
test("untrusted article links cannot execute script", () => {
  assert.equal(safeArticleUrl("javascript:alert(1)"), "");
  assert.equal(safeArticleUrl("https://example.com/news"), "https://example.com/news");
});
