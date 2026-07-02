import React from "react";

const reportChartColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];

export function A4MetricTable({ stats = [], onOpenMonitoring }) {
  return (
    <div className="a4-metric-table" aria-label="report metrics">
      {stats.map((item) => (
        <button key={item.label} type="button" className={item.tone || ""} onClick={() => onOpenMonitoring?.(item.preset || {})}>
          <span>{item.label}</span>
          <b>{item.value}</b>
        </button>
      ))}
    </div>
  );
}

export function A4Panel({ title, meta, children }) {
  return (
    <section className="a4-panel">
      <div className="a4-panel-head">
        <b>{title}</b>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function A4BarList({ rows = [] }) {
  const visibleRows = rows.filter((row) => Number(row.value || 0) > 0).slice(0, 8);
  const max = Math.max(1, ...visibleRows.map((row) => Number(row.value || 0)));
  if (!visibleRows.length) return <p className="a4-empty">표시할 기사량 데이터가 없습니다.</p>;
  return (
    <div className="a4-bar-list">
      {visibleRows.map((row, index) => (
        <div key={row.keyword || row.name}>
          <span>{row.name}</span>
          <b>
            <i style={{ width: `${Math.max(5, (Number(row.value || 0) / max) * 100)}%`, background: reportChartColors[index % reportChartColors.length] }} />
          </b>
          <em>{Number(row.value || 0).toLocaleString("ko-KR")}건</em>
        </div>
      ))}
    </div>
  );
}

export function A4PressRows({ rows = [], onOpenMonitoring }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.total || 0)));
  if (!rows.length) return <p className="a4-empty">언론사 보도량 데이터가 없습니다.</p>;
  return (
    <div className="a4-press-rows">
      {rows.map((row) => (
        <button key={row.source} type="button" onClick={() => onOpenMonitoring?.({ source: row.source })}>
          <span>{row.source}</span>
          <b>
            <i style={{ width: `${Math.max(8, (Number(row.total || 0) / max) * 100)}%` }} />
          </b>
          <em>{Number(row.total || 0).toLocaleString("ko-KR")}건</em>
        </button>
      ))}
    </div>
  );
}
