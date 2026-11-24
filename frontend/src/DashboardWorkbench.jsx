import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, X } from "lucide-react";
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
  const WatchIcon = watchHealth?.status === "ok" ? CheckCircle2 : AlertCircle;
  return <section className="desk-operations" aria-label="운영 현황">
    <strong className="desk-operations-title">운영 현황</strong>
    <span className="desk-watch" title={watchHealth?.meta || "감시 상태 확인 중"}><WatchIcon className={`desk-health ${watchHealth?.status || "unknown"}`} /><b>감시 {watchHealth?.status === "ok" ? "정상" : watchHealth?.label || "확인 중"}</b><span>· {cadence}</span></span>
    <button type="button" className="desk-slack" onClick={onOpenHistory} aria-label="Slack 발송 이력 열기"><img src={slackMarkUrl} alt="Slack" /><b className={`desk-health ${notificationHealth?.status || "unknown"}`}>Slack {notificationHealth?.status === "ok" ? "" : notificationHealth?.label || "확인 중"}</b><span>최근 {latestDeliveryLabel(notificationHealth)}</span></button>
    <span className="desk-report-status sr-only"><CalendarDays /><b>일일 보고서</b><strong>{completed}/3 완료</strong></span>
    <span className="desk-slots">{slots.map((slot) => {
      const SlotIcon = slot.status === "ok" ? CheckCircle2 : slot.status === "error" ? AlertCircle : Clock3;
      return <span key={slot.slot}><SlotIcon className={`desk-health ${slot.status}`} /><time>{slot.slot}:00</time><b className={`desk-health ${slot.status}`}>{slot.status === "ok" ? "발송완료" : slot.state || "확인 중"}</b></span>;
    })}</span>
    <button type="button" className="desk-history" onClick={onOpenHistory} title="발송 이력 보기" aria-label="발송 이력 보기"><ChevronRight /></button>
  </section>;
}

export function DashboardAnalysis({ rows, compositionRows, Chart, categoryLabel }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latest = rows.at(-1) || {};
  const previous = rows.at(-2) || {};
  const categories = compositionRows.map((item) => ({ ...item, name: categoryLabel(item.name) }));
  const total = categories.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return <section className="desk-analysis" aria-label="기사 흐름과 분포">
    <header className="desk-section-heading"><h2>최근 7일 기사 흐름</h2><span>오늘 {total.toLocaleString("ko-KR")}건</span><button type="button" onClick={() => setDetailsOpen(true)} title="분류별 건수와 전일 대비 현황">현황<ChevronRight /></button></header>
    <div className="desk-small-multiples">{dashboardSeries.map(item => <section key={item.key} aria-label={`${item.label} 기사 흐름`}>
      <h3><i style={{ background: item.color }} />{item.label}<strong>{Number(latest[item.key] || 0).toLocaleString("ko-KR")}<small>건</small></strong></h3>
      <div className="desk-chart">{rows.length ? <Chart rows={rows} series={[item]} compact ariaLabel={`${item.label} 최근 7일 기사 수`} /> : <p className="desk-empty">집계 데이터가 없습니다.</p>}</div>
    </section>)}</div>
    {detailsOpen && <DashboardDialog title={`${latest.dateLabel || "오늘"} 분류별 현황`} onClose={() => setDetailsOpen(false)}>
      <table className="desk-delta-table"><thead><tr><th>구분</th><th>오늘</th><th>비중</th><th>전일 대비</th></tr></thead><tbody>{dashboardSeries.map((item) => {
        const count = Number(latest[item.key] || 0);
        const delta = count - Number(previous[item.key] || 0);
        return <tr key={item.key}><th scope="row">{item.label}</th><td>{count}건</td><td>{formatDashboardCompositionShare(count, total || 1)}</td><td>{delta ? `${delta > 0 ? "증가" : "감소"} ${Math.abs(delta)}건` : "변동 없음"}</td></tr>;
      })}</tbody></table>
    </DashboardDialog>}
  </section>;
}

export function DashboardPriorityTable({ rows, sort, onSort, Action, onOpenMonitoring, categoryLabel, timeLabel, riskScore }) {
  return <section className="desk-priority" aria-label="우선 이슈">
    <header className="desk-section-heading"><h2>우선 이슈 {rows.length === 5 ? "TOP 5" : `${rows.length}건`}</h2><select aria-label="우선 이슈 정렬 및 보기" value={sort} onChange={(event) => onSort(event.target.value)}>
      <option value="risk">정렬: 리스크순</option><option value="latest">정렬: 최신순</option><option value="own">보기: 당사 직접 언급만</option><option value="spread">정렬: 확산순</option>
    </select></header>
    <div className="desk-story-grid">{rows.map((issue, index) => {
      const headline = displayHeadline(issue);
      const highlight = headline.match(/^.{1,16}(?=\s)/u)?.[0] || headline.split(" ")[0].slice(0, 12);
      return <article key={issue.id || `${issue.source}-${issue.title}`} data-tone={issue.tone || "중립"}>
      <div className="desk-story-kicker"><b>{String(index + 1).padStart(2, "0")}</b><span>/ {categoryLabel(issue.category)}</span><span className="desk-tone" title={`리스크 ${riskScore(issue)}점`}>{issue.tone || "중립"}</span></div>
      <h3><Action issue={issue} onOpenMonitoring={onOpenMonitoring}>{index === 0 ? <><mark>{highlight}</mark>{headline.slice(highlight.length)}</> : headline}</Action></h3>
      <div className="desk-story-footer"><span>{resolvePublisher(issue)} · <time>{timeLabel(issue)}</time></span><Action issue={issue} onOpenMonitoring={onOpenMonitoring}><ArrowUpRight aria-hidden="true" /><span className="sr-only">{headline} 원문 열기</span></Action></div>
    </article>;
    })}</div>
    {!rows.length && <p className="desk-empty">{sort === "own" ? "오늘 수집 기사 중 당사 직접 언급 기사가 없습니다." : "오늘 기준으로 표시할 주요 이슈가 없습니다."}</p>}
  </section>;
}
