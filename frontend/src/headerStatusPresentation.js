const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function headerDataStatus(operations = {}) {
  const live = operations.status === "live" && operations.source === "supabase"
    && !operations.degraded && !operations.statusReadFailed && !operations.dataLoadWarnings?.length;
  const pending = !operations.status || operations.status === "loading";
  const state = live ? "ok" : pending ? "pending" : "error";
  const label = live ? "데이터 연결 정상" : pending ? "데이터 상태 확인 중"
    : operations.status === "live" ? "저장본 또는 일부 연결 확인 필요" : "데이터 연결 확인 필요";
  const raw = String(operations.articlesGeneratedAt || operations.generatedAt || "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const hasTime = /[T ]\d{2}:\d{2}/.test(raw);
  const qualified = hasTime && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? `${raw.replace(" ", "T")}+09:00` : raw;
  const date = new Date(qualified);
  if (!raw || !Number.isFinite(date.getTime()) || (!dateOnly && !hasTime)) {
    return { state, label, dateLabel: "--.--", timeLabel: "--:--", timeTitle: "기사 데이터 기준 시각 미확인", dateTime: undefined };
  }
  const parts = Object.fromEntries(clockFormatter.formatToParts(date).map(part => [part.type, part.value]));
  const dateLabel = `${parts.month}.${parts.day}`;
  const timeLabel = hasTime ? `${parts.hour}:${parts.minute}` : "--:--";
  return {
    state, label, dateLabel, timeLabel,
    timeTitle: `${parts.year}.${dateLabel} ${hasTime ? `${timeLabel} 기준` : "시각 미확인"}`,
    dateTime: dateOnly ? raw : date.toISOString(),
  };
}
