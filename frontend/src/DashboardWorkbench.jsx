import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, ExternalLink, X } from "lucide-react";
import { displayHeadline, resolvePublisher } from "./publisherIdentity.js";
import { formatDashboardCompositionShare } from "./dashboardRisk.js";
import { dashboardSeries, latestDeliveryLabel, reportSlotPresentation } from "./dashboardPresentation.js";
import slackMarkUrl from "./assets/slack-mark.png";

export function DashboardDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="desk-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-label={title}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="닫기" title="닫기"><X /></button></header>
    {children}
  </dialog>;
}

export function DashboardOperationsStrip({ watchHealth, notificationHealth, reportHealth, cadence, onOpenHistory }) {
  const slots = reportSlotPresentation(reportHealth);
  const completed = slots.filter((slot) => slot.status === "ok").length;
  return <section className="desk-operations" aria-label="운영 현황">
    <span className="desk-watch" title={watchHealth?.meta || "감시 상태 확인 중"}><i className={`desk-status-dot ${watchHealth?.status || "unknown"}`} /><b>감시 {watchHealth?.status === "ok" ? "정상" : watchHealth?.label || "확인 중"}</b><span>· {cadence}</span></span>
    <button type="button" className="desk-slack" onClick={onOpenHistory} aria-label="Slack 발송 이력 열기"><img src={slackMarkUrl} alt="Slack" /><b className={`desk-health ${notificationHealth?.status || "unknown"}`}>Slack {notificationHealth?.status === "ok" ? "정상" : notificationHealth?.label || "확인 중"}</b><span>· 최근 {latestDeliveryLabel(notificationHealth)}</span></button>
    <span className="desk-report-status"><CalendarDays /><b>일일 보고서</b><strong>{completed}/3 완료</strong></span>
    <span className="desk-slots">{slots.map((slot) => <span key={slot.slot}><time>{slot.slot}:00</time><b className={`desk-health ${slot.status}`}>{slot.status === "ok" ? "완료" : slot.state || "확인 중"}</b></span>)}</span>
    <button type="button" className="desk-history" onClick={onOpenHistory}>이력 보기<ChevronRight /></button>
  </section>;
}

export function DashboardAnalysis({ rows, compositionRows, Chart, categoryLabel }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latest = rows.at(-1) || {};
  const previous = rows.at(-2) || {};
  const categories = compositionRows.map((item) => ({ ...item, name: categoryLabel(item.name) }));
  const total = categories.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return <section className="desk-analysis" aria-label="기사 흐름과 분포">
    <section className="desk-momentum">
      <header className="desk-section-heading"><h2>최근 7일 기사 흐름</h2><button type="button" onClick={() => setDetailsOpen(true)} title="오늘과 전일의 분류별 기사 건수 비교">현황<ChevronRight /></button></header>
      <div className="desk-chart-legend">{dashboardSeries.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      <div className="desk-chart">{rows.length ? <Chart rows={rows} series={dashboardSeries} /> : <p className="desk-empty">집계 가능한 기사 데이터가 없습니다.</p>}</div>
    </section>
    <section className="desk-distribution">
      <header className="desk-section-heading"><h2>당일 기사 분포</h2><span>{total.toLocaleString("ko-KR")}건</span></header>
      <table><caption className="sr-only">당일 분류별 기사 수와 비중</caption><thead><tr><th>분류</th><th>기사 수</th><th>비중</th><th><span className="sr-only">비율 막대</span></th></tr></thead>
        <tbody>{categories.map((item) => {
          const color = dashboardSeries.find((series) => series.label === item.name)?.color || "#77839b";
          const share = formatDashboardCompositionShare(item.value, total || 1);
          return <tr key={item.name}><th scope="row"><i style={{ background: color }} />{item.name}</th><td>{item.value.toLocaleString("ko-KR")}건</td><td>{share}</td><td><span className="desk-bar"><i style={{ background: color, width: `${total ? item.value / total * 100 : 0}%` }} /></span></td></tr>;
        })}</tbody><tfoot><tr><th scope="row">전체</th><td>{total.toLocaleString("ko-KR")}건</td><td>{total ? "100%" : "0%"}</td><td><span className="desk-bar"><i style={{ width: total ? "100%" : "0%" }} /></span></td></tr></tfoot>
      </table>
    </section>
    {detailsOpen && <DashboardDialog title={`${latest.dateLabel || "오늘"} 분류별 현황`} onClose={() => setDetailsOpen(false)}>
      <table className="desk-delta-table"><thead><tr><th>구분</th><th>오늘</th><th>전일 대비</th></tr></thead><tbody>{dashboardSeries.map((item) => {
        const count = Number(latest[item.key] || 0);
        const delta = count - Number(previous[item.key] || 0);
        return <tr key={item.key}><th scope="row">{item.label}</th><td>{count}건</td><td>{delta ? `${delta > 0 ? "증가" : "감소"} ${Math.abs(delta)}건` : "변동 없음"}</td></tr>;
      })}</tbody></table>
    </DashboardDialog>}
  </section>;
}

export function DashboardPriorityTable({ rows, sort, onSort, Action, onOpenMonitoring, categoryLabel, timeLabel, riskScore }) {
  return <section className="desk-priority" aria-label="우선 이슈">
    <header className="desk-section-heading"><h2>우선 이슈 {rows.length === 5 ? "TOP 5" : `${rows.length}건`}</h2><select aria-label="우선 이슈 정렬 및 보기" value={sort} onChange={(event) => onSort(event.target.value)}>
      <option value="risk">정렬: 리스크순</option><option value="latest">정렬: 최신순</option><option value="own">보기: 당사 직접 언급만</option><option value="spread">정렬: 확산순</option>
    </select></header>
    <div className="desk-priority-table-wrap"><table><caption className="sr-only">우선 확인 기사 목록</caption><colgroup><col className="desk-col-rank"/><col className="desk-col-tone"/><col className="desk-col-category"/><col/><col className="desk-col-publisher"/><col className="desk-col-time"/></colgroup>
      <thead><tr><th>순위</th><th>상태</th><th>분류</th><th>기사 제목</th><th>언론사</th><th>작성 시간</th></tr></thead>
      <tbody>{rows.map((issue, index) => <tr key={issue.id || `${issue.source}-${issue.title}`} data-tone={issue.tone || "중립"}>
        <td className="desk-rank">{String(index + 1).padStart(2, "0")}</td>
        <td><span className="desk-tone" title={`리스크 ${riskScore(issue)}점`}>{issue.tone || "중립"}</span></td>
        <td className="desk-category">{categoryLabel(issue.category)}</td>
        <td className="desk-headline"><Action issue={issue} onOpenMonitoring={onOpenMonitoring}><span>{displayHeadline(issue)}</span><ExternalLink aria-hidden="true" /></Action></td>
        <td className="desk-publisher">{resolvePublisher(issue)}</td><td className="desk-time">{timeLabel(issue)}</td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="desk-empty">{sort === "own" ? "오늘 수집 기사 중 당사 직접 언급 기사가 없습니다." : "오늘 기준으로 표시할 주요 이슈가 없습니다."}</p>}
  </section>;
}
