export const STATUS_POLL_MS = 60_000;
const FALLBACK_POLL_MS = 5 * 60_000;
const topicFields = {
  notification_sends: "notifications", negative_watch_runs: "watchRuns",
  report_runs: "reportRuns", job_runs: "jobRuns",
};

export function kstPollingDay(now) {
  return new Date(now + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

// Acknowledge only successfully loaded topics. Failed/partial reads are retried,
// while unchanged article arrays retain their identity and expensive derived caches.
export function createOperationalPoller({ readChanges, readCore, onCore, onStatus, onError,
  now = Date.now, visible = () => true, schedule = setTimeout, cancel = clearTimeout }) {
  let revisions = {};
  let day = "";
  let lastCoreAttempt = -Infinity;
  let failures = 0;
  let pending = null;
  let timer = null;
  let stopped = false;
  const check = ({ forceCore = false } = {}) => {
    if (stopped) return Promise.resolve({});
    if (pending) return pending;
    pending = (async () => {
      let changes;
      let snapshot;
      try {
        changes = await readChanges(revisions);
        if (stopped) return {};
        const warnings = changes.warnings || [];
        for (const [topic, field] of Object.entries(topicFields)) {
          if (Object.hasOwn(changes.patch, field) && !(topic === "job_runs" && warnings.includes("watch_job_unavailable"))) {
            revisions[topic] = changes.revisions[topic];
          }
        }
        onStatus(changes.patch, changes.watchJob, warnings);
        failures = 0;
      } catch {
        failures += 1;
        if (!stopped) onError();
      }
      const currentDay = kstPollingDay(now());
      const changed = changes && revisions.news_articles !== changes.revisions.news_articles;
      const fallbackDue = !changes && now() - lastCoreAttempt >= FALLBACK_POLL_MS;
      if (!stopped && (forceCore || changed || currentDay !== day || fallbackDue)) {
        lastCoreAttempt = now();
        snapshot = await readCore();
        if (stopped) return {};
        onCore(snapshot);
        day = currentDay;
        // A static fallback is useful, but it cannot acknowledge a newer DB revision.
        if (snapshot?.source === "supabase" && snapshot?.status === "live") {
          if (changes) revisions.news_articles = changes.revisions.news_articles;
        }
      }
      return { snapshot, coreUpdated: Boolean(snapshot), changes };
    })().catch(() => { if (!stopped) { failures += 1; onError(); } return {}; })
      .finally(() => { pending = null; });
    return pending;
  };
  const arm = () => {
    if (stopped) return;
    if (timer !== null) cancel(timer);
    timer = schedule(async () => {
      timer = null;
      if (visible()) await check();
      arm();
    }, Math.min(FALLBACK_POLL_MS, STATUS_POLL_MS * Math.max(1, failures)));
  };
  return {
    check,
    async start() { if (visible()) await check({ forceCore: true }); arm(); },
    async resume() { if (!stopped && visible()) { await check(); arm(); } },
    stop() { stopped = true; if (timer !== null) cancel(timer); },
  };
}
