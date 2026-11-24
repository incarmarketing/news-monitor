import React, { useEffect, useId, useRef, useState } from "react";
import { chartGeometry, chartPointLabel } from "./chartPresentation.js";
import { dashboardSeries } from "./dashboardPresentation.js";

export default function NewsroomChart({ rows = [], series = dashboardSeries, compact = false, ariaLabel = "기사량 추이" }) {
  const container = useRef(null);
  const tooltipId = useId();
  const [size, setSize] = useState({ width: compact ? 320 : 720, height: compact ? 160 : 260 });
  const [active, setActive] = useState(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActive(null), [rows, series]);
  const { width, height } = size;
  const { padding, ticks, x, y } = chartGeometry(rows, series, width, height, compact);
  const activeRow = active && rows[active.index];
  const activeSeries = active && series.find(item => item.key === active.key);
  const hasTooltip = activeRow && activeSeries;
  return <div className="newsroom-chart" ref={container} onKeyDown={event => { if (event.key === "Escape") setActive(null); }}>
    <svg className="dashboard-svg-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
      {ticks.map(tick => <g key={tick}>
        <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} className="dashboard-chart-grid" />
        <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="dashboard-chart-y-label">{tick.toLocaleString("ko-KR")}</text>
      </g>)}
      {series.map(item => <g key={item.key}>
        <polyline points={rows.map((row, index) => `${x(index)},${y(row[item.key])}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" />
        {rows.map((row, index) => <circle key={`${item.key}-${index}`} cx={x(index)} cy={y(row[item.key])}
          r={active?.index === index && active?.key === item.key ? 5 : 3.5} fill="var(--paper)" stroke={item.color} strokeWidth="2"
          tabIndex={index === 0 ? 0 : -1} role="img" aria-label={chartPointLabel(row, item)} aria-describedby={active?.index === index && active?.key === item.key ? tooltipId : undefined}
          onKeyDown={event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
            event.currentTarget.parentElement.querySelectorAll("circle")[next]?.focus();
          }}
          onMouseEnter={() => setActive({ index, key: item.key })} onMouseLeave={() => setActive(null)}
          onFocus={() => setActive({ index, key: item.key })} onBlur={() => setActive(null)} onPointerDown={() => setActive({ index, key: item.key })}>
          <title>{chartPointLabel(row, item)}</title>
        </circle>)}
      </g>)}
      {rows.map((row, index) => index % Math.max(1, Math.ceil(rows.length / Math.max(2, (width - padding.left - padding.right) / (compact ? 35 : 55)))) === 0 || index === rows.length - 1
        ? <text key={row.date || index} x={x(index)} y={height - 9} textAnchor="middle" className="dashboard-chart-label">{row.dateLabel || row.date || ""}</text> : null)}
    </svg>
    {hasTooltip && <div className="newsroom-chart-tooltip" id={tooltipId} role="tooltip"
      style={{ left: Math.max(8, Math.min(width - 205, x(active.index) - 95)), top: Math.max(0, y(activeRow[activeSeries.key]) - 68) }}>
      <time>{activeRow.date || activeRow.dateLabel}</time><strong><i style={{ background: activeSeries.color }} />{activeSeries.label} {Number(activeRow[activeSeries.key] || 0).toLocaleString("ko-KR")}{activeSeries.unit || "건"}</strong>
    </div>}
  </div>;
}
