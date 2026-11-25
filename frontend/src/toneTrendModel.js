export const toneChartSeries = [
  { key: "negative", label: "부정", color: "#b33739" },
  { key: "caution", label: "주의", color: "#ad6b28" },
  { key: "neutral", label: "중립", color: "#787b7c" },
  { key: "positive", label: "긍정", color: "#7b901c" },
].map(item => ({ ...item, series: [item] }));

export function tonePanelStats(rows, key) {
  return rows.reduce((result, row) => {
    const count = Math.max(0, Number(row[key]) || 0);
    return { total: result.total + count, days: result.days + (count > 0 ? 1 : 0) };
  }, { total: 0, days: 0 });
}
