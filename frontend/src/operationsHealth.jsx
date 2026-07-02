import { Bell, CalendarDays, Radar, RefreshCw, ShieldCheck } from "lucide-react";

export const NEGATIVE_WATCH_CADENCE_LABEL = "24시간 · 10분";
export const NEGATIVE_WATCH_SHORT_LABEL = "10분 주기";

export function HealthStatusPill({ status = "unknown", label }) {
  return <strong className={`health-pill ${status}`}>{label || healthStatusLabel(status)}</strong>;
}

export function buildOperationsHealth({ operations, notifications, watchRuns, reportRuns, jobRuns, workflowHealth }) {
  const items = [
    buildWatchHealth(watchRuns, workflowHealth),
    buildDailyReportHealth(notifications, reportRuns, jobRuns),
    buildNotificationHealth(notifications),
    buildWorkflowActionsHealth(workflowHealth),
    buildHistorySourceHealth(operations, notifications, watchRuns, reportRuns, jobRuns),
  ];
  const status = items.some((item) => item.status === "fail")
    ? "fail"
    : items.some((item) => item.status === "warn")
      ? "warn"
      : items.every((item) => item.status === "pending")
        ? "pending"
        : "ok";
  const problemCount = items.filter((item) => ["fail", "warn"].includes(item.status)).length;
  const headline = status === "fail"
    ? `${problemCount}개 운영 항목 확인 필요`
    : status === "warn"
      ? `${problemCount}개 항목 주의 관찰`
      : "감시·보고서·알림 이력이 정상 범위입니다.";
  return { status, label: healthStatusLabel(status), headline, items };
}

function buildWatchHealth(watchRuns = [], workflowHealth = {}) {
  const latestRun = watchRuns[0] || {};
  const workflow = findWorkflowHealth(workflowHealth, "negative-watch.yml");
  const latestWorkflow = workflow?.latest || null;
  const latestAt = latestWorkflow?.updatedAt || latestWorkflow?.createdAt || latestRun.scannedAt || "";
  const latestRunDelay = minutesSince(latestRun.scannedAt);
  const delay = minutesSince(latestAt);
  const failedWorkflow = latestWorkflow && ["failure", "timed_out", "action_required"].includes(latestWorkflow.conclusion);
  const runStatus = String(latestRun.rawStatus || "").toLowerCase();
  const runMessage = String(latestRun.message || "").toLowerCase();
  const normalEmptyScan = runMessage.includes("no new negative article");
  const recentSuccessfulScan = latestRunDelay !== null
    && latestRunDelay <= 25
    && (normalEmptyScan || ["ok", "success", "completed", "scanned", "alert_sent"].includes(runStatus));
  const failedRun = runStatus && !["ok", "success", "completed", "scanned", "alert_sent"].includes(runStatus) && !normalEmptyScan;
  let status = "ok";
  if ((failedWorkflow && !recentSuccessfulScan) || failedRun) status = "fail";
  else if (delay === null) status = workflow?.status === "error" ? "warn" : "pending";
  else if (delay > 45) status = "fail";
  else if (delay > 25) status = "warn";
  const detail = failedRun && latestRun.message
    ? `최근 감시 실패: ${latestRun.message}`
    : normalEmptyScan || runMessage.includes("no new negative article")
      ? "신규 부정기사 없음"
      : delay === null
        ? "최근 실행 확인 대기"
        : `${formatRelativeMinutes(delay)} 전 실행`;
  const workflowText = latestWorkflow?.status === "in_progress" ? "실행 중" : formatWorkflowConclusion(latestWorkflow);
  const scope = latestRun.minutesBack ? `검사 ${latestRun.minutesBack}분` : "검사 10분";
  return {
    title: "부정기사 감시",
    icon: Radar,
    status,
    label: healthStatusLabel(status),
    detail,
    meta: `${scope} · 신규 ${Number(latestRun.fresh || 0).toLocaleString("ko-KR")}건 · ${workflowText}`,
  };
}

function buildDailyReportHealth(notifications = [], reportRuns = [], jobRuns = []) {
  const today = kstDateKey(new Date());
  const currentMinute = kstMinuteOfDay(new Date());
  const slots = ["08", "13", "18"].map((slot) => {
    const dueMinute = Number(slot) * 60 + 15;
    const due = currentMinute >= dueMinute;
    const notificationOk = notifications.some((item) => isDailyReportNotificationForSlot(item, today, slot));
    const reportOk = reportRuns.some((row) => isReportRunForSlot(row, today, slot));
    const jobOk = jobRuns.some((row) => isDailyReportJobForSlot(row, today, slot));
    const generatedOk = reportOk || jobOk;
    let state = "예정";
    let status = "pending";
    if (due && generatedOk && notificationOk) {
      state = "발송완료";
      status = "ok";
    } else if (due && generatedOk) {
      state = "생성완료";
      status = "ok";
    } else if (due && notificationOk) {
      state = "발송기록";
      status = "warn";
    } else if (due) {
      state = "미확인";
      status = "fail";
    }
    return { slot, state, status, notificationOk, reportOk, jobOk, generatedOk, due };
  });
  const status = worstHealthStatus(slots.filter((slot) => slot.due).map((slot) => slot.status));
  const dueCount = slots.filter((slot) => slot.due).length;
  const sentCount = slots.filter((slot) => slot.notificationOk).length;
  const generatedCount = slots.filter((slot) => slot.generatedOk).length;
  const completedDueCount = slots.filter((slot) => slot.due && slot.generatedOk).length;
  const totalSlots = slots.length;
  const progress = dueCount
    ? `도래 ${dueCount}회 중 생성 ${completedDueCount}회 · 슬랙기록 ${sentCount}회`
    : generatedCount
      ? `오늘 생성 확인 ${generatedCount}회`
      : "첫 발송 전";
  const statusLabel = dueCount ? status : generatedCount ? "ok" : "pending";
  return {
    title: "일일보고서",
    icon: CalendarDays,
    status: statusLabel,
    label: dueCount ? healthStatusLabel(status) : generatedCount ? "정상" : "대기",
    detail: `오늘 ${totalSlots}회 중 생성 ${generatedCount}회`,
    progress,
    slots,
    meta: `슬랙기록 ${sentCount}회 · 보고서 ${generatedCount}회`,
  };
}

function buildNotificationHealth(notifications = []) {
  const slackRows = notifications.filter((item) => !item.channel || String(item.channel).toLowerCase() === "slack");
  const recent = slackRows.filter((item) => {
    const minutes = minutesSince(item.sentAt);
    return minutes !== null && minutes <= 24 * 60;
  });
  const scoped = latestNotificationRowsByKey(recent.length ? recent : slackRows.slice(0, 12));
  const failed = scoped.filter((item) => !isNotificationSuccess(item));
  const latest = slackRows[0];
  const latestAge = latest ? minutesSince(latest.sentAt) : null;
  const latestScoped = scoped[0] || latest;
  const latestSuccess = latest && isNotificationSuccess(latest);
  const latestFailed = latestScoped && !isNotificationSuccess(latestScoped);
  const status = !scoped.length ? "warn" : latestSuccess ? "ok" : latestFailed ? "fail" : latestAge !== null && latestAge > 24 * 60 ? "warn" : "ok";
  const detail = !scoped.length
    ? "슬랙 발송 이력 없음"
    : latestSuccess
      ? failed.length ? `최근 발송 정상 · 이전 실패 ${failed.length}` : "최근 발송 정상"
      : latestFailed
        ? `최근 발송 실패${failed.length > 1 ? ` · 실패 ${failed.length}` : ""}`
        : "최근 발송 정상";
  return {
    title: "슬랙",
    icon: Bell,
    status,
    label: healthStatusLabel(status),
    detail,
    meta: latest ? `최신 ${latest.time} · ${latest.type}` : "슬랙 기록 확인 필요",
  };
}

function latestNotificationRowsByKey(rows = []) {
  const sorted = [...rows].sort((a, b) => (parseTimestamp(b.sentAt)?.getTime() || 0) - (parseTimestamp(a.sentAt)?.getTime() || 0));
  const seen = new Set();
  const result = [];
  sorted.forEach((item) => {
    const key = notificationLogicalKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function notificationLogicalKey(item = {}) {
  const dedupe = String(item.dedupeKey || "").trim();
  if (dedupe) return dedupe.replace(/:(?:success|sent|failed|failure|error)$/i, "");
  const slotKey = notificationSlotKey(item);
  if (slotKey) return slotKey;
  const title = String(item.rawTitle || item.type || item.messageType || "slack").replace(/\s+/g, " ").trim();
  return `${String(item.channel || "slack").toLowerCase()}:${String(item.messageType || "").toLowerCase()}:${title}`;
}

function buildWorkflowActionsHealth(workflowHealth = {}) {
  const workflows = Array.isArray(workflowHealth.workflows) ? workflowHealth.workflows : [];
  if (workflowHealth.status === "loading") {
    return {
      title: "GitHub Actions",
      icon: RefreshCw,
      status: "pending",
      label: "확인 중",
      detail: "워크플로우 상태 확인 중",
      meta: "공개 GitHub 실행 이력 조회",
    };
  }
  if (!workflows.length) {
    return {
      title: "GitHub Actions",
      icon: RefreshCw,
      status: "warn",
      label: "확인",
      detail: "워크플로우 이력 연결 대기",
      meta: workflowHealth.status === "error" ? "GitHub API 응답 확인 필요" : "최근 실행 없음",
    };
  }
  const latestFailures = workflows.filter((item) => item.latest && ["failure", "timed_out", "action_required"].includes(item.latest.conclusion));
  const latestWarnings = workflows.filter((item) => item.status === "error" || item.latest?.conclusion === "cancelled");
  const running = workflows.filter((item) => item.latest?.status === "in_progress" || item.latest?.status === "queued").length;
  const status = latestFailures.length ? "fail" : latestWarnings.length ? "warn" : "ok";
  const recoveredFailures = workflows.reduce((sum, item) => sum + Number(item.previousFailures || 0), 0);
  return {
    title: "GitHub Actions",
    icon: RefreshCw,
    status,
    label: healthStatusLabel(status),
    detail: latestFailures.length ? `최근 실패 ${latestFailures.length}개` : running ? `실행 중 ${running}개` : "주요 워크플로우 정상",
    meta: recoveredFailures ? `최근 목록 내 복구된 실패 ${recoveredFailures}건` : workflows.map((item) => formatWorkflowConclusion(item.latest)).join(" · "),
  };
}

function buildHistorySourceHealth(operations = {}, notifications = [], watchRuns = [], reportRuns = [], jobRuns = []) {
  const slackRows = notifications.filter((item) => !item.channel || String(item.channel).toLowerCase() === "slack");
  const reportRecords = reportRuns.length + jobRuns.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return row.jobType && ["success", "ok", "completed"].includes(status);
  }).length;
  const missing = [];
  if (!slackRows.length) missing.push("슬랙");
  if (!watchRuns.length) missing.push("감시");
  if (!reportRecords) missing.push("보고");
  const status = operations?.status === "error"
    ? "fail"
    : missing.includes("감시") || missing.includes("보고")
      ? "fail"
      : missing.length
        ? "warn"
        : "ok";
  const source = operations?.source === "supabase" ? "DB 직접 연결" : "정적 배포 이력";
  return {
    title: "Supabase 기록",
    icon: ShieldCheck,
    status,
    label: healthStatusLabel(status),
    detail: missing.length ? `${missing.join("·")} 기록 확인 필요` : `${source} 정상 반영`,
    meta: `슬랙 ${slackRows.length} · 감시 ${watchRuns.length} · 보고 ${reportRecords}`,
  };
}

function findWorkflowHealth(workflowHealth = {}, id) {
  return (workflowHealth.workflows || []).find((item) => item.id === id);
}

function worstHealthStatus(statuses = []) {
  const weights = { fail: 4, warn: 3, pending: 2, unknown: 1, ok: 0 };
  if (!statuses.length) return "pending";
  return statuses.reduce((worst, status) => (weights[status] > weights[worst] ? status : worst), "ok");
}

function healthStatusLabel(status) {
  return {
    ok: "정상",
    warn: "주의",
    fail: "실패",
    pending: "대기",
    unknown: "확인",
  }[status] || "확인";
}

function minutesSince(value) {
  const date = parseTimestamp(value);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeMinutes(minutes) {
  if (minutes === null || minutes === undefined) return "-";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function kstDateKey(value) {
  const date = parseTimestamp(value) || new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstMinuteOfDay(value) {
  const date = parseTimestamp(value) || new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function kstHour(value) {
  const date = parseTimestamp(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return parts.find((part) => part.type === "hour")?.value || "";
}

function isDailyReportNotificationForSlot(item = {}, dateKey, slot) {
  const text = `${item.rawTitle || item.type || ""} ${item.messageType || ""} ${item.body || ""} ${item.link || ""} ${item.dedupeKey || ""}`.toLowerCase();
  const isDaily = /daily_report|일일|언론 동향/.test(text);
  if (!isDaily) return false;
  const compact = text.replace(/\s+/g, " ");
  const shortDate = dateKey.slice(2);
  const titleHasSlot = compact.includes(`${dateKey} ${slot}`)
    || compact.includes(`${dateKey}-${slot}`)
    || compact.includes(`${shortDate} ${slot}`)
    || compact.includes(`${shortDate}-${slot}`)
    || compact.includes(`slot=${slot}`)
    || compact.includes(`report_slot=${slot}`)
    || compact.includes(`daily:${dateKey}:${slot}`);
  const sentMatchesSlot = item.sentAt && kstDateKey(item.sentAt) === dateKey && kstHour(item.sentAt) === slot;
  return isNotificationSuccess(item) && (titleHasSlot || sentMatchesSlot);
}

function notificationSlotKey(item = {}) {
  const text = `${item.rawTitle || ""} ${item.type || ""} ${item.messageType || ""} ${item.body || ""} ${item.link || ""} ${item.dedupeKey || ""}`;
  const isDaily = /daily_report|일일|언론 동향/.test(text);
  if (!isDaily) return "";
  const dateMatch = text.match(/(20\d{2})[-.](\d{2})[-.](\d{2})/);
  const slotMatch = text.match(/(?:slot|report_slot)[=:\s-]*(0?8|13|18)/i)
    || text.match(/(?:^|[\sT])((?:0?8)|13|18):[0-5]\d/)
    || text.match(/(?:^|[^0-9])((?:0?8)|13|18)\s*시/);
  const sentDate = item.sentAt ? kstDateKey(item.sentAt) : "";
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : sentDate;
  const slot = slotMatch ? slotMatch[1].padStart(2, "0") : (item.sentAt ? kstHour(item.sentAt) : "");
  if (!date || !["08", "13", "18"].includes(slot)) return "";
  return `daily:${date}:${slot}`;
}

function isReportRunForSlot(row = {}, dateKey, slot) {
  const rowDate = row.date || (row.timestamp ? kstDateKey(row.timestamp) : "");
  const rowSlot = String(row.slot || "");
  return rowDate === dateKey && (rowSlot.includes(slot) || kstHour(row.timestamp) === slot);
}

function isDailyReportJobForSlot(row = {}, dateKey, slot) {
  const status = String(row.status || "").toLowerCase();
  if (!["success", "ok", "completed"].includes(status)) return false;
  const jobType = String(row.jobType || row.job_type || row.runKey || row.run_key || "").toLowerCase();
  if (!jobType.includes("daily_report")) return false;
  const rowDate = row.date || (row.startedAt ? kstDateKey(row.startedAt) : "") || (row.finishedAt ? kstDateKey(row.finishedAt) : "");
  const rowSlot = String(row.slot || row.report_slot || "");
  const runKey = String(row.runKey || row.run_key || "");
  return rowDate === dateKey && (
    rowSlot.padStart(2, "0") === slot
    || runKey.includes(`daily_report:${dateKey}:${slot}`)
    || kstHour(row.finishedAt || row.startedAt) === slot
  );
}

function isNotificationSuccess(item = {}) {
  const text = `${item.status || ""} ${item.rawStatus || ""}`.toLowerCase();
  return text.includes("성공") || text.includes("success") || text.includes("sent");
}

function formatWorkflowConclusion(run) {
  if (!run) return "이력 없음";
  if (run.status === "queued") return "대기";
  if (run.status === "in_progress") return "진행 중";
  return {
    success: "성공",
    failure: "실패",
    cancelled: "취소",
    timed_out: "시간초과",
    action_required: "조치 필요",
  }[run.conclusion] || run.conclusion || run.status || "확인";
}
