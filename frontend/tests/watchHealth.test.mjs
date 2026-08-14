import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWatchHealthState,
  isEmptyWatchResult,
  watchRunDisplayState,
} from "../src/watchHealth.js";

const NOW = Date.parse("2026-08-14T03:50:00Z");

test("empty scan variants are successful watch executions", () => {
  assert.equal(isEmptyWatchResult("no_new_negative_article", ""), true);
  assert.equal(isEmptyWatchResult("failed", "No-new-negative-article"), true);
  assert.equal(isEmptyWatchResult("completed", "신규 부정기사가 없습니다"), true);
  assert.equal(watchRunDisplayState("no_change", ""), "정상");
});

test("latest GitHub success overrides an older DB failure marker", () => {
  const state = deriveWatchHealthState({
    runStatus: "failed",
    runMessage: "temporary marker",
    runScannedAt: "2026-08-14T03:39:00Z",
    workflowStatus: "completed",
    workflowConclusion: "success",
    workflowUpdatedAt: "2026-08-14T03:40:00Z",
    now: NOW,
  });
  assert.equal(state.status, "ok");
  assert.equal(state.authoritativeRunFailure, false);
});

test("a recent successful DB scan keeps an in-progress workflow healthy", () => {
  const state = deriveWatchHealthState({
    runStatus: "no_new_negative_article",
    runScannedAt: "2026-08-14T03:39:00Z",
    workflowStatus: "in_progress",
    workflowUpdatedAt: "2026-08-14T03:49:00Z",
    now: NOW,
  });
  assert.equal(state.status, "ok");
  assert.equal(state.workflowRunning, true);
});

test("unknown fresh DB status is warning rather than failure", () => {
  const state = deriveWatchHealthState({
    runStatus: "idle",
    runScannedAt: "2026-08-14T03:45:00Z",
    now: NOW,
  });
  assert.equal(state.status, "warn");
});

test("an explicit newer DB error remains a failure", () => {
  const state = deriveWatchHealthState({
    runStatus: "error",
    runMessage: "collector timeout",
    runScannedAt: "2026-08-14T03:48:00Z",
    workflowStatus: "completed",
    workflowConclusion: "success",
    workflowUpdatedAt: "2026-08-14T03:40:00Z",
    now: NOW,
  });
  assert.equal(state.status, "fail");
  assert.equal(state.authoritativeRunFailure, true);
});

test("a latest failed workflow is reported when no newer scan recovered it", () => {
  const state = deriveWatchHealthState({
    runStatus: "success",
    runScannedAt: "2026-08-14T03:30:00Z",
    workflowStatus: "completed",
    workflowConclusion: "failure",
    workflowUpdatedAt: "2026-08-14T03:45:00Z",
    now: NOW,
  });
  assert.equal(state.status, "fail");
  assert.equal(state.authoritativeWorkflowFailure, true);
});

test("missing watch history remains pending", () => {
  const state = deriveWatchHealthState({ now: NOW });
  assert.equal(state.status, "pending");
});
