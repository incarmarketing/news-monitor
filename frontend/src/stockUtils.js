export function stockToneClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "flat";
  return number > 0 ? "up" : "down";
}

export function formatStockPrice(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "-";
  return `${number.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatStockPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

export function formatSignedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
}

export function formatStockVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}백만`;
  if (number >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만`;
  return number.toLocaleString("ko-KR");
}

export function formatStockTradingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}억원`;
  if (number >= 1000000) return `${Math.round(number / 1000000).toLocaleString("ko-KR")}백만원`;
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

export function formatStockMarketCap(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number >= 1000000000000) return `${(number / 1000000000000).toFixed(2)}조`;
  if (number >= 100000000) return `${Math.round(number / 100000000).toLocaleString("ko-KR")}억`;
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

export function formatStockShares(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}억주`;
  if (number >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만주`;
  return `${Math.round(number).toLocaleString("ko-KR")}주`;
}

export function formatStockTimestamp(value, fallback = "") {
  if (!value) return fallback || "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || String(value).slice(0, 16);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function formatStockDate(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text.length >= 10 ? text.slice(5, 10) : text;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function safeNumberDiff(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return null;
  return Number((leftNumber - rightNumber).toFixed(2));
}

export function normalizeStockHistory(rows = []) {
  return rows
    .map((row) => {
      const date = String(row.date || row.trading_date || row.base_date || "").slice(0, 10);
      const close = Number(row.close ?? row.price);
      const high = Number(row.high ?? row.close ?? row.price);
      const low = Number(row.low ?? row.close ?? row.price);
      return {
        ...row,
        date,
        close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function getStockHistoryBounds(history = []) {
  if (!history.length) return { count: 0, start: "", end: "" };
  return {
    count: history.length,
    start: history[0].date,
    end: history[history.length - 1].date,
  };
}

export function stockRangeForPeriod(stock = {}, key = "20d", count = 20, start = "", end = "", fallbackKey = "") {
  const history = normalizeStockHistory(stock.history || []);
  if (history.length) {
    const range = key === "date-range"
      ? calculateStockRangeFromHistory(history, { start, end })
      : calculateStockRangeFromHistory(history, { count });
    if (Number.isFinite(Number(range.end_price))) {
      return range;
    }
  }

  const endPrice = Number(stock.regular_market?.price ?? stock.latest?.price ?? stock.nxt_market?.price);
  const selectedReturn = stockReturnForPeriod(stock, key, count, start, end, fallbackKey);
  const startPrice = Number.isFinite(endPrice) && Number.isFinite(Number(selectedReturn))
    ? Number((endPrice / (1 + (Number(selectedReturn) / 100))).toFixed(2))
    : null;
  return {
    start_price: startPrice,
    end_price: Number.isFinite(endPrice) ? endPrice : null,
    return: selectedReturn,
    drawdown_from_high: stock.range?.drawdown_from_60d_high ?? null,
  };
}

export function buildStockRangeSelection({ stockRange, customRangeDays, dateRangeDraft, company = {}, rangeWindows = {}, history = [] }) {
  const presetDays = {
    "5d": 5,
    "20d": 20,
    "60d": 60,
    "120d": 120,
  };
  if (stockRange === "custom") {
    const count = Math.max(1, Math.min(Number(customRangeDays) || 1, history.length || 240));
    const range = calculateStockRangeFromHistory(history, { count });
    const returnKey = nearestStockReturnKey(count);
    return {
      key: `custom-${count}d`,
      returnKey,
      label: `${count}거래일`,
      count,
      range,
    };
  }
  if (stockRange === "dates") {
    const start = dateRangeDraft?.start || "";
    const end = dateRangeDraft?.end || "";
    const range = calculateStockRangeFromHistory(history, { start, end });
    const count = range.count || history.length || 60;
    const rangeLabel = start || end
      ? `${formatStockDate(range.start_date || start)}~${formatStockDate(range.end_date || end)}`
      : "전체 수집기간";
    return {
      key: "date-range",
      returnKey: nearestStockReturnKey(count),
      label: rangeLabel,
      count,
      range,
    };
  }
  const count = presetDays[stockRange] || 60;
  const returnKey = stockRange || nearestStockReturnKey(count);
  const calculated = calculateStockRangeFromHistory(history, { count });
  const range = {
    ...calculated,
    ...(rangeWindows[returnKey] || {}),
  };
  if (range.return === undefined && company.returns?.[returnKey] !== undefined) {
    range.return = company.returns[returnKey];
  }
  return {
    key: returnKey,
    returnKey,
    label: `${count}거래일`,
    count,
    range,
  };
}

export function averagePeerReturnByPeriod(peerGroups = [], key = "20d", count = 20, start = "", end = "", fallbackKey = "") {
  const values = peerGroups
    .flatMap((group) => group.stocks || [])
    .map((stock) => stockReturnForPeriod(stock, key, count, start, end, fallbackKey))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function indexReturnByPeriod(indices = [], code = "KOSPI", key = "20d", count = 20, start = "", end = "", fallbackKey = "") {
  const row = indices.find((item) => String(item.code || "").toUpperCase() === code);
  const history = normalizeStockHistory(row?.history || []);
  if (history.length) {
    const range = key === "date-range"
      ? calculateStockRangeFromHistory(history, { start, end })
      : calculateStockRangeFromHistory(history, { count });
    if (Number.isFinite(Number(range.return))) return range.return;
  }
  const value = Number(row?.returns?.[key]);
  if (Number.isFinite(value)) return value;
  const fallback = Number(row?.returns?.[fallbackKey || nearestStockReturnKey(count)]);
  return Number.isFinite(fallback) ? fallback : null;
}

export function sliceStockTrend(rows = [], rangeKey = "60d") {
  const count = typeof rangeKey === "number" ? rangeKey : Number(String(rangeKey).replace(/[^\d]/g, ""));
  if (!count || rows.length <= count) return rows;
  return rows.slice(-count);
}

export function formatMarketStatus(value) {
  const text = String(value || "").toUpperCase();
  if (text === "OPEN") return "장중";
  if (text === "CLOSE" || text === "CLOSED") return "마감";
  if (text === "PREOPEN") return "개장 전";
  if (!text) return "상태 확인";
  return text;
}

export function formatIndexPoint(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toFixed(2)}pt`;
}

export function stockSeriesLabel(name) {
  return {
    company: "인카금융서비스",
    peer: "동종 평균",
    kospi: "KOSPI",
  }[name] || name;
}

function percentDiff(current, base) {
  const currentNumber = Number(current);
  const baseNumber = Number(base);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(baseNumber) || baseNumber === 0) return null;
  return Number((((currentNumber - baseNumber) / baseNumber) * 100).toFixed(2));
}

function nearestStockReturnKey(count = 20) {
  const days = Number(count);
  if (!Number.isFinite(days)) return "20d";
  if (days <= 5) return "5d";
  if (days <= 20) return "20d";
  if (days <= 60) return "60d";
  return "120d";
}

function stockReturnForPeriod(stock = {}, key = "20d", count = 20, start = "", end = "", fallbackKey = "") {
  const history = normalizeStockHistory(stock.history || []);
  const shouldCalculateFromHistory = key === "date-range" || String(key).startsWith("custom-") || !Number.isFinite(Number(stock.returns?.[key]));
  if (history.length && shouldCalculateFromHistory) {
    const range = key === "date-range"
      ? calculateStockRangeFromHistory(history, { start, end })
      : calculateStockRangeFromHistory(history, { count });
    if (Number.isFinite(Number(range.return))) return range.return;
  }
  const exact = Number(stock.returns?.[key]);
  if (Number.isFinite(exact)) return exact;
  const periodKey = fallbackKey || nearestStockReturnKey(count);
  const fallback = Number(stock.returns?.[periodKey]);
  return Number.isFinite(fallback) ? fallback : null;
}

function calculateStockRangeFromHistory(history = [], { count, start, end } = {}) {
  const rows = normalizeStockHistory(history);
  if (!rows.length) return {};
  let selectedRows = rows;
  if (start || end) {
    selectedRows = rows.filter((row) => (!start || row.date >= start) && (!end || row.date <= end));
  } else if (count) {
    selectedRows = rows.slice(-Math.max(1, Number(count)));
  }
  if (!selectedRows.length) selectedRows = rows.slice(-Math.max(1, Number(count) || rows.length));
  const first = selectedRows[0];
  const last = selectedRows[selectedRows.length - 1];
  const highRow = selectedRows.reduce((winner, row) => (Number(row.high) > Number(winner.high) ? row : winner), selectedRows[0]);
  const lowRow = selectedRows.reduce((winner, row) => (Number(row.low) < Number(winner.low) ? row : winner), selectedRows[0]);
  return {
    count: selectedRows.length,
    start_date: first.date,
    end_date: last.date,
    start_price: first.close,
    end_price: last.close,
    return: percentDiff(last.close, first.close),
    high: highRow.high,
    high_date: highRow.date,
    low: lowRow.low,
    low_date: lowRow.date,
    drawdown_from_high: percentDiff(last.close, highRow.high),
    rebound_from_low: percentDiff(last.close, lowRow.low),
  };
}
