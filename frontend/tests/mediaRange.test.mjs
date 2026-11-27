import test from "node:test";
import assert from "node:assert/strict";
import { createMediaRangeLoader } from "../src/mediaRange.js";

const range = { startDate: "2026-08-28", endDate: "2026-11-25", revision: "v1" };

test("media reads the complete selected range and shares an in-flight read", async () => {
  const calls = [];
  let finish;
  const read = createMediaRangeLoader(input => {
    calls.push(input);
    return new Promise(resolve => { finish = resolve; });
  }, () => 100);
  const first = read(range);
  assert.equal(read(range), first);
  await Promise.resolve();
  assert.deepEqual(calls, [{ startDate: range.startDate, endDate: range.endDate, maxRows: 20000, requireComplete: true }]);
  finish([{ id: "old-article" }]);
  const result = await first;
  assert.equal(result.startDate, range.startDate);
  assert.equal(result.endDate, range.endDate);
  assert.equal(result.articles[0].id, "old-article");
  assert.equal(await read(range), result);
});

test("media range cache expires, invalidates revisions, and remains bounded", async () => {
  let time = 100;
  let calls = 0;
  const read = createMediaRangeLoader(async () => [{ id: ++calls }], () => time);
  await read(range);
  time += 119999;
  assert.equal((await read(range)).articles[0].id, 1);
  time += 1;
  await read(range);
  assert.equal(calls, 2);
  await read({ ...range, revision: "v2" });
  assert.equal(calls, 3);
  for (let day = 1; day <= 4; day++) await read({ ...range, startDate: `2026-09-0${day}` });
  await read(range);
  assert.equal(calls, 8);
});

test("failed media reads are not cached as an empty successful result", async () => {
  let calls = 0;
  const read = createMediaRangeLoader(async () => {
    if (++calls === 1) throw new Error("range unavailable");
    return [];
  });
  await assert.rejects(read(range), /range unavailable/);
  assert.deepEqual((await read(range)).articles, []);
  assert.equal(calls, 2);
});

test("a long-running media read is shared and cache age starts only after completion", async () => {
  let time = 0, calls = 0, finish;
  const read = createMediaRangeLoader(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, () => time);
  const first = read(range);
  await Promise.resolve();
  time = 20 * 60000;
  assert.equal(read(range), first);
  assert.equal(calls, 1);
  finish([{ id: "complete-history" }]);
  const completed = await first;
  time += 119999;
  assert.equal(await read(range), completed);
  time++;
  assert.notEqual(read(range), first);
  await Promise.resolve();
  assert.equal(calls, 2);
  finish([]);
});
