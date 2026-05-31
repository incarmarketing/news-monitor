export const periodTabs = [
  { id: "daily", label: "일간", shortLabel: "일" },
  { id: "weekly", label: "주간", shortLabel: "주" },
  { id: "monthly", label: "월간", shortLabel: "월" },
];

export const navItems = [
  { id: "overview", label: "실시간 대시보드" },
  { id: "monitoring", label: "실시간 모니터링" },
  { id: "media", label: "미디어 분석 리포트" },
  { id: "scraps", label: "주요 기사 스크랩" },
  { id: "risk", label: "리스크 대응센터" },
  { id: "reports", label: "일간/주간/월간 보고서" },
  { id: "management", label: "운영 관리" },
];

const dailyIssues = [
  {
    tone: "주의",
    category: "당사",
    source: "매일경제",
    title: "인카금융서비스 투자의견 조정 관련 증권 리포트 노출",
    summary:
      "목표가와 투자의견 하향은 직접 부정 이슈가 아니라 시장 평가 리스크입니다. 부정 알림과 분리해 주의 이슈로 추적합니다.",
    publishedAt: "09:18",
    link: "https://www.mk.co.kr/news/stock/12034143",
  },
  {
    tone: "주의",
    category: "당사",
    source: "중앙이코노미뉴스",
    title: "초대형 GA 정착지원금 공시 보도에 당사 순위 언급",
    summary:
      "당사 지급 규모가 보도됐지만 비위, 제재, 소비자 피해성 문맥은 아닙니다. 업계 경쟁 지표로 분리합니다.",
    publishedAt: "08:24",
    link: "https://www.joongangenews.com/news/articleView.html?idxno=517653",
  },
  {
    tone: "중립",
    category: "GA",
    source: "보험매일",
    title: "글로벌금융판매 GA 채널 리크루팅 동향",
    summary:
      "GA 컬럼에 등록된 글로벌금융판매 문맥입니다. 일반 글로벌 금융 기사와 분리해 보험/GA 기사만 통과합니다.",
    publishedAt: "10:04",
    link: "#",
  },
  {
    tone: "중립",
    category: "보험사",
    source: "보험저널",
    title: "보험사 상품 개정과 채널별 판매 전략 보도 증가",
    summary:
      "당사 직접 이슈는 아니지만 GA/보험사 시장 동향으로 집계합니다.",
    publishedAt: "10:35",
    link: "#",
  },
  {
    tone: "제외",
    category: "노이즈",
    source: "자동 필터",
    title: "브랜드평판 반복 기사 중 무관 산업 기사 제외",
    summary:
      "브랜드평판 키워드는 보험, GA, 금융 문맥이 없으면 대시보드 핵심 지표에서 제외합니다.",
    publishedAt: "상시",
    link: "#",
  },
];

export const periodData = {
  daily: {
    label: "일간",
    scope: "2026-05-31 08:00 기준",
    generatedAt: "2026-05-31 16:15",
    summary: {
      risk: "LOW",
      collected: 0,
      analyzed: 0,
      ownMentions: 0,
      ownNegative: 0,
      caution: 0,
      gaInsurance: 0,
      dispatchTime: "08:39",
      watchTime: "16:15",
      headline:
        "당사 직접 부정은 없습니다. 당사 언급 2건은 투자/공시성 주의 이슈로 분리하고, GA와 보험사 동향은 별도 추적합니다.",
    },
    issues: dailyIssues,
    categoryFlow: [
      { name: "GA/보험사", value: 109 },
      { name: "업계동향", value: 86 },
      { name: "정책/규제", value: 57 },
      { name: "당사", value: 2 },
      { name: "제외 후보", value: 34 },
    ],
    toneTrend: [
      { date: "05-27", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "05-28", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "05-29", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "05-30", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "05-31", positive: 0, negative: 0, caution: 0, neutral: 0 },
    ],
  },
  weekly: {
    label: "주간",
    scope: "2026-05-25 ~ 2026-05-31",
    generatedAt: "2026-05-31 16:15",
    summary: {
      risk: "LOW",
      collected: 0,
      analyzed: 0,
      ownMentions: 0,
      ownNegative: 0,
      caution: 0,
      gaInsurance: 0,
      dispatchTime: "월 07:00",
      watchTime: "5분 단위",
      headline:
        "주간 기준 당사 직접 부정은 제한적입니다. 정착지원금, 투자 의견, 수수료 규제는 주의 흐름으로 따로 봅니다.",
    },
    issues: [
      dailyIssues[0],
      dailyIssues[1],
      {
        tone: "주의",
        category: "업계",
        source: "보험저널",
        title: "GA 수수료 규제 시행 후 채널 경쟁 심화",
        summary: "정책 변화와 설계사 유치 경쟁이 함께 보도되는 주간 관찰 이슈입니다.",
        publishedAt: "목",
        link: "#",
      },
      dailyIssues[2],
    ],
    categoryFlow: [
      { name: "GA/보험사", value: 381 },
      { name: "업계동향", value: 294 },
      { name: "정책/규제", value: 167 },
      { name: "당사", value: 8 },
      { name: "제외 후보", value: 142 },
    ],
    toneTrend: [
      { date: "월", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "화", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "수", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "목", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "금", positive: 0, negative: 0, caution: 0, neutral: 0 },
    ],
  },
  monthly: {
    label: "월간",
    scope: "2026-05",
    generatedAt: "2026-05-31 16:15",
    summary: {
      risk: "LOW",
      collected: 0,
      analyzed: 0,
      ownMentions: 0,
      ownNegative: 0,
      caution: 0,
      gaInsurance: 0,
      dispatchTime: "매월 1일 07:00",
      watchTime: "5분 단위",
      headline:
        "월간 기준 당사 리스크는 관리 가능한 범위입니다. GA 채널, 수수료 규제, 보험사 동향, 투자성 보도를 분리해 누적 추적합니다.",
    },
    issues: [
      {
        tone: "주의",
        category: "당사",
        source: "월간",
        title: "시장성 보도와 투자 리스크 누적",
        summary: "월간 기준 시장/투자 관련 보도는 직접 부정과 분리해 추적합니다.",
        publishedAt: "5월",
        link: "#",
      },
      dailyIssues[1],
      dailyIssues[3],
      dailyIssues[4],
    ],
    categoryFlow: [
      { name: "GA/보험사", value: 1746 },
      { name: "업계동향", value: 1320 },
      { name: "정책/규제", value: 642 },
      { name: "당사", value: 31 },
      { name: "제외 후보", value: 508 },
    ],
    toneTrend: [
      { date: "1주", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "2주", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "3주", positive: 0, negative: 0, caution: 0, neutral: 0 },
      { date: "4주", positive: 0, negative: 0, caution: 0, neutral: 0 },
    ],
  },
};

export const monitoringFeed = [
  {
    time: "10:35",
    date: "2026-05-31",
    source: "보험저널",
    title: "보험사 상품 개정과 채널별 판매 전략 보도 증가",
    category: "보험사",
    tone: "중립",
    keyword: "보험사 동향",
    status: "분석 완료",
    link: "#",
  },
  {
    time: "10:04",
    date: "2026-05-31",
    source: "보험매일",
    title: "글로벌금융판매 GA 채널 리크루팅 동향",
    category: "GA",
    tone: "중립",
    keyword: "글로벌금융판매",
    status: "문맥 통과",
    link: "#",
  },
  {
    time: "09:18",
    date: "2026-05-31",
    source: "매일경제",
    title: "인카금융서비스 투자의견 조정 관련 증권 리포트 노출",
    category: "당사",
    tone: "주의",
    keyword: "인카금융서비스",
    status: "주의 관찰",
    link: "https://www.mk.co.kr/news/stock/12034143",
  },
  {
    time: "08:24",
    date: "2026-05-31",
    source: "중앙이코노미뉴스",
    title: "초대형 GA 정착지원금 공시 보도에 당사 순위 언급",
    category: "당사",
    tone: "주의",
    keyword: "인카금융서비스",
    status: "주의 관찰",
    link: "https://www.joongangenews.com/news/articleView.html?idxno=517653",
  },
  {
    time: "08:02",
    date: "2026-05-31",
    source: "자동 필터",
    title: "무관 산업 브랜드평판 기사 제외",
    category: "제외",
    tone: "제외",
    keyword: "브랜드평판",
    status: "노이즈",
    link: "#",
  },
  {
    time: "17:54",
    date: "2026-05-30",
    source: "뉴스1",
    title: "GA 업계 정착지원금 공시 체계 확대 논의",
    category: "정책/규제",
    tone: "중립",
    keyword: "정착지원금",
    status: "분석 완료",
    link: "#",
  },
  {
    time: "16:20",
    date: "2026-05-30",
    source: "보험신보",
    title: "대형 GA 설계사 채용 경쟁 재점화",
    category: "GA",
    tone: "중립",
    keyword: "GA 채용",
    status: "분석 완료",
    link: "#",
  },
  {
    time: "15:42",
    date: "2026-05-30",
    source: "한국경제",
    title: "보험 판매채널 수수료 개편안 후속 논의",
    category: "정책/규제",
    tone: "주의",
    keyword: "수수료 규제",
    status: "주의 관찰",
    link: "#",
  },
  {
    time: "14:58",
    date: "2026-05-30",
    source: "더벨",
    title: "상장 GA 밸류에이션 점검 기사 증가",
    category: "업계동향",
    tone: "중립",
    keyword: "상장 GA",
    status: "분석 완료",
    link: "#",
  },
  {
    time: "13:16",
    date: "2026-05-30",
    source: "파이낸셜뉴스",
    title: "보험사 제휴 GA 채널 확대 전략",
    category: "보험사",
    tone: "긍정",
    keyword: "제휴 GA",
    status: "우호 활용",
    link: "#",
  },
  {
    time: "11:47",
    date: "2026-05-30",
    source: "머니투데이",
    title: "금융소비자보호 기준 강화와 판매채널 점검",
    category: "정책/규제",
    tone: "주의",
    keyword: "소비자보호",
    status: "주의 관찰",
    link: "#",
  },
  {
    time: "10:11",
    date: "2026-05-30",
    source: "서울경제",
    title: "보험 플랫폼과 GA 제휴 경쟁",
    category: "GA",
    tone: "중립",
    keyword: "보험 플랫폼",
    status: "분석 완료",
    link: "#",
  },
];

export const sampleScraps = [
  monitoringFeed[2],
  monitoringFeed[3],
  monitoringFeed[7],
  monitoringFeed[10],
].map((item, index) => ({
  ...item,
  id: `sample-scrap-${index + 1}`,
  scrapedAt: `2026-05-${31 - index}`,
}));

export const watchJobs = [
  { label: "부정기사 감시", cadence: "24시간 · 5분", latest: "16:15", state: "정상" },
  { label: "일일보고 발송", cadence: "08 · 13 · 18시", latest: "13:50", state: "정상" },
  { label: "주간보고", cadence: "월요일 07시", latest: "대기", state: "예약" },
  { label: "월간보고", cadence: "매월 1일 07시", latest: "대기", state: "예약" },
  { label: "Supabase Cron", cadence: "5분 보조 백업", latest: "16:15", state: "정상" },
];

export const notificationHistory = [
  { time: "13:50", type: "일일 언론 동향", status: "성공", body: "13시 언론 동향 보고서 링크 발송 완료" },
  { time: "08:39", type: "일일 언론 동향", status: "성공", body: "08시 언론 동향 보고서 링크 발송 완료" },
  { time: "07:15", type: "Supabase Cron", status: "성공", body: "watchdog 호출 200 OK" },
  { time: "16:15", type: "부정기사 감시", status: "성공", body: "최근 검사 정상, 신규 부정 없음" },
];

export const pressInfluence = [
  { source: "보험저널", total: 46, own: 1, negative: 0, type: "보험 전문" },
  { source: "보험매일", total: 43, own: 0, negative: 0, type: "보험 전문" },
  { source: "더벨", total: 22, own: 0, negative: 1, type: "경제/금융" },
  { source: "한국경제", total: 21, own: 0, negative: 0, type: "경제지" },
  { source: "뉴스1", total: 19, own: 1, negative: 0, type: "종합" },
  { source: "보험신보", total: 19, own: 1, negative: 0, type: "보험 전문" },
  { source: "매일경제", total: 16, own: 1, negative: 0, type: "경제지" },
  { source: "중앙이코노미뉴스", total: 12, own: 1, negative: 0, type: "경제" },
];

export const keywordGroups = [
  { group: "당사", keywords: ["인카금융서비스", "인카금융", "에인카"], rule: "직접 언급 최우선" },
  { group: "GA", keywords: ["글로벌금융판매", "메가금융서비스", "GA 정착지원금"], rule: "보험/설계사 문맥 필수" },
  { group: "보험사", keywords: ["생명보험", "손해보험", "보험상품"], rule: "시장 동향 집계" },
  { group: "정책/규제", keywords: ["1200% 룰", "금융당국", "수수료 규제"], rule: "주의 관찰" },
  { group: "제외 후보", keywords: ["무관 브랜드평판", "메가 히트", "메가 런치"], rule: "문맥 미달 제외" },
];

export const pressRegistry = [
  "보험저널",
  "보험매일",
  "더벨",
  "한국경제",
  "뉴스1",
  "보험신보",
  "매일경제",
  "중앙이코노미뉴스",
  "대한금융신문",
  "파이낸셜뉴스",
  "이데일리",
  "아시아경제",
  "연합인포맥스",
  "데일리안",
  "머니투데이",
  "서울경제",
  "디지털타임스",
  "비즈니스포스트",
];

export const journalistRows = [
  { name: "김민수", outlet: "보험저널", beat: "GA/보험", recent: 12, status: "우호", memo: "정책 기사 반응 빠름" },
  { name: "박지현", outlet: "보험매일", beat: "보험사", recent: 9, status: "중립", memo: "보험사 채널 보도 다수" },
  { name: "이서윤", outlet: "더벨", beat: "금융/자본시장", recent: 5, status: "주의", memo: "투자성 기사 확인 필요" },
  { name: "정도윤", outlet: "매일경제", beat: "증권", recent: 4, status: "중립", memo: "리포트 인용 기사" },
  { name: "최하나", outlet: "한국경제", beat: "금융정책", recent: 4, status: "중립", memo: "정책/규제 보도" },
  { name: "윤태경", outlet: "뉴스1", beat: "금융", recent: 3, status: "우호", memo: "종합 뉴스 follow-up" },
];

export const adRows = [
  { month: "2026-03", media: "보험저널", amount: 3200000, type: "광고", memo: "브랜드 캠페인" },
  { month: "2026-04", media: "보험매일", amount: 2800000, type: "광고", memo: "채용 캠페인" },
  { month: "2026-05", media: "경제지 패키지", amount: 5600000, type: "광고", memo: "기획 패키지" },
  { month: "2026-05", media: "보험신보", amount: 1500000, type: "협찬", memo: "행사 협찬" },
  { month: "2026-05", media: "파이낸셜뉴스", amount: 2200000, type: "광고", memo: "디지털 배너" },
];

export const contextRules = [
  {
    label: "부정",
    body: "사기, 불법, 제재, 고객 피해, 개인정보, 금융사고처럼 즉시 대응이 필요한 직접 리스크",
    action: "알림톡 + 대응센터",
  },
  {
    label: "주의",
    body: "투자의견 하향, 정착지원금, 수수료 규제, 시장 비교처럼 직접 부정은 아니지만 관찰이 필요한 신호",
    action: "대시보드 관찰",
  },
  {
    label: "중립",
    body: "단순 언급, 시장 동향, 일반 공시, 반복 동향 기사",
    action: "기록",
  },
  {
    label: "제외",
    body: "무관 산업 브랜드평판, 메가 이벤트/런치처럼 키워드만 맞고 문맥이 없는 기사",
    action: "수집 제외",
  },
];
