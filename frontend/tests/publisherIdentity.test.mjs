import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolvePublisher } from "../src/publisherIdentity.js";

const cases = JSON.parse(fs.readFileSync(new URL("../../tests/fixtures/publisher_cases.json", import.meta.url), "utf8"));
for (const [article, expected] of cases) {
  test(`publisher: ${JSON.stringify(article)}`, () => assert.equal(resolvePublisher(article), expected));
}
test("explicit publisher alias wins over a bundled mapping", () => {
  assert.equal(resolvePublisher({ source: "etoday.co.kr" }, [{ host: "etoday.co.kr", press_name: "관리자 지정 매체" }]), "관리자 지정 매체");
});
