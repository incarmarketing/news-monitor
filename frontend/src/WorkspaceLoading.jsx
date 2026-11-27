import MediaSkeleton from "./MediaSkeleton.jsx";
import "./workspace-loading.css";

function Fill({ className = "" }) {
  return <i className={`workspace-skeleton-fill media-skeleton-fill ${className}`} />;
}

function Controls({ count = 3 }) {
  return <div className="workspace-loading-controls" aria-hidden="true">{Array.from({ length: count }, (_, index) => <Fill className="workspace-loading-control" key={index} />)}</div>;
}

function Rows({ count = 5 }) {
  return <div className="workspace-loading-rows" aria-hidden="true">{Array.from({ length: count }, (_, index) => <div className="workspace-loading-row" key={index}><Fill className="workspace-loading-cell"/><Fill/><Fill className="workspace-loading-cell"/></div>)}</div>;
}

function MediaLoading() {
  return <main className="workspace media-page workspace-loading" data-loading-section="media" aria-busy="true" aria-label="언론동향 준비 중">
    <header className="page-title media-command-panel"><h1>언론동향</h1><Controls/><div className="media-range-panel workspace-loading-range" aria-hidden="true"><Fill className="workspace-loading-date"/><span>~</span><Fill className="workspace-loading-date"/><Fill className="workspace-loading-control"/></div></header>
    <section className="media-analysis-layout media-intel-board" aria-hidden="true">
      <div className="media-main-trend"><section className="panel media-trend-panel"><header className="media-trend-heading"><h2>일별 논조 흐름</h2><MediaSkeleton kind="count"/></header><MediaSkeleton kind="trend"/></section></div>
      <div className="media-keywords"><div className="newsroom-content-tabs workspace-loading-section-heading"><h2>주요 키워드</h2></div><div className="media-keyword-content"><MediaSkeleton kind="keywords"/></div></div>
      <div className="media-issues"><section className="panel"><div className="panel-head"><h2>주요 보도 이슈</h2></div><div className="media-issue-content"><MediaSkeleton kind="issues"/></div></section></div>
    </section>
  </main>;
}

function ReportLoading() {
  return <main className="workspace report-workspace workspace-loading" data-loading-section="reports" aria-busy="true" aria-label="리포트 준비 중">
    <section className="report-command-panel"><div className="report-command-copy"><h1>리포트</h1><div className="report-period-picker"><Controls/></div></div><Controls count={1}/></section>
    <div className="a4-report-stage workspace-loading-report" aria-hidden="true"><section className="newspaper-report-sheet">
      <header className="newspaper-masthead"><Fill className="workspace-loading-nameplate"/><Controls/></header>
      <div className="newspaper-report-body"><div className="newspaper-article-desk"><Fill className="workspace-loading-heading"/><Rows/></div><aside className="newspaper-brief-rail"><MediaSkeleton kind="keywords"/><Fill className="workspace-loading-plot"/></aside></div>
      <div className="newspaper-footer"><Fill className="workspace-loading-heading"/></div>
    </section></div>
  </main>;
}

export default function WorkspaceLoading({ section }) {
  if (section === "media") return <MediaLoading/>;
  if (section === "reports") return <ReportLoading/>;
  const stocks = section === "stocks";
  const title = stocks ? "주가·시장" : "운영관리";
  return <main className={`workspace workspace-loading${stocks ? " stock-workspace" : ""}`} data-loading-section={section} aria-busy="true" aria-label={`${title} 준비 중`}>
    <header className="page-title"><div><h1>{title}</h1></div><div className="page-title-right"><Controls count={2}/></div></header>
    {stocks ? <>
      <section className="stock-ticker-band" aria-hidden="true"><div className="stock-company-name"><Fill className="workspace-loading-nameplate"/><Fill className="workspace-loading-heading"/></div><div className="stock-source-grid">{[0, 1, 2].map(index => <div className="workspace-loading-metric" key={index}><Fill className="workspace-loading-heading"/><Fill className="workspace-loading-value"/><Fill className="workspace-loading-heading"/></div>)}</div></section>
      <Controls count={4}/><div className="workspace-loading-stock-plot workspace-loading-plot media-skeleton-fill" aria-hidden="true"/>
    </> : <>
      <div className="management-summary workspace-loading-summary" aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <div className="workspace-loading-metric" key={index}><Fill className="workspace-loading-heading"/><Fill className="workspace-loading-value"/></div>)}</div>
      <section className="workspace-loading-registry" aria-hidden="true"><Controls count={6}/><div className="workspace-loading-search"><Fill className="workspace-loading-control"/></div><Rows count={4}/></section>
    </>}
  </main>;
}
