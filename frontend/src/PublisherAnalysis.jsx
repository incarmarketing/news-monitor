import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import AppSelect from "./AppSelect.jsx";
import { loadMediaArticleRange } from "./mediaRange.js";
import { buildPublisherAnalysis, filterPublisherArticles, publisherDateRange, publisherToneColors } from "./publisherAnalysisModel.js";
import { displayHeadline } from "./publisherIdentity.js";
import { monitoringCategoryLabel } from "./monitoringPresentation.js";
import { safeArticleUrl } from "./mediaRegistryModel.mjs";

const emptyFilters = { tone:"", category:"", own:false, directNegative:false };

export default function PublisherAnalysis({ publisher, revision, onBusy }) {
  const [days,setDays] = useState(30);
  const [result,setResult] = useState(null);
  const [error,setError] = useState("");
  const [retry,setRetry] = useState(0);
  const [filters,setFilters] = useState(emptyFilters);
  const [page,setPage] = useState(0);
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());
  const range = useMemo(() => publisherDateRange(today,days),[today,days]);
  useEffect(() => {
    let active = true;
    setResult(null); setError(""); setFilters(emptyFilters); setPage(0); onBusy?.(true);
    loadMediaArticleRange({...range,revision:`${revision || ""}:${retry}`}).then(value => {
      if (active) setResult(buildPublisherAnalysis(value.articles,publisher,range));
    }).catch(() => { if (active) setError("기간 전체 데이터를 불러오지 못했습니다."); })
      .finally(() => { if (active) onBusy?.(false); });
    return () => { active = false; };
  },[publisher,range,revision,retry,onBusy]);
  const filtered = useMemo(() => filterPublisherArticles(result?.rows || [],filters),[result,filters]);
  const pageCount = Math.max(1,Math.ceil(filtered.length/10));
  const current = Math.min(page,pageCount-1);
  const choose = next => { setFilters(next); setPage(0); };
  const activeFilters = filters.tone || filters.category || filters.own || filters.directNegative;
  return <section className="publisher-analysis" aria-label={`${publisher} 보도 분석`} aria-busy={!result && !error}>
    <div className="publisher-analysis-toolbar"><span>{range.startDate.replaceAll("-",".")} – {range.endDate.replaceAll("-",".")} · 모니터링 기준</span>
      <AppSelect aria-label="언론사 분석 기간" value={days} onChange={event => setDays(Number(event.target.value))}><option value={30}>최근 30일</option><option value={90}>최근 90일</option></AppSelect></div>
    {error ? <div className="publisher-analysis-error" role="alert"><p>{error}</p><button className="ghost-button" onClick={() => setRetry(value => value+1)}><RefreshCw size={17}/>다시 조회</button></div>
      : !result ? <div className="publisher-analysis-skeleton" role="status" aria-label="보도 분석 불러오는 중"><div/><div/><div/><div/></div> : <>
        <div className="publisher-metrics">
          <button onClick={() => choose(emptyFilters)} aria-pressed={!activeFilters}><span>모니터링 기사</span><b>{result.total.toLocaleString()}<small>건</small></b></button>
          <button onClick={() => choose({...emptyFilters,own:!filters.own})} aria-pressed={filters.own}><span>당사 언급</span><b>{result.own.toLocaleString()}<small>건</small></b></button>
          <button onClick={() => choose({...emptyFilters,directNegative:!filters.directNegative})} aria-pressed={filters.directNegative}><span>당사 직접 부정</span><b className={result.directNegative ? "publisher-negative-count" : ""}>{result.directNegative.toLocaleString()}<small>건</small></b></button>
          <div><span>최근 보도</span><b className="publisher-latest">{result.latest.replaceAll("-",".") || "—"}</b></div>
        </div>
        <div className="publisher-distributions">
          <Distribution title="논조별 보도" items={result.tones} total={result.total} active={filters.tone} onChoose={tone => choose({...emptyFilters,tone:filters.tone === tone ? "" : tone})}/>
          <Distribution title="분류별 보도" items={result.categories} total={result.total} active={filters.category} onChoose={category => choose({...emptyFilters,category:filters.category === category ? "" : category})}/>
        </div>
        <div className="publisher-list-heading"><h3>{filters.directNegative ? "당사 직접 부정 보도" : filters.own ? "당사 언급 보도" : [filters.tone, filters.category && monitoringCategoryLabel(filters.category)].filter(Boolean).join(" · ") || "기간 내 기사"}<span>{filtered.length.toLocaleString()}건</span></h3>
          <button type="button" className="registry-icon" aria-label="보도 분석 필터 초기화" title="필터 초기화" disabled={!activeFilters} onClick={() => choose(emptyFilters)}><RotateCcw size={17}/></button></div>
        <div className="publisher-analysis-table-wrap"><table className="publisher-analysis-table"><colgroup><col style={{width:118}}/><col style={{width:74}}/><col style={{width:100}}/><col/></colgroup><thead><tr><th>작성일</th><th>논조</th><th>분류</th><th>기사 제목</th></tr></thead>
          <tbody>{filtered.slice(current*10,current*10+10).map(row => <tr key={row.articleHash || row.id || row.link}><td>{row.date.replaceAll("-",".")}</td><td><span className="publisher-tone" style={{color:publisherToneColors[row.tone]}}>{row.tone || "미분류"}</span></td><td>{monitoringCategoryLabel(row.category)}</td><td><a href={safeArticleUrl(row.link) || undefined} target="_blank" rel="noreferrer">{displayHeadline(row)}<ExternalLink size={15}/></a></td></tr>)}</tbody></table>
          {!filtered.length && <p className="registry-empty">{activeFilters ? "선택 조건에 맞는 기사가 없습니다." : "선택 기간에 수집된 기사가 없습니다."}</p>}</div>
        <div className="registry-pager"><span>{filtered.length ? current*10+1 : 0}–{Math.min((current+1)*10,filtered.length)} / {filtered.length.toLocaleString()}</span><button className="registry-icon" aria-label="분석 기사 이전 페이지" disabled={!current} onClick={() => setPage(current-1)}><ChevronLeft size={18}/></button><button className="registry-icon" aria-label="분석 기사 다음 페이지" disabled={current+1>=pageCount} onClick={() => setPage(current+1)}><ChevronRight size={18}/></button></div>
      </>}
  </section>;
}

function Distribution({title,items,total,active,onChoose}) {
  return <section className="publisher-distribution"><h3>{title}</h3><div>{items.map(item => <button type="button" key={item.key} aria-pressed={active === item.key} onClick={() => onChoose(item.key)}>
    <span>{item.label}</span><span className="publisher-bar-track"><i style={{width:`${total ? item.count/total*100 : 0}%`,background:item.color || "#778b30"}}/></span><b>{item.count.toLocaleString()}건</b><small>{total ? Math.round(item.count/total*100) : 0}%</small>
  </button>)}{!items.length && <p className="registry-empty">집계할 기사가 없습니다.</p>}</div></section>;
}
