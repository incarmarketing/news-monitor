import assert from "node:assert/strict";
import test from "node:test";
import { headerDataStatus } from "../src/headerStatusPresentation.js";

const live = { status: "live", source: "supabase", generatedAt: "2026-11-27T07:37:00Z" };

test("header indicator requires a verified healthy connection", () => {
  assert.equal(headerDataStatus(live).state, "ok");
  for (const patch of [{ source: "static" }, { degraded: true }, { statusReadFailed: true }, { dataLoadWarnings: ["ledger_unavailable"] }, { status: "error" }]) {
    assert.equal(headerDataStatus({ ...live, ...patch }).state, "error");
  }
  assert.equal(headerDataStatus({ status: "loading" }).state, "pending");
});

test("cached content remains unverified while the initial live read is pending", () => {
  const cached = { ...live, source: "cache", dataLoadWarnings: ["cached_snapshot"], statusReadFailed: true, coreCheckPending: true };
  assert.equal(headerDataStatus(cached).state, "pending");
  assert.equal(headerDataStatus({ ...cached, coreCheckPending: false }).state, "error");
  assert.equal(headerDataStatus({ ...live, coreCheckPending: true }).state, "pending");
});

test("digital clock shows the data timestamp in KST, not the current wall time", () => {
  const status = headerDataStatus(live);
  assert.equal(status.dateLabel, "11.27");
  assert.equal(status.timeLabel, "16:37");
  assert.equal(status.dateTime, "2026-11-27T07:37:00.000Z");
  assert.match(status.timeTitle, /2026\.11\.27 16:37 기준/);
  assert.equal(headerDataStatus({ ...live, articlesGeneratedAt: "2026-11-27T06:15:00Z" }).timeLabel, "15:15");
});

test("KST midnight is 00:00 and timezone-less stored timestamps remain KST", () => {
  const midnight = headerDataStatus({ ...live, generatedAt: "2026-11-26T15:00:00Z" });
  assert.equal(midnight.dateLabel, "11.27");
  assert.equal(midnight.timeLabel, "00:00");
  assert.equal(headerDataStatus({ ...live, generatedAt: "2026-11-27 16:37:00" }).timeLabel, "16:37");
});

test("missing timestamps never become a misleading current or zero clock", () => {
  for (const generatedAt of ["", "-", "invalid"]) {
    const status = headerDataStatus({ ...live, generatedAt });
    assert.equal(status.dateLabel, "--.--");
    assert.equal(status.timeLabel, "--:--");
    assert.equal(status.dateTime, undefined);
  }
  const dateOnly = headerDataStatus({ ...live, generatedAt: "2026-11-27" });
  assert.equal(dateOnly.dateLabel, "11.27");
  assert.equal(dateOnly.timeLabel, "--:--");
  assert.match(dateOnly.timeTitle, /시각 미확인/);
});
