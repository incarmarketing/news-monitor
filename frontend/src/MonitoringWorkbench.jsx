import React, { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bookmark, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { displayHeadline, resolvePublisher } from "./publisherIdentity.js";
import { monitoringCategories, monitoringCategoryKey, monitoringCategoryLabel, monitoringCsv, monitoringDateRange, monitoringPage } from "./monitoringPresentation.js";
import "./monitoring-workbench.css";

function PageCheckbox({ mixed = false, ...props }) {
  const input = useRef(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <input ref={input} type="checkbox" {...props} />;
}

export default function MonitoringWorkbench({ rows, exportRows, categoryCounts, filters, onChange, onApply, onReset, onPeriod, isLoading, isUpdating, updatedLabel, onRefresh,
  normalizeRow, rowKey, timeLabel, onOpenArticle, ScrapButton, isScrapped, scraps, onScrapSaved, Details, onFeedbackSaved, filterKey, focusLabel }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const id = useId();
  const scrollBox = useRef(null);
  const paginated = useMemo(() => monitoringPage(rows, page, pageSize), [rows, page, pageSize]);
  const pageRows = useMemo(() => paginated.rows.map(normalizeRow), [paginated.rows, normalizeRow]);
  const selectedRows = useMemo(() => rows.filter(row => selected.has(rowKey(row))), [rows, selected, rowKey]);
  const allSelected = pageRows.length > 0 && pageRows.every(row => selected.has(rowKey(row)));
  const someSelected = pageRows.some(row => selected.has(rowKey(row)));
  const startPage = Math.max(1, Math.min(paginated.current - 2, paginated.pages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, paginated.pages) }, (_, i) => startPage + i);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  useEffect(() => { setPage(1); setSelected(new Set()); setExpanded(null); }, [filterKey, pageSize]);
  useEffect(() => { if (scrollBox.current) scrollBox.current.scrollTop = 0; }, [paginated.current, filterKey, pageSize]);

  const toggle = (key) => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const togglePage = () => setSelected(current => {
    const next = new Set(current);
    pageRows.forEach(row => allSelected ? next.delete(rowKey(row)) : next.add(rowKey(row)));
    return next;
  });
  const exportCsv = () => {
    const articles = (selectedRows.length ? selectedRows : exportRows).map(normalizeRow);
    if (!articles.length) return;
    const url = URL.createObjectURL(new Blob([monitoringCsv(articles)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `news-monitor-${today}${selectedRows.length ? "-selected" : ""}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const apply = (event) => { event?.preventDefault(); onApply(); setDatesOpen(false); };
  const reset = () => { onReset(); setDatesOpen(false); setSelected(new Set()); setPage(1); setExpanded(null); };
  const activeCategory = monitoringCategoryKey(filters.category);
  const tabs = monitoringCategories.filter(item => ["own", "ga", "insurance", "policy"].includes(item.key) || categoryCounts[item.key] || (filters.category !== "all" && item.key === activeCategory));
  const rangeLabel = filters.startDateInput === filters.endDateInput
    ? (filters.startDateInput || today).replaceAll("-", ".")
    : `${(filters.startDateInput || "").replaceAll("-", ".")} - ${(filters.endDateInput || "").replaceAll("-", ".")}`;

  return <main className="workspace monitoring-workspace monitoring-workbench">
    <header className="monitor-header"><h1>모니터링</h1><div><span>{updatedLabel}</span><button type="button" className="monitor-icon" aria-label="모니터링 새로고침" title="새로고침" onClick={onRefresh} disabled={isLoading}><RefreshCw className={isLoading ? "monitor-spin" : ""} /></button></div></header>
    <form className="monitor-search" onSubmit={apply}>
      <div className="monitor-search-input"><Search aria-hidden="true"/><input aria-label="검색어" placeholder="제목, 언론사, 키워드 검색" value={filters.queryInput} onChange={event => onChange("queryInput", event.target.value)} /><button className="monitor-search-submit" type="submit" aria-label="조회/검색" title="검색"><Search /></button></div>
      <button type="button" className="monitor-command" onClick={reset}><RotateCcw/><span>초기화</span></button>
      <button type="button" className="monitor-command" onClick={exportCsv} disabled={!exportRows.length || isUpdating}><Download/><span>{selectedRows.length ? `선택 ${selectedRows.length}건 CSV` : "CSV 다운로드"}</span></button>
    </form>
    <section className="monitor-filters" aria-label="기사 검색 조건">
      <div className="monitor-period" aria-label="조회 기간">{[[1, "오늘"], [7, "7일"], [30, "30일"]].map(([days, label]) => {
        const range = monitoringDateRange(today, days);
        const active = !datesOpen && filters.startDateInput === range.startDate && filters.endDateInput === range.endDate;
        return <button key={days} type="button" aria-pressed={active} onClick={() => { onPeriod(range); setDatesOpen(false); }}>{label}</button>;
      })}<button type="button" aria-expanded={datesOpen} aria-controls={`${id}-dates`} onClick={() => setDatesOpen(value => !value)}>기간 선택</button></div>
      <button type="button" className="monitor-date-label" aria-label="조회 날짜 변경" aria-expanded={datesOpen} aria-controls={`${id}-dates`} onClick={() => setDatesOpen(value => !value)}>{rangeLabel}<CalendarDays/></button>
      <label className="monitor-select"><span>논조</span><select aria-label="논조" value={filters.tone} onChange={event => onChange("tone", event.target.value)}><option value="all">전체</option>{filters.tones.map(tone => <option key={tone}>{tone}</option>)}</select></label>
      <label className="monitor-select monitor-source"><span>언론사</span><select aria-label="언론사" value={filters.source} onChange={event => onChange("source", event.target.value)}><option value="all">전체</option>{filters.sources.map(source => <option key={source}>{source}</option>)}</select></label>
      {datesOpen && <form id={`${id}-dates`} className="monitor-custom-dates" onSubmit={apply}>
        <label>시작 기준일<input type="date" value={filters.startDateInput} onInput={event => onChange("startDateInput", event.currentTarget.value)} onChange={event => onChange("startDateInput", event.target.value)}/></label>
        <span aria-hidden="true">-</span>
        <label>종료 기준일<input type="date" value={filters.endDateInput} onInput={event => onChange("endDateInput", event.currentTarget.value)} onChange={event => onChange("endDateInput", event.target.value)}/></label>
        <button className="monitor-command" type="submit">적용</button>
      </form>}
    </section>
    {(focusLabel || filters.query) && <div className="monitor-scope"><span>{focusLabel || `전체 보관 검색: ${filters.query}`}</span><button type="button" aria-label="검색 범위 해제" title="검색 범위 해제" onClick={reset}><X/></button></div>}
    <section className="monitor-results" aria-label="수집 기사 목록" aria-busy={isUpdating}>
      <header className="monitor-results-header">
        <div className="monitor-category-tabs" role="tablist" aria-label="기사 분류">
          <button type="button" role="tab" aria-selected={filters.category === "all"} onClick={() => onChange("category", "all")}>전체 <b>{Object.values(categoryCounts).reduce((sum, n) => sum + n, 0)}</b></button>
          {tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={filters.category !== "all" && activeCategory === item.key} onClick={() => onChange("category", item.key)}>{item.label} <b>{categoryCounts[item.key]}</b></button>)}
        </div>
        <label className="monitor-sort"><span>정렬</span><select aria-label="정렬" value={filters.viewMode} onChange={event => onChange("viewMode", event.target.value)}><option value="latest">최신순</option><option value="related">관련순</option></select></label>
      </header>
      <div className="monitor-loading" role="status" aria-live="polite">{isUpdating ? "검색 결과 확인 중" : ""}</div>
      <div className="monitor-table-scroll" ref={scrollBox}>
        <table className="monitor-table"><caption className="sr-only">수집 기사 목록</caption><colgroup><col className="monitor-col-check"/><col className="monitor-col-time"/><col className="monitor-col-tone"/><col className="monitor-col-category"/><col/><col className="monitor-col-publisher"/><col className="monitor-col-action"/><col className="monitor-col-action"/><col className="monitor-col-expand"/></colgroup>
          <thead><tr><th><PageCheckbox aria-label="현재 페이지 기사 전체 선택" checked={allSelected} mixed={someSelected && !allSelected} onChange={togglePage}/></th><th>작성 시간</th><th>논조</th><th>분류</th><th className="monitor-title-column">기사 제목</th><th>언론사</th><th><Bookmark aria-label="스크랩"/></th><th><ExternalLink aria-label="원문"/></th><th><span className="sr-only">상세</span></th></tr></thead>
          <tbody>{pageRows.map((row, index) => {
            const key = rowKey(row);
            const open = expanded === key;
            const headline = displayHeadline(row);
            const safeLink = /^https?:\/\//i.test(row.link || "") ? row.link : "";
            const relatedCount = Array.isArray(row.relatedArticles) ? row.relatedArticles.length : 0;
            const detailId = `${id}-row-${index}`;
            return <Fragment key={key}><tr className="monitor-article-row" data-selected={selected.has(key)} data-expanded={open}>
              <td className="monitor-check"><input type="checkbox" aria-label={`${headline} 선택`} checked={selected.has(key)} onChange={() => toggle(key)}/></td>
              <td className="monitor-time"><time title={[row.date, timeLabel(row)].filter(Boolean).join(" ")}>{filters.startDateInput !== filters.endDateInput && <small>{String(row.date || "").slice(5).replace("-", ".")}</small>}{timeLabel(row)}</time></td>
              <td className="monitor-tone-cell"><span className="monitor-tone" data-tone={row.tone}>{row.tone || "중립"}</span></td>
              <td className="monitor-category-cell">{monitoringCategoryLabel(row.category)}</td>
              <td className="monitor-headline">{safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer" title={headline} onClick={event => onOpenArticle(event, safeLink)}>{headline}</a> : <span>{headline}</span>}</td>
              <td className="monitor-publisher" title={resolvePublisher(row)}>{resolvePublisher(row)}</td>
              <td className="monitor-action"><ScrapButton article={row} scrapped={isScrapped(row, scraps)} onScrapSaved={onScrapSaved}/></td>
              <td className="monitor-action">{safeLink && <a href={safeLink} target="_blank" rel="noopener noreferrer" aria-label="기사 열기" title="기사 열기" onClick={event => onOpenArticle(event, safeLink)}><ExternalLink/></a>}</td>
              <td className="monitor-expand"><button type="button" aria-label={relatedCount > 1 ? `기사 상세 및 묶음 ${relatedCount}건` : "기사 상세"} title={relatedCount > 1 ? `기사 상세 · 관련 ${relatedCount}건` : "기사 상세"} aria-expanded={open} aria-controls={detailId} onClick={() => setExpanded(open ? null : key)}>{open ? <ChevronDown/> : <ChevronRight/>}</button></td>
            </tr>{open && <tr className="monitor-detail-row"><td colSpan={9}><div id={detailId}><Details article={row} onFeedbackSaved={onFeedbackSaved}/></div></td></tr>}</Fragment>;
          })}</tbody>
        </table>
        {!pageRows.length && <div className="monitor-empty" role="status"><Search/><strong>{isUpdating ? "기사를 불러오고 있습니다." : "검색 조건에 맞는 기사가 없습니다."}</strong>{!isUpdating && <button className="monitor-command" type="button" onClick={reset}><RotateCcw/>초기화</button>}</div>}
      </div>
      <footer className="monitor-pagination"><span>{paginated.first} - {paginated.last} / {rows.length.toLocaleString("ko-KR")}{filters.viewMode === "related" ? "개 묶음" : "건"}</span><nav aria-label="기사 페이지"><button type="button" className="monitor-icon" aria-label="이전 페이지" disabled={paginated.current === 1} onClick={() => { setPage(paginated.current - 1); setExpanded(null); }}><ChevronLeft/></button>{pageNumbers.map(n => <button key={n} type="button" aria-label={`${n}페이지`} aria-current={paginated.current === n ? "page" : undefined} onClick={() => { setPage(n); setExpanded(null); }}>{n}</button>)}<button type="button" className="monitor-icon" aria-label="다음 페이지" disabled={paginated.current === paginated.pages} onClick={() => { setPage(paginated.current + 1); setExpanded(null); }}><ChevronRight/></button></nav><select aria-label="페이지당 기사 수" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10, 20, 50].map(n => <option key={n} value={n}>{n}개씩 보기</option>)}</select></footer>
    </section>
  </main>;
}
