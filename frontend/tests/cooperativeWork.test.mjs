import test from "node:test";
import assert from "node:assert/strict";
import { mapCooperatively } from "../src/cooperativeWork.js";

test("cooperative work preserves every row and its order while yielding", async () => {
  let time = 0;
  let yields = 0;
  const rows = Array.from({ length: 100 }, (_, index) => index);
  const actual = await mapCooperatively(rows, (row, index) => row + index, {
    budgetMs: 8, now: () => time++, yieldControl: async () => { yields++; },
  });
  assert.deepEqual(actual, rows.map((row, index) => row + index));
  assert.ok(yields > 1);
  assert.deepEqual(await mapCooperatively([], row => row), []);
});

test("cancelled work stops processing and does not return partial success", async () => {
  const controller = new AbortController();
  const seen = [];
  await assert.rejects(mapCooperatively([1, 2, 3], row => { seen.push(row); return row; }, {
    signal: controller.signal, budgetMs: 0, yieldControl: async () => controller.abort(),
  }), { name: "AbortError" });
  assert.deepEqual(seen, [1]);
});
