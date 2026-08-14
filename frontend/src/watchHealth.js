const SUCCESS_STATUSES = new Set([
  "ok",
  "success",
  "completed",
  "scanned",
  "alert_sent",
  "empty",
  "no_change",
  "no_alert",
  "no_result",
  "no_new_negative_article",
  "no_new_negative_articles",
]);

const FAILURE_STATUSES = new Set([
  "fail",
  "failed",
  "failure",
  "error",
  "timed_out",
  "timeout",
  "cancelled",
  "action_required",
]);

const RUNNING_STATUSES = new Set(["queued", "in_progress", "waiting", "pending"]);

export function normalizeWatchToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function isEmptyWatchResult(status, message) {
  const statusToken = normalizeWatchToken(status);
  const messageToken = normalizeWatchToken(message);
  return statusToken === "empty"
    || statusToken === "no_change"
    || statusToken === "no_alert"
    || statusToken === "no_result"
    || statusToken.startsWith("no_new_negative_article")
    || messageToken.includes("no_new_negative_article")
    || messageToken.includes("no_negative_article_found")
    || /신규\s*부정\s*기사\s*(?:가\s*)?없/.test(String(message || ""))
    || /새\s*부정\s*기사\s*(?:가\s*)?없/.test(String(message || ""));
}

export function watchRunDisplayState(status, message) {
  const statusToken = normalizeWatchToken(status);
  if (isEmptyWatchResult(status, message) || SUCCESS_STATUSES.has(statusToken)) return "정상";
  if (FAILURE_STATUSES.has(statusToken)) return "실패";
  if (RUNNING_STATUSES.has(statusToken)) return "실행 중";
  return statusToken ? "확인" : "대기";
}

export function deriveWatchHealthState({
  runStatus,
  runMessage,
  runScannedAt,
  workflowStatus,
  workflowConclusion,
  workflowCreatedAt,
  workflowUpdatedAt,
  workflowSourceStatus,
  now = Date.now(),
} = {}) {
  const runStatusToken = normalizeWatchToken(runStatus);
  const workflowStatusToken = normalizeWatchToken(workflowStatus);
  const workflowConclusionToken = normalizeWatchToken(workflowConclusion);
  const emptyScan = isEmptyWatchResult(runStatus, runMessage);
  const runSuccess = emptyScan || SUCCESS_STATUSES.has(runStatusToken);
  const runFailure = FAILURE_STATUSES.has(runStatusToken) && !emptyScan;
  const workflowRunning = RUNNING_STATUSES.has(workflowStatusToken);
  const workflowSuccess = workflowConclusionToken === "success";
  const workflowFailure = FAILURE_STATUSES.has(workflowConclusionToken);

  const runAt = timestampMs(runScannedAt);
  const workflowAt = timestampMs(workflowUpdatedAt || workflowCreatedAt);
  const runDelay = ageMinutes(runAt, now);
  const workflowDelay = ageMinutes(workflowAt, now);
  const latestAt = Math.max(runAt || 0, workflowAt || 0) || null;
  const delay = ageMinutes(latestAt, now);
  const recentRunSuccess = runSuccess && runDelay !== null && runDelay <= 25;
  const recentWorkflowSuccess = workflowSuccess && workflowDelay !== null && workflowDelay <= 25;

  // GitHub completion can trail the DB write by a short amount. A successful completion
  // from the same run must override a stale or intermediary DB failure marker.
  const workflowCoversRun = workflowSuccess
    && workflowAt !== null
    && (runAt === null || workflowAt >= runAt - 2 * 60 * 1000);
  const runSupersedesWorkflow = runAt !== null
    && (workflowAt === null || runAt > workflowAt + 2 * 60 * 1000);
  const authoritativeRunFailure = runFailure && !workflowCoversRun && runSupersedesWorkflow;
  const authoritativeWorkflowFailure = workflowFailure
    && !(recentRunSuccess && runAt !== null && workflowAt !== null && runAt > workflowAt);

  let status = "ok";
  if (workflowRunning) {
    status = recentRunSuccess || recentWorkflowSuccess ? "ok" : "pending";
  } else if (authoritativeWorkflowFailure || authoritativeRunFailure) {
    status = "fail";
  } else if (recentWorkflowSuccess || recentRunSuccess) {
    status = "ok";
  } else if (delay === null) {
    status = workflowSourceStatus === "error" ? "warn" : "pending";
  } else if (delay > 45) {
    status = "fail";
  } else if (delay > 25) {
    status = "warn";
  } else if (runStatusToken && !runSuccess && !runFailure && !workflowSuccess) {
    status = "warn";
  }

  return {
    status,
    delay,
    runDelay,
    workflowDelay,
    emptyScan,
    runSuccess,
    runFailure,
    workflowRunning,
    workflowSuccess,
    workflowFailure,
    authoritativeRunFailure,
    authoritativeWorkflowFailure,
  };
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMinutes(timestamp, now) {
  if (timestamp === null || timestamp === undefined) return null;
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 60000));
}
