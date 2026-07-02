export function publicationMeta(period, data) {
  const scope = data.periodScope || {};
  const date = scope.scopeLabel || data.scope || data.generatedAt || "";
  const meta = {
    daily: {
      kicker: "일간 브리프",
      title: "일일 언론 동향 보고서",
      subtitle: "당일 수집 기사 기준 핵심 이슈와 즉시 확인할 리스크를 정리합니다.",
      issue: `${date} · 당일 집계`,
    },
    weekly: {
      kicker: "주간 리서치",
      title: "주간 언론 동향 리서치 보고서",
      subtitle: "해당 주차의 반복 노출, 논조 변화, 관리 이슈를 리서치 형식으로 정리합니다.",
      issue: `${date} · 주차 집계`,
    },
    monthly: {
      kicker: "월간 리서치",
      title: "월간 언론 동향 리서치 보고서",
      subtitle: "집계월 기준 누적 기사, 언론사별 보도량, 키워드 흐름을 리서치 형식으로 정리합니다.",
      issue: `${scope.month || date} · 집계월`,
    },
  };
  return meta[period] || meta.daily;
}

export function reportPurposeConfig(period = "daily") {
  const configs = {
    daily: {
      focus: "즉시 확인 기사 중심",
      issueTitle: "즉시 확인 기사",
      issueMeta: "원문 이동",
      categoryTitle: "오늘 분류",
      pressTitle: "오늘 노출 언론사",
    },
    weekly: {
      focus: "반복 이슈와 확산 흐름 중심",
      issueTitle: "주간 반복 이슈",
      issueMeta: "묶음 대표 기사",
      categoryTitle: "주간 분류 흐름",
      pressTitle: "주간 노출 언론사",
    },
    monthly: {
      focus: "누적 평판·정책·시장 흐름 중심",
      issueTitle: "월간 핵심 이슈",
      issueMeta: "누적 대표 기사",
      categoryTitle: "월간 분류 비중",
      pressTitle: "월간 노출 언론사",
    },
  };
  return configs[period] || configs.daily;
}

export function buildA4ReportStats(summary = {}, articles = [], { isOwnArticle = () => false } = {}) {
  const riskValue = String(summary.risk || "LOW").toUpperCase();
  const riskTone = riskValue === "HIGH" ? "negative" : riskValue === "MEDIUM" ? "caution" : "positive";
  return [
    { label: "리스크", value: riskValue, detail: "당사 기준", tone: riskTone, preset: {} },
    { label: "분석", value: Number(summary.analyzed || articles.length || 0).toLocaleString("ko-KR"), detail: "기간 기사", preset: {} },
    { label: "당사", value: Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0).toLocaleString("ko-KR"), detail: "직접 언급", preset: { category: "당사" } },
    { label: "주의", value: Number(summary.caution || articles.filter((item) => item.tone === "주의").length || 0).toLocaleString("ko-KR"), detail: "관찰 신호", tone: "caution", preset: { tone: "주의" } },
    { label: "부정", value: Number(summary.ownNegative || articles.filter((item) => item.tone === "부정" && isOwnArticle(item)).length || 0).toLocaleString("ko-KR"), detail: "즉시 확인", tone: "negative", preset: { tone: "부정" } },
  ];
}
