export function chartGeometry(rows = [], series = [], width = 480, height = 220, compact = false) {
  const padding = { left: compact ? 32 : 46, right: 20, top: 18, bottom: 32 };
  const values = rows.flatMap(row => series.map(item => Number(row[item.key])).filter(Number.isFinite));
  const max = Math.max(1, ...values);
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(Math.max(1, rough)));
  const normal = rough / power;
  const step = Math.max(1, (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * power);
  const ceiling = Math.max(step, Math.ceil(max / step) * step);
  return {
    padding,
    ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step),
    x: index => padding.left + index * Math.max(1, width - padding.left - padding.right) / Math.max(1, rows.length - 1),
    y: value => padding.top + (1 - Number(value || 0) / ceiling) * Math.max(1, height - padding.top - padding.bottom),
  };
}

export function chartPointLabel(row, item) {
  return `${row.date || row.dateLabel || ""} · ${item.label} · ${Number(row[item.key] || 0).toLocaleString("ko-KR")}${item.unit || "건"}`;
}

export function chartLabelIndexes(count, plotWidth, compact = false) {
  if (count <= 1) return count ? [0] : [];
  const minimumGap = compact ? 42 : 64;
  const step = Math.max(1, Math.ceil((count - 1) * minimumGap / Math.max(1, plotWidth)));
  const indexes = [0];
  for (let index = step; index < count - 1; index += step) {
    if ((count - 1 - index) * plotWidth / (count - 1) >= minimumGap) indexes.push(index);
  }
  indexes.push(count - 1);
  return indexes;
}
