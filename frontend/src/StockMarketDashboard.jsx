import { useState } from "react";
import { Activity, Building2, ExternalLink, FileText, LineChart, WalletCards } from "lucide-react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  averagePeerReturnByPeriod,
  buildStockRangeSelection,
  formatIndexPoint,
  formatMarketStatus,
  formatSignedNumber,
  formatStockDate,
  formatStockMarketCap,
  formatStockPercent,
  formatStockPrice,
  formatStockShares,
  formatStockTimestamp,
  formatStockTradingValue,
  formatStockVolume,
  getStockHistoryBounds,
  indexReturnByPeriod,
  normalizeStockHistory,
  safeNumberDiff,
  sliceStockTrend,
  stockRangeForPeriod,
  stockSeriesLabel,
  stockToneClass,
} from "./stockUtils";

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

function openArticleLink(event, url) {
  event.preventDefault();
  event.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}
export default function StockMarketDashboard({ stockMarket }) {
  const [stockRange, setStockRange] = useState("60d");
  const [customRangeDays, setCustomRangeDays] = useState("45");
  const [dateRangeDraft, setDateRangeDraft] = useState({ start: "", end: "" });
  const company = stockMarket?.company || {};
  const summary = stockMarket?.summary || {};
  const indices = stockMarket?.indices || [];
  const peerGroups = stockMarket?.peerGroups || stockMarket?.peer_groups || [];
  const relativeTrend = stockMarket?.relativeTrend || stockMarket?.relative_trend || [];
  const dartDisclosures = stockMarket?.dartDisclosures || stockMarket?.dart_disclosures || {};
  const hasData = company?.status === "ok";
  const companyLink = company?.code ? `https://finance.naver.com/item/main.naver?code=${company.code}` : "#";
  const regularMarket = company.regular_market || {};
  const nxtMarket = company.nxt_market || {};
  const integratedMarket = company.integrated_market || {};
  const priceGap = company.price_gap || {};
  const marketCap = company.market_cap || {};
  const rangeWindows = company.range_windows || {};
  const stockHistory = normalizeStockHistory(company.history || []);
  const historyBounds = getStockHistoryBounds(stockHistory);
  const stockRangeOptions = [
    { id: "5d", label: "5거래일", days: 5 },
    { id: "20d", label: "20거래일", days: 20 },
    { id: "60d", label: "60거래일", days: 60 },
    { id: "120d", label: "120거래일", days: 120 },
  ].filter((item) => historyBounds.count >= Math.min(item.days, 5) || rangeWindows[item.id]?.high || company.returns?.[item.id] !== undefined);
  const activeRangeSelection = buildStockRangeSelection({
    stockRange,
    customRangeDays,
    dateRangeDraft,
    company,
    rangeWindows,
    history: stockHistory,
  });
  const activeRangeKey = activeRangeSelection.key;
  const activeRangeLabel = activeRangeSelection.label;
  const activeRange = activeRangeSelection.range;
  const activeRangeReturn = activeRange.return ?? company.returns?.[activeRangeSelection.returnKey] ?? company.returns?.[activeRangeKey];
  const activeTrend = sliceStockTrend(relativeTrend, activeRangeSelection.count || activeRangeKey);
  const activePeerReturn = averagePeerReturnByPeriod(
    peerGroups,
    activeRangeKey,
    activeRangeSelection.count,
    activeRange.start_date,
    activeRange.end_date,
    activeRangeSelection.returnKey,
  );
  const activeKospiReturn = indexReturnByPeriod(
    indices,
    "KOSPI",
    activeRangeKey,
    activeRangeSelection.count,
    activeRange.start_date,
    activeRange.end_date,
    activeRangeSelection.returnKey,
  );

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Market Control"
        title="주가·시장 관제 대시보드"
        description="정규장, NXT, 동종업계, 시장지수를 한 화면에서 비교해 주가성 기사와 실제 가격 흐름을 분리합니다."
        right={(
          <div className="page-actions">
            <a className="ghost-button" href={companyLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink />네이버 금융
            </a>
            <a className="ghost-button" href="https://www.nextrade.co.kr/" target="_blank" rel="noopener noreferrer">
              <ExternalLink />NXT
            </a>
          </div>
        )}
      />

      {!hasData ? (
        <section className="panel empty-state-panel">
          <h2><WalletCards />주가 데이터 수집 대기</h2>
          <p>다음 대시보드 배포 시 네이버 금융 차트 데이터를 수집해 표시합니다.</p>
        </section>
      ) : (
        <>
          <section className="stock-source-grid">
            <StockSourceTile
              label="KRX 정규장"
              status={regularMarket.status}
              price={regularMarket.price}
              change={regularMarket.change}
              changeRate={regularMarket.change_rate}
              volume={regularMarket.volume}
              tradedAt={regularMarket.traded_at}
            />
            <StockSourceTile
              label="NXT 마켓"
              status={nxtMarket.status}
              price={nxtMarket.price}
              change={nxtMarket.change}
              changeRate={nxtMarket.change_rate}
              volume={nxtMarket.volume}
              tradedAt={nxtMarket.traded_at}
              empty={!nxtMarket.available}
            />
            <StockMetricCard
              icon={Activity}
              label="NXT 가격 차이"
              value={priceGap.available ? `${formatSignedNumber(priceGap.price)}원` : "미수집"}
              detail={priceGap.available ? `${priceGap.label} · ${formatStockPercent(priceGap.rate)}` : "정규장 대비 비교 대기"}
              toneValue={priceGap.price}
            />
            <StockMetricCard
              icon={Building2}
              label="시가총액"
              value={formatStockMarketCap(marketCap.value || company.latest?.market_cap)}
              detail={marketCap.implied_shares ? `환산 주식수 ${formatStockShares(marketCap.implied_shares)}` : "네이버 금융 기준"}
            />
            <StockMetricCard
              icon={WalletCards}
              label="통합 거래대금"
              value={formatStockTradingValue(integratedMarket.trading_value)}
              detail={`거래량 ${formatStockVolume(integratedMarket.volume || company.latest?.volume)}`}
            />
          </section>

          <StockDisclosureBoard disclosures={dartDisclosures} companyName={company.name || "인카금융서비스"} />

          <section className="stock-range-board">
            <div className="stock-range-head">
              <div>
                <span>기간별 판단</span>
                <h3>{activeRangeLabel} 주가 위치</h3>
                <small className="stock-range-coverage">
                  {historyBounds.count ? `수집 범위 ${historyBounds.start}~${historyBounds.end} · ${historyBounds.count}거래일` : "히스토리 수집 대기"}
                </small>
              </div>
              <div className="stock-range-controls">
                <div className="stock-range-tabs" aria-label="빠른 기간 선택">
                  {stockRangeOptions.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={stockRange === item.id ? "active" : ""}
                      onClick={() => setStockRange(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className={`stock-range-input ${stockRange === "custom" ? "active" : ""}`}>
                  <span>직접</span>
                  <input
                    type="number"
                    min="1"
                    max={historyBounds.count || 120}
                    value={customRangeDays}
                    onFocus={() => setStockRange("custom")}
                    onChange={(event) => {
                      setCustomRangeDays(event.target.value);
                      setStockRange("custom");
                    }}
                  />
                  <em>거래일</em>
                </label>
                <div className={`stock-date-range ${stockRange === "dates" ? "active" : ""}`}>
                  <label>
                    <span>시작</span>
                    <input
                      type="date"
                      min={historyBounds.start || undefined}
                      max={historyBounds.end || undefined}
                      value={dateRangeDraft.start}
                      onChange={(event) => {
                        setDateRangeDraft((current) => ({ ...current, start: event.target.value }));
                        setStockRange("dates");
                      }}
                    />
                  </label>
                  <label>
                    <span>종료</span>
                    <input
                      type="date"
                      min={historyBounds.start || undefined}
                      max={historyBounds.end || undefined}
                      value={dateRangeDraft.end}
                      onChange={(event) => {
                        setDateRangeDraft((current) => ({ ...current, end: event.target.value }));
                        setStockRange("dates");
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="stock-range-reset"
                    onClick={() => {
                      setStockRange("60d");
                      setDateRangeDraft({ start: "", end: "" });
                    }}
                  >
                    기본
                  </button>
                </div>
              </div>
            </div>
            <div className="stock-range-cards">
              <StockRangeCard
                label="선택기간 수익률"
                value={formatStockPercent(activeRangeReturn)}
                detail={`${formatStockDate(activeRange.start_date)}~${formatStockDate(activeRange.end_date || company.latest?.date)}`}
                toneValue={activeRangeReturn}
              />
              <StockRangeCard
                label="기간 고점"
                value={formatStockPrice(activeRange.high)}
                detail={`${formatStockDate(activeRange.high_date)} 고점 · 현재 ${formatStockPercent(activeRange.drawdown_from_high)}`}
                toneValue={activeRange.drawdown_from_high}
              />
              <StockRangeCard
                label="기간 저점"
                value={formatStockPrice(activeRange.low)}
                detail={`${formatStockDate(activeRange.low_date)} 저점 · 저점 대비 ${formatStockPercent(activeRange.rebound_from_low)}`}
                toneValue={activeRange.rebound_from_low}
              />
              <StockRangeCard
                label="비교군 대비"
                value={formatStockPercent(safeNumberDiff(activeRangeReturn, activePeerReturn))}
                detail={`동종 ${formatStockPercent(activePeerReturn)} · KOSPI ${formatStockPercent(activeKospiReturn)}`}
                toneValue={safeNumberDiff(activeRangeReturn, activePeerReturn)}
              />
            </div>
          </section>

          <section className="stock-insight-board">
            <div>
              <span>시장 판단</span>
              <b>{buildStockMarketJudgement(company, summary, activeRange)}</b>
              <p>{buildStockMarketReason(company, summary, activeRange, activeRangeLabel, activePeerReturn, activeKospiReturn)}</p>
            </div>
          </section>

          <section className="stock-dashboard-grid">
            <Panel title="상대 주가 흐름" icon={LineChart} meta={`${activeRangeLabel} · 첫날 100 기준`}>
              <StockTrendChart rows={activeTrend} />
            </Panel>
            <Panel title="시장 지수" icon={Activity} meta="KOSPI · KOSDAQ">
              <MarketIndexCards rows={indices} />
            </Panel>
          </section>

          <section className="stock-peer-section">
            {peerGroups.map((group) => {
              const groupReturn = averagePeerReturnByPeriod(
                [{ stocks: group.stocks || [] }],
                activeRangeKey,
                activeRangeSelection.count,
                activeRange.start_date,
                activeRange.end_date,
                activeRangeSelection.returnKey,
              );
              return (
                <Panel
                  key={group.name}
                  title={group.name}
                  icon={Building2}
                  meta={`${activeRangeLabel} 평균 ${formatStockPercent(groupReturn)}`}
                >
                  <StockPeerTable
                    rows={group.stocks || []}
                    rangeKey={activeRangeKey}
                    rangeLabel={activeRangeLabel}
                    rangeCount={activeRangeSelection.count}
                    rangeStart={activeRange.start_date}
                    rangeEnd={activeRange.end_date}
                    fallbackKey={activeRangeSelection.returnKey}
                  />
                </Panel>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

function StockSourceTile({ label, status, price, change, changeRate, volume, tradedAt, empty = false }) {
  const tone = stockToneClass(changeRate);
  return (
    <article className={`stock-source-tile ${tone} ${empty ? "empty" : ""}`}>
      <div>
        <span>{label}</span>
        <em>{empty ? "미수집" : formatMarketStatus(status)}</em>
      </div>
      <b>{empty ? "-" : formatStockPrice(price)}</b>
      <strong>{empty ? "NXT 가격 미수집" : `${formatSignedNumber(change)} · ${formatStockPercent(changeRate)}`}</strong>
      <small>{formatStockTimestamp(tradedAt, "") || "시각 확인 대기"} · 거래량 {formatStockVolume(volume)}</small>
    </article>
  );
}

function StockMetricCard({ icon: Icon, label, value, detail, toneValue }) {
  return (
    <article className={`stock-metric-card ${stockToneClass(toneValue)}`}>
      <Icon />
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </article>
  );
}

function StockRangeCard({ label, value, detail, toneValue }) {
  return (
    <article className={`stock-range-card ${stockToneClass(toneValue)}`}>
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </article>
  );
}

function StockDisclosureBoard({ disclosures = {}, companyName = "인카금융서비스" }) {
  const items = Array.isArray(disclosures) ? disclosures : (disclosures.items || []);
  const visibleItems = items.slice(0, 4);
  const status = disclosures.status || (visibleItems.length ? "ok" : "empty");
  const emptyTitle = dartDisclosureEmptyTitle(status);
  const emptyMessage = dartDisclosureEmptyMessage(disclosures, status);
  const dartSearchUrl = `https://dart.fss.or.kr/dsab007/main.do?textCrpNM=${encodeURIComponent(companyName)}`;
  return (
    <section className="stock-disclosure-board">
      <div className="stock-disclosure-head">
        <div>
          <span>DART / IR CHECK</span>
          <h3>최근 공시·IR 체크</h3>
          <p>기업설명회, 실적 공시, 정기보고서처럼 주가 판단에 영향을 줄 수 있는 자료를 함께 봅니다.</p>
        </div>
        <div className="stock-disclosure-actions">
          <em>{dartDisclosureStatusLabel(status)}</em>
          <a className="ghost-button" href={dartSearchUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />DART 검색
          </a>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="stock-disclosure-list">
          {visibleItems.map((item, index) => (
            <article key={`${item.receipt_no || item.title || "dart"}-${index}`} className="stock-disclosure-card">
              <div>
                <span>{item.type || "공시"}</span>
                <em>{formatStockDate(item.date || item.raw_date)}</em>
              </div>
              <b>{item.title || "공시 제목 확인 필요"}</b>
              <p>{item.summary || "주가 판단에 영향을 줄 수 있는 공시성 이벤트로 별도 확인합니다."}</p>
              <a href={item.link || dartSearchUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, item.link || dartSearchUrl)}>
                공시 열기 <ExternalLink />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className="stock-disclosure-empty">
          <FileText />
          <div>
            <b>{emptyTitle}</b>
            <p>{emptyMessage}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function dartDisclosureStatusLabel(status) {
  if (status === "ok") return "자동 수집";
  if (status === "timeout") return "연결 지연";
  if (status === "network_error") return "네트워크 확인";
  if (status === "auth_error") return "인증 확인";
  if (status === "error") return "수집 확인";
  if (status === "not_configured") return "키 설정 필요";
  return "공시 대기";
}

function dartDisclosureEmptyTitle(status) {
  if (status === "timeout") return "OpenDART 연결 지연";
  if (status === "network_error") return "OpenDART 네트워크 확인";
  if (status === "auth_error") return "OpenDART 인증 확인 필요";
  if (status === "error") return "OpenDART 수집 확인 필요";
  if (status === "not_configured") return "OpenDART 키 설정 필요";
  return "OpenDART 연결 대기";
}

function dartDisclosureEmptyMessage(disclosures, status) {
  const message = sanitizeDashboardSecretText(disclosures?.message || "");
  if (message) return message;
  if (status === "timeout") return "OpenDART 서버 응답이 지연되어 이번 갱신에서 공시를 가져오지 못했습니다. 다음 자동 갱신에서 재시도합니다.";
  if (status === "network_error") return "OpenDART 연결 중 네트워크 오류가 발생했습니다. API 키는 화면에 노출하지 않고 다음 갱신에서 재시도합니다.";
  if (status === "auth_error") return "GitHub Secret의 DART_API_KEY와 DART_CORP_CODE 값을 확인하세요.";
  if (status === "error") return "OpenDART 응답을 해석하지 못했습니다. 잠시 후 다시 갱신됩니다.";
  return "DART API 키와 기업 고유번호를 연결하면 기업설명회, 실적, 사업보고서 공시가 이 영역에 자동 표시됩니다.";
}

function sanitizeDashboardSecretText(value) {
  return String(value || "")
    .replace(/crtfc_key=[^&\s)]+/gi, "crtfc_key=***")
    .replace(/https?:\/\/opendart\.fss\.or\.kr\/\S+/gi, "OpenDART API")
    .trim();
}

function StockTrendChart({ rows = [] }) {
  const visibleRows = rows.filter((row) => row.company || row.kospi || row.peer);
  if (!visibleRows.length) return <p className="a4-empty">상대 흐름 데이터가 없습니다.</p>;
  return (
    <div className="chart-box stock-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={visibleRows} margin={{ left: 0, right: 14, top: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value))}`} />
          <Tooltip formatter={(value, name) => [formatIndexPoint(value), stockSeriesLabel(name)]} />
          <Line type="monotone" dataKey="company" name="company" stroke="#2855d9" strokeWidth={3} dot={false} connectNulls />
          <Line type="monotone" dataKey="peer" name="peer" stroke="#14805f" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="kospi" name="kospi" stroke="#b45309" strokeWidth={2.2} dot={false} strokeDasharray="5 4" connectNulls />
        </RechartsLineChart>
      </ResponsiveContainer>
      <div className="stock-chart-legend">
        <span className="company">인카금융서비스</span>
        <span className="peer">동종 평균</span>
        <span className="kospi">KOSPI</span>
      </div>
    </div>
  );
}

function MarketIndexCards({ rows = [] }) {
  return (
    <div className="market-index-grid">
      {rows.map((row) => (
        <article key={row.code} className={`market-index-card ${stockToneClass(row.latest?.change_rate)}`}>
          <span>{row.name}</span>
          <b>{formatStockPrice(row.latest?.price, 2)}</b>
          <em>{formatStockPercent(row.latest?.change_rate)}</em>
          <small>20일 {formatStockPercent(row.returns?.["20d"])} · 60일 {formatStockPercent(row.returns?.["60d"])}</small>
        </article>
      ))}
    </div>
  );
}

function StockPeerTable({
  rows = [],
  rangeKey = "20d",
  rangeLabel = "20거래일",
  rangeCount = 20,
  rangeStart = "",
  rangeEnd = "",
  fallbackKey = "20d",
}) {
  if (!rows.length) return <p className="a4-empty">비교 종목 데이터가 없습니다.</p>;
  return (
    <div className="stock-table-wrap">
      <table className="stock-table">
        <colgroup>
          <col className="stock-col-name" />
          <col className="stock-col-price" />
          <col className="stock-col-price" />
          <col className="stock-col-gap" />
          <col className="stock-col-return" />
          <col className="stock-col-return" />
          <col className="stock-col-drawdown" />
        </colgroup>
        <thead>
          <tr>
            <th>종목</th>
            <th>시총</th>
            <th>현재가</th>
            <th>기간등락</th>
            <th>1일</th>
            <th>{rangeLabel}</th>
            <th>고점대비</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selectedRange = stockRangeForPeriod(row, rangeKey, rangeCount, rangeStart, rangeEnd, fallbackKey);
            const selectedReturn = selectedRange.return;
            const periodChange = safeNumberDiff(selectedRange.end_price, selectedRange.start_price);
            return (
              <tr key={row.code}>
                <td><b>{row.name}</b><span>{row.code}</span></td>
                <td>{formatStockMarketCap(row.market_cap?.value ?? row.latest?.market_cap)}</td>
                <td>{formatStockPrice(selectedRange.end_price)}</td>
                <td className={stockToneClass(periodChange)}>{Number.isFinite(periodChange) ? `${formatSignedNumber(periodChange)}원` : "-"}</td>
                <td className={stockToneClass(row.returns?.["1d"])}>{formatStockPercent(row.returns?.["1d"])}</td>
                <td className={stockToneClass(selectedReturn)}>{formatStockPercent(selectedReturn)}</td>
                <td className={stockToneClass(selectedRange.drawdown_from_high)}>{formatStockPercent(selectedRange.drawdown_from_high)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildStockMarketJudgement(company = {}, summary = {}, range = {}) {
  const selectedReturn = Number(range.return ?? company.returns?.["20d"]);
  const drawdown = Number(range.drawdown_from_high ?? company.range?.drawdown_from_60d_high);
  if (Number.isFinite(selectedReturn) && selectedReturn <= -10) return "선택 기간 약세";
  const peerGap = Number(summary.relative_to_peers);
  if (Number.isFinite(peerGap) && peerGap <= -5) return "동종 대비 부진";
  if (Number.isFinite(drawdown) && drawdown <= -20) return "고점 회복 지연";
  if (Number.isFinite(selectedReturn) && selectedReturn >= 5) return "반등 관찰 구간";
  return "중립 관찰 구간";
}

function buildStockMarketReason(company = {}, summary = {}, range = {}, rangeLabel = "선택 기간", peerReturn = null, kospiReturn = null) {
  const selectedReturn = range.return ?? company.returns?.["20d"];
  const pieces = [
    `당사 ${rangeLabel} ${formatStockPercent(selectedReturn)}`,
    `동종 평균 ${formatStockPercent(peerReturn)}`,
    `KOSPI ${formatStockPercent(kospiReturn)}`,
    `고점 ${formatStockDate(range.high_date)} 대비 ${formatStockPercent(range.drawdown_from_high)}`,
  ];
  return `${pieces.join(" · ")} 기준으로 주가성 기사와 실제 가격 흐름을 함께 점검합니다.`;
}

