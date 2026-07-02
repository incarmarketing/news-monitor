import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  ExternalLink,
  FileText,
  Gauge,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { gaCompetitorSeed } from "./data";
import { safeNumberDiff } from "./stockUtils";

function PageTitle({ right }) {
  if (!right) return null;
  return (
    <div className="page-title-actions-only">
      {right}
    </div>
  );
}

function Panel({ title, icon: Icon = FileText, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2><Icon />{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}
export default function GACompetitorIntel({ gaIntel }) {
  const [selectedRevenuePeer, setSelectedRevenuePeer] = useState("지에이코리아");
  const data = gaIntel || gaCompetitorSeed;
  const labels = Array.isArray(data?.labels) ? data.labels : gaCompetitorSeed.labels;
  const companies = Array.isArray(data?.companies) && data.companies.length ? data.companies : gaCompetitorSeed.companies;
  const market = Array.isArray(data?.market) && data.market.length ? data.market : gaCompetitorSeed.market;
  const revenueTracker = Array.isArray(data?.revenueTracker) && data.revenueTracker.length
    ? data.revenueTracker
    : gaCompetitorSeed.revenueTracker;
  const companyKey = data?.companyKey || "인카금융서비스";
  const ownCompany = companies.find((row) => String(row.short || row.name || "").includes(companyKey))
    || companies.find((row) => String(row.name || "").includes("인카"))
    || companies[0]
    || {};
  const rows = buildGaCompanyRows(companies, labels);
  const ownRow = rows.find((row) => row.short === ownCompany.short) || rows[0] || {};
  const marketLatest = market[market.length - 1] || {};
  const marketIndex = buildGaMarketIndex(ownRow, marketLatest);
  const trendRows = buildGaTrendRows(labels, ownCompany, market);
  const plannerRows = rows.slice(0, 10);
  const revenueRows = normalizeRevenueTracker(revenueTracker);
  const revenuePeerOptions = buildGaRevenuePeerOptions(companies, revenueRows, ownCompany);
  const activeRevenuePeer = revenuePeerOptions.find((option) => option.key === selectedRevenuePeer)
    || revenuePeerOptions.find((option) => option.short === "지에이코리아")
    || revenuePeerOptions[0]
    || {};
  const revenueCompareRows = buildGaRevenueComparisonRows({
    revenueRows,
    companies,
    ownCompany,
    peerCompany: activeRevenuePeer.company,
  });
  return (
    <main className="workspace ga-intel-workspace">
      <PageTitle
        eyebrow="Industry Trend"
        title="GA 업계 동향"
        description="설계사 규모, 유지율, 품질 지표, 매출 흐름을 한 화면에서 비교합니다."
        right={(
          <div className="page-actions">
            <a className="ghost-button" href="https://gapub.insure.or.kr/gongsimain/mainSearch.do" target="_blank" rel="noopener noreferrer">
              <ExternalLink />통합공시
            </a>
            <a className="ghost-button" href="https://dart.fss.or.kr/" target="_blank" rel="noopener noreferrer">
              <ExternalLink />DART
            </a>
          </div>
        )}
      />

      <section className="ga-console-grid">
        <GAMetricCard icon={Users} label="설계사수" value={`${formatGaInteger(ownRow.planners)}명`} detail={`${ownRow.rank}위 · 2025년 말`} />
        <GAMetricCard icon={Gauge} label="정착률" value={formatGaPercentPlain(ownRow.stay)} detail={`시장 평균 ${formatGaPercentPlain(marketLatest.stay)}`} />
        <GAMetricCard icon={ShieldCheck} label="유지율" value={`13회 ${formatGaPercentPlain(ownRow.retention13Life)}`} detail={`25회 ${formatGaPercentPlain(ownRow.retention25Life)} · 생보 기준`} />
        <GAMetricCard icon={AlertTriangle} label="불완전판매율" value={formatGaPercentPlain(ownRow.poorSalesLife, 2)} detail="생보 기준 · 0% 유지 추적" tone={Number(ownRow.poorSalesLife) <= 0 ? "good" : "watch"} />
      </section>

      <section className="ga-revenue-board">
        <div className="ga-section-title">
          <h2><WalletCards />매출 비교</h2>
          <div className="ga-revenue-toolbar">
            <span>직전 5개년 매출</span>
            <label>
              <b>비교 GA</b>
              <select value={activeRevenuePeer.key || ""} onChange={(event) => setSelectedRevenuePeer(event.target.value)}>
                {revenuePeerOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="ga-revenue-compare-grid">
          <GARevenueComparisonChart rows={revenueCompareRows} peerLabel={activeRevenuePeer.label || "비교 GA"} />
          <div className="ga-revenue-summary">
            <GARevenueComparisonTable rows={revenueCompareRows} peerLabel={activeRevenuePeer.label || "비교 GA"} />
          </div>
        </div>
      </section>

      <section className="ga-dashboard-grid">
        <Panel title="설계사 규모" icon={Building2} meta="2025년 말 · 상위 10개사">
          <GAPlannerBarChart rows={plannerRows} ownShort={ownRow.short} />
        </Panel>
        <Panel title="유지율 및 정착률" icon={LineChart} meta="13회차·25회차·정착률">
          <GATrendChart rows={trendRows} />
        </Panel>
      </section>

      <section className="ga-dashboard-grid secondary">
        <Panel title="당사 운영 지표" icon={Activity} meta="시장 평균 대비">
          <div className="ga-index-list">
            {marketIndex.map((item) => (
              <article key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                </div>
                <em className={item.gapClass}>{item.gap}</em>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="데이터 파이프라인" icon={RefreshCw} meta={data?.source?.updatedAt || gaCompetitorSeed.source.updatedAt}>
          <div className="ga-pipeline">
            <div><b>1</b><span>통합공시 반기 결산 수집</span></div>
            <div><b>2</b><span>동일 회사명 기준 중복 제거</span></div>
            <div><b>3</b><span>DART·실적 보도 매출 보강</span></div>
            <div><b>4</b><span>Supabase 원장 누적 후 비교</span></div>
          </div>
        </Panel>
      </section>

      <Panel title="GA 비교군 상세" icon={FileText} meta="인카금융서비스 행 강조">
        <GACompetitorTable rows={rows} ownShort={ownRow.short} />
      </Panel>
    </main>
  );
}

function GAMetricCard({ icon: Icon, label, value, detail, tone = "default" }) {
  return (
    <article className={`ga-metric-card ${tone}`}>
      <Icon />
      <div className="ga-metric-copy">
        <span>{label}</span>
        <b>{value}</b>
        <em>{detail}</em>
      </div>
    </article>
  );
}

function renderGaPlannerValueLabel(props) {
  const { x, y, width, height, value } = props;
  const label = formatGaInteger(value);
  if (!label || label === "-") return null;
  return (
    <text
      className="ga-chart-value-label"
      x={Number(x || 0) + Number(width || 0) + 10}
      y={Number(y || 0) + Number(height || 0) / 2 + 4}
      textAnchor="start"
    >
      {label}
    </text>
  );
}

function renderGaRevenueValueLabel(props) {
  const { x, y, width, value } = props;
  const label = formatGaRevenueChartLabel(value);
  if (!label) return null;
  return (
    <text
      className="ga-chart-value-label ga-revenue-value-label"
      x={Number(x || 0) + Number(width || 0) / 2}
      y={Math.max(12, Number(y || 0) - 8)}
      textAnchor="middle"
    >
      {label}
    </text>
  );
}

function GAPlannerBarChart({ rows = [], ownShort = "" }) {
  if (!rows.length) return <p className="a4-empty">경쟁사 비교 데이터가 없습니다.</p>;
  return (
    <div className="chart-box ga-bar-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 92, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} width={128} tick={{ fontSize: 11, fontWeight: 800 }} />
          <Tooltip formatter={(value) => [`${formatGaInteger(value)}명`, "설계사수"]} />
          <Bar dataKey="planners" radius={[0, 7, 7, 0]} barSize={18}>
            {rows.map((row) => (
              <Cell key={row.short} fill={row.short === ownShort ? "#e8a33d" : "#2855d9"} />
            ))}
            <LabelList dataKey="planners" content={renderGaPlannerValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GARevenueComparisonChart({ rows = [], peerLabel = "비교 GA" }) {
  if (!rows.some((row) => Number.isFinite(row.incaAmount) || Number.isFinite(row.peerAmount))) {
    return <p className="a4-empty">매출 비교 데이터가 없습니다.</p>;
  }
  return (
    <div className="chart-box ga-revenue-chart" aria-label="GA 연간 매출 비교 그래프">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 10, right: 28, top: 36, bottom: 8 }} barGap={8} barCategoryGap={20}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} minTickGap={0} tick={{ fontSize: 11, fontWeight: 800 }} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value)).toLocaleString("ko-KR")}억`} />
          <Tooltip
            formatter={(value, name, entry) => [
              formatGaRevenue(value),
              entry?.dataKey === "incaAmount" || name === "인카금융서비스" ? "인카금융서비스" : peerLabel,
            ]}
          />
          <Bar dataKey="incaAmount" name="인카금융서비스" radius={[7, 7, 0, 0]} fill="#2855d9" barSize={24}>
            <LabelList dataKey="incaAmount" content={renderGaRevenueValueLabel} />
          </Bar>
          <Bar dataKey="peerAmount" name={peerLabel} radius={[7, 7, 0, 0]} fill="#14805f" barSize={24}>
            <LabelList dataKey="peerAmount" content={renderGaRevenueValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="ga-revenue-legend">
        <span className="inca">인카금융서비스</span>
        <span className="peer">{peerLabel}</span>
      </div>
    </div>
  );
}

function GARevenueComparisonTable({ rows = [], peerLabel = "비교 GA" }) {
  if (!rows.length) return <p className="a4-empty">매출 비교 표 데이터가 없습니다.</p>;
  return (
    <div className="ga-revenue-table-wrap">
      <table className="ga-revenue-table">
        <thead>
          <tr>
            <th>연도</th>
            <th>인카</th>
            <th>{peerLabel}</th>
            <th>차이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period}>
              <td>{row.label}</td>
              <td className={!Number.isFinite(row.incaAmount) ? "missing" : ""}>{formatGaRevenueCell(row.incaAmount)}</td>
              <td className={!Number.isFinite(row.peerAmount) ? "missing" : ""}>{formatGaRevenueCell(row.peerAmount)}</td>
              <td className={gaGapTone(row.gap)}>{formatGaRevenueGap(row.gap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GATrendChart({ rows = [] }) {
  if (!rows.length) return <p className="a4-empty">추이 데이터가 없습니다.</p>;
  return (
    <div className="chart-box ga-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={rows} margin={{ left: 0, right: 18, top: 14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
          <Tooltip formatter={(value, name) => [formatGaPercentPlain(value), gaTrendLabel(name)]} />
          <Line type="monotone" dataKey="incaRetention13" stroke="#2855d9" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="marketRetention13" stroke="#14805f" strokeWidth={2.4} dot={false} strokeDasharray="5 4" connectNulls />
          <Line type="monotone" dataKey="incaRetention25" stroke="#7c3aed" strokeWidth={2.7} dot={{ r: 2.5 }} connectNulls />
          <Line type="monotone" dataKey="marketRetention25" stroke="#64748b" strokeWidth={2.2} dot={false} strokeDasharray="5 5" connectNulls />
          <Line type="monotone" dataKey="incaStay" stroke="#b45309" strokeWidth={2.2} dot={false} connectNulls />
          <Line type="monotone" dataKey="marketStay" stroke="#d97706" strokeWidth={2} dot={false} strokeDasharray="3 4" connectNulls />
        </RechartsLineChart>
      </ResponsiveContainer>
      <div className="ga-quality-legend" aria-label="유지율 및 정착률 범례">
        <div className="ga-quality-legend-group">
          <b>13회 유지율</b>
          <span className="inca-r13">인카금융</span>
          <span className="market-r13">시장 평균</span>
        </div>
        <div className="ga-quality-legend-group">
          <b>25회 유지율</b>
          <span className="inca-r25">인카금융</span>
          <span className="market-r25">시장 평균</span>
        </div>
        <div className="ga-quality-legend-group">
          <b>정착률</b>
          <span className="inca-stay">인카금융</span>
          <span className="market-stay">시장 평균</span>
        </div>
      </div>
    </div>
  );
}

function GACompetitorTable({ rows = [], ownShort = "" }) {
  if (!rows.length) return <p className="a4-empty">경쟁사 표 데이터가 없습니다.</p>;
  return (
    <div className="ga-table-wrap">
      <table className="ga-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>GA사</th>
            <th>영업 규모</th>
            <th>유지율 및 정착률</th>
            <th>품질 리스크</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const revenueMetric = latestGaRevenueMetric(row);
            return (
              <tr key={row.short} className={row.short === ownShort ? "own" : ""}>
                <td>
                  <span className="ga-rank-pill">{row.rank}위</span>
                  {row.short === ownShort && <em className="ga-own-mark">당사</em>}
                </td>
                <td><b>{row.short}</b><span>{row.name}</span></td>
                <td>
                  <div className="ga-table-metric"><b>{formatGaInteger(row.planners)}명</b><span>설계사</span></div>
                  <small>{revenueMetric ? `${revenueMetric.year} 매출 ${formatGaRevenue(revenueMetric.amount)}` : "매출 확인 필요"}</small>
                </td>
                <td>
                  <div className="ga-table-metric"><b>{formatGaPercentPlain(row.stay)}</b><span>정착률</span></div>
                  <small>13회 {formatGaPercentPlain(row.retention13Life)} · 25회 {formatGaPercentPlain(row.retention25Life)}</small>
                </td>
                <td>
                  <div className={`ga-risk-score ${Number(row.poorSalesLife || 0) <= 0 ? "good" : "watch"}`}>
                    <b>{formatGaPercentPlain(row.poorSalesLife, 2)}</b>
                    <span>불완전판매율</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildGaCompanyRows(companies = [], labels = []) {
  const index2024 = labels.findIndex((label) => label === "2024");
  const lastIndex = labels.length ? labels.length - 1 : 0;
  return companies
    .map((company) => {
      const planners = latestArrayValue(company.plannerTrend, lastIndex);
      const planners2024 = index2024 >= 0 ? latestArrayValue(company.plannerTrend, index2024) : null;
      return {
        ...company,
        planners,
        plannersDeltaFrom2024: Number.isFinite(planners) && Number.isFinite(planners2024) ? planners - planners2024 : null,
        stay: latestArrayValue(company.stayTrend, lastIndex),
        retention13Life: latestArrayValue(company.retention13LifeTrend, lastIndex),
        retention25Life: latestArrayValue(company.retention25LifeTrend, lastIndex),
        poorSalesLife: latestArrayValue(company.poorSalesLifeTrend, lastIndex),
      };
    })
    .filter((row) => Number.isFinite(row.planners))
    .sort((a, b) => Number(b.planners || 0) - Number(a.planners || 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildGaTrendRows(labels = [], company = {}, market = []) {
  return labels.map((period, index) => {
    const marketRow = market[index] || {};
    const marketRetention13 = Number(marketRow.retention13Life);
    const marketRetention25 = Number(marketRow.retention25Life);
    const marketStay = Number(marketRow.stay);
    return {
      period,
      incaRetention13: latestArrayValue(company.retention13LifeTrend, index),
      marketRetention13: Number.isFinite(marketRetention13) ? marketRetention13 : null,
      incaRetention25: latestArrayValue(company.retention25LifeTrend, index),
      marketRetention25: Number.isFinite(marketRetention25) ? marketRetention25 : null,
      incaStay: latestArrayValue(company.stayTrend, index),
      marketStay: Number.isFinite(marketStay) ? marketStay : null,
    };
  }).filter((row) => (
    row.incaRetention13 !== null
    || row.marketRetention13 !== null
    || row.incaRetention25 !== null
    || row.marketRetention25 !== null
    || row.incaStay !== null
    || row.marketStay !== null
  ));
}

function buildGaMarketIndex(ownRow = {}, marketLatest = {}) {
  return [
    {
      label: "설계사 규모",
      value: `${formatGaInteger(ownRow.planners)}명`,
      gap: `시장 전체 ${formatGaInteger(marketLatest.planners)}명 중 ${formatGaPercentPlain((Number(ownRow.planners) / Number(marketLatest.planners)) * 100, 1)}`,
      gapClass: "flat",
    },
    {
      label: "13회 유지율",
      value: formatGaPercentPlain(ownRow.retention13Life),
      gap: `시장 대비 ${formatGaPointGap(ownRow.retention13Life, marketLatest.retention13Life)}`,
      gapClass: gaGapClass(ownRow.retention13Life, marketLatest.retention13Life),
    },
    {
      label: "정착률",
      value: formatGaPercentPlain(ownRow.stay),
      gap: `시장 대비 ${formatGaPointGap(ownRow.stay, marketLatest.stay)}`,
      gapClass: gaGapClass(ownRow.stay, marketLatest.stay),
    },
    {
      label: "불완전판매율",
      value: formatGaPercentPlain(ownRow.poorSalesLife, 2),
      gap: `시장 대비 ${formatGaPointGap(ownRow.poorSalesLife, marketLatest.poorSalesLife, 2)}`,
      gapClass: Number(ownRow.poorSalesLife) <= Number(marketLatest.poorSalesLife) ? "up" : "down",
    },
  ];
}

function normalizeRevenueTracker(rows = []) {
  return rows
    .map((row) => ({
      ...row,
      companyName: row.companyName || row.company_name || row.company || "인카금융서비스",
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    }))
    .sort((a, b) => gaRevenueSortKey(a.period || a.label) - gaRevenueSortKey(b.period || b.label));
}

function buildGaRevenuePeerOptions(companies = [], revenueRows = [], ownCompany = {}) {
  const ownKey = gaCompanyKey(ownCompany);
  const fallbackByKey = new Map((gaCompetitorSeed.companies || []).map((company) => [gaCompanyKey(company), company]));
  const rowsByCompany = new Set(revenueRows.map((row) => normalizeGaName(row.companyName)).filter(Boolean));
  return companies
    .filter((company) => gaCompanyKey(company) !== ownKey)
    .map((company) => {
      const fallback = fallbackByKey.get(gaCompanyKey(company)) || {};
      const mergedCompany = { ...fallback, ...company };
      const key = gaCompanyKey(mergedCompany);
      const hasRevenue = hasCompanyRevenue(mergedCompany)
        || Array.from(rowsByCompany).some((name) => gaCompanyNameMatches(name, mergedCompany));
      return {
        key,
        label: mergedCompany.short || mergedCompany.name || key,
        short: mergedCompany.short || "",
        company: mergedCompany,
        hasRevenue,
      };
    })
    .filter((option) => option.key && option.hasRevenue)
    .sort((a, b) => {
      if (a.short === "지에이코리아") return -1;
      if (b.short === "지에이코리아") return 1;
      return a.label.localeCompare(b.label, "ko");
    });
}

function buildGaRevenueComparisonRows({ revenueRows = [], companies = [], ownCompany = {}, peerCompany = {} }) {
  const fallbackByKey = new Map((gaCompetitorSeed.companies || []).map((company) => [gaCompanyKey(company), company]));
  const ownMerged = { ...(fallbackByKey.get(gaCompanyKey(ownCompany)) || {}), ...ownCompany };
  const peerMerged = { ...(fallbackByKey.get(gaCompanyKey(peerCompany)) || {}), ...peerCompany };
  const ownRows = annualRevenueRowsForCompany(revenueRows, ownMerged);
  const peerRows = annualRevenueRowsForCompany(revenueRows, peerMerged);
  const periods = buildRecentAnnualRevenuePeriods(ownRows, peerRows, 5);
  return periods.map((period) => {
    const inca = ownRows.find((row) => row.period === period) || {};
    const peer = peerRows.find((row) => row.period === period) || {};
    const incaAmount = Number.isFinite(Number(inca.amount)) ? Number(inca.amount) : null;
    const peerAmount = Number.isFinite(Number(peer.amount)) ? Number(peer.amount) : null;
    const gap = Number.isFinite(incaAmount) && Number.isFinite(peerAmount)
      ? safeNumberDiff(incaAmount, peerAmount)
      : null;
    return {
      period,
      label: compactRevenuePeriodLabel(period),
      incaAmount,
      peerAmount,
      gap,
    };
  });
}

function buildRecentAnnualRevenuePeriods(ownRows = [], peerRows = [], length = 5) {
  const years = [...ownRows, ...peerRows]
    .map((row) => Number(String(row.period || "").match(/^20\d{2}$/)?.[0]))
    .filter(Number.isFinite);
  const latestYear = years.length ? Math.max(...years) : new Date().getFullYear() - 1;
  return Array.from({ length }, (_, index) => String(latestYear - length + 1 + index));
}

function annualRevenueRowsForCompany(revenueRows = [], company = {}) {
  const rows = revenueRows
    .filter((row) => gaCompanyNameMatches(row.companyName, company))
    .filter((row) => /^20\d{2}$/.test(String(row.period || "")) || /연간/.test(String(row.label || "")))
    .map((row) => ({
      period: String(row.period || row.label || "").match(/20\d{2}/)?.[0] || row.period || row.label,
      label: row.label || row.period,
      amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : null,
      sourceUrl: row.sourceUrl || "",
    }))
    .filter((row) => /^20\d{2}$/.test(String(row.period)) && Number.isFinite(Number(row.amount)));

  const fallbackRows = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => {
    const amount = Number(company[`revenue${year}`]);
    return Number.isFinite(amount) ? { period: String(year), label: `${year} 연간`, amount } : null;
  }).filter(Boolean);

  const byPeriod = new Map();
  [...fallbackRows, ...rows].forEach((row) => byPeriod.set(row.period, row));
  return Array.from(byPeriod.values()).sort((a, b) => gaRevenueSortKey(a.period) - gaRevenueSortKey(b.period));
}

function hasCompanyRevenue(company = {}) {
  return [2019, 2020, 2021, 2022, 2023, 2024, 2025].some((year) => Number.isFinite(Number(company[`revenue${year}`])));
}

function gaCompanyKey(company = {}) {
  return normalizeGaName(company.short || company.short_name || company.name);
}

function normalizeGaName(value = "") {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/주식회사|㈜|\(주\)|보험대리점|법인보험대리점/g, "")
    .trim();
}

function gaCompanyNameMatches(value = "", company = {}) {
  const target = normalizeGaName(value);
  const aliases = [company.name, company.short, company.short_name].map(normalizeGaName).filter(Boolean);
  if (!target || !aliases.length) return false;
  return aliases.some((alias) => target === alias || target.includes(alias) || alias.includes(target));
}

function buildGaRevenueComparisonInsight(rows = [], peerLabel = "비교 GA") {
  const latest = rows.slice().reverse().find((row) => Number.isFinite(row.incaAmount) || Number.isFinite(row.peerAmount));
  if (!latest) return `${peerLabel} 매출 원장 확인이 필요합니다.`;
  if (!Number.isFinite(latest.incaAmount) || !Number.isFinite(latest.peerAmount)) {
    return `직전 5개년 중 ${latest.period} 확인값부터 비교합니다. 미입력 연도는 확인 필요로 표시됩니다.`;
  }
  const gap = safeNumberDiff(latest.incaAmount, latest.peerAmount);
  const direction = gap >= 0 ? "앞섭니다" : "낮습니다";
  return `직전 5개년 매출 추적 기준, ${latest.period} 인카는 ${peerLabel}보다 ${formatGaRevenue(Math.abs(gap))} ${direction}.`;
}

function gaRevenueSortKey(value) {
  const text = String(value || "");
  const year = Number(text.match(/20\d{2}/)?.[0] || 9999);
  const quarter = /Q1|1분기/i.test(text) ? 1
    : /Q2|2분기/i.test(text) ? 2
      : /H1|상반기/i.test(text) ? 2.5
        : /Q3|3분기/i.test(text) ? 3
          : /Q4|4분기/i.test(text) ? 4
            : 9;
  return year * 10 + quarter;
}

function compactRevenuePeriodLabel(value) {
  const text = String(value || "");
  const year = text.match(/20\d{2}/)?.[0]?.slice(2) || text.slice(0, 4);
  if (/1분기|Q1/i.test(text)) return `${year} 1Q`;
  if (/2분기|Q2/i.test(text)) return `${year} 2Q`;
  if (/상반기|H1/i.test(text)) return `${year} H1`;
  if (/3분기|Q3/i.test(text)) return `${year} 3Q`;
  if (/4분기|Q4/i.test(text)) return `${year} 4Q`;
  if (/연간|20\d{2}/.test(text)) return `${year} FY`;
  return text;
}

function buildGaConsoleJudgement(ownRow = {}, marketLatest = {}) {
  const rank = ownRow.rank ? `설계사수 ${ownRow.rank}위` : "설계사수 확인";
  const retentionGap = formatGaPointGap(ownRow.retention13Life, marketLatest.retention13Life);
  const poorSales = Number(ownRow.poorSalesLife) <= 0 ? "불완전판매율 0%" : `불완전판매율 ${formatGaPercentPlain(ownRow.poorSalesLife, 2)}`;
  return `${rank}, 생보 13회 유지율 시장 대비 ${retentionGap}, ${poorSales}`;
}

function latestArrayValue(values = [], index) {
  if (!Array.isArray(values)) return null;
  const value = values[index];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestGaRevenueMetric(row = {}) {
  for (const year of [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]) {
    const amount = Number(row[`revenue${year}`]);
    if (Number.isFinite(amount)) return { year, amount };
  }
  return null;
}

function formatGaInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("ko-KR");
}

function formatGaRevenue(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number).toLocaleString("ko-KR")}억원`;
}

function formatGaRevenueCell(value) {
  if (value === null || value === undefined || value === "") return "확인 필요";
  const number = Number(value);
  if (!Number.isFinite(number)) return "확인 필요";
  return formatGaRevenue(number);
}

function formatGaRevenueShort(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${Math.round(number).toLocaleString("ko-KR")}억`;
}

function formatGaRevenueChartLabel(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return Math.round(number).toLocaleString("ko-KR");
}

function formatGaRevenueGap(value) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${Math.round(number).toLocaleString("ko-KR")}억원`;
}

function formatGaPercentPlain(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toFixed(digits)}%`;
}

function formatGaPointGap(left, right, digits = 2) {
  const diff = safeNumberDiff(left, right);
  if (!Number.isFinite(diff)) return "-";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(digits)}p`;
}

function gaGapClass(left, right) {
  const diff = safeNumberDiff(left, right);
  if (!Number.isFinite(diff) || diff === 0) return "flat";
  return diff > 0 ? "up" : "down";
}

function gaGapTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "flat";
  return number > 0 ? "up" : "down";
}

function gaTrendLabel(name) {
  return {
    incaRetention13: "인카 13회 유지율",
    marketRetention13: "시장 13회 유지율",
    incaRetention25: "인카 25회 유지율",
    marketRetention25: "시장 25회 유지율",
    incaStay: "인카 정착률",
    marketStay: "시장 정착률",
  }[name] || name;
}

