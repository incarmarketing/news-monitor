import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOperationalStatusPayload } from "../src/liveData.js";

test("public operations payload exposes the latest Slack and daily report state", () => {
  const status = normalizeOperationalStatusPayload({
    generated_at: "2026-08-20T08:13:00+09:00",
    notifications: [
      {
        id: 1,
        sent_at: "2026-08-19T23:12:57Z",
        channel: "slack",
        message_type: "daily_report",
        dedupe_key: "slack:daily_report:언론 동향 2026-08-20 08",
        title: "언론 동향 2026-08-20 08",
        status: "success",
      },
    ],
    report_runs: [
      {
        run_key: "2026-08-20-08",
        report_date: "2026-08-20",
        report_slot: "08",
        timestamp: "2026-08-19T23:12:08Z",
        risk_level: "LOW",
      },
    ],
    job_runs: [
      {
        run_key: "daily_report:2026-08-20:08",
        job_type: "daily_report",
        report_date: "2026-08-20",
        report_slot: "08",
        status: "success",
        started_at: "2026-08-19T23:00:45Z",
        finished_at: "2026-08-19T23:12:57Z",
      },
    ],
    watch_runs: [],
  });

  assert.equal(status.generatedAt, "2026-08-20T08:13:00+09:00");
  assert.equal(status.notifications.length, 1);
  assert.equal(status.notifications[0].time, "08:12");
  assert.equal(status.notifications[0].status, "성공");
  assert.equal(status.reportRuns[0].date, "2026-08-20");
  assert.equal(status.reportRuns[0].slot, "08");
  assert.equal(status.jobRuns[0].status, "success");
});

test("non-delivery channels stay out of the public Slack history", () => {
  const status = normalizeOperationalStatusPayload({
    notifications: [
      { id: 1, sent_at: "2026-08-19T23:12:57Z", channel: "email", status: "success" },
      { id: 2, sent_at: "2026-08-19T23:12:57Z", channel: "slack", status: "success" },
    ],
  });

  assert.equal(status.notifications.length, 1);
  assert.equal(status.notifications[0].channel, "slack");
});
