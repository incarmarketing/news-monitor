const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScrapArticle = {
  title?: string;
  summary?: string;
  press?: string;
  date?: string;
  published_label?: string;
  link?: string;
  keyword?: string;
  category_label?: string;
  tone_label?: string;
  risk?: string;
};

type AnalyzeScrapsRequest = {
  prompt?: string;
  articles?: ScrapArticle[];
};

type ReportItem = {
  title?: string;
  body?: string;
  evidence?: number[];
};

type ScrapReport = {
  title?: string;
  subtitle?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  executiveSummary?: string;
  keyFindings?: ReportItem[];
  risks?: ReportItem[];
  opportunities?: ReportItem[];
  followUps?: string[];
  evidenceArticles?: Array<{
    no?: number;
    press?: string;
    title?: string;
    summary?: string;
    tone?: string;
    link?: string;
  }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!isAllowedApiKey(req.headers.get("apikey"))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "missing_gemini_api_key" }, 500);
  }

  const body = await safeJson<AnalyzeScrapsRequest>(req);
  const prompt = String(body.prompt || "").trim()
    || "스크랩 기사들을 기준으로 핵심 이슈, 리스크, 활용 포인트를 분석해줘.";
  const articles = Array.isArray(body.articles) ? body.articles : [];

  if (!articles.length) {
    return jsonResponse({ error: "missing_articles" }, 400);
  }

  const compactArticles = articles.slice(0, 40).map(compactArticle);
  const model = "gemini-2.5-pro";
  const maxOutputTokens = Number(Deno.env.get("GEMINI_MAX_OUTPUT_TOKENS") || "6200") || 6200;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "당신은 보험/GA 업계 언론 모니터링 자료를 임원 보고 수준으로 분석하는 한국어 PR 애널리스트입니다.",
              "반드시 사용자가 제공한 스크랩 기사만 근거로 삼고, 추정과 사실을 분리하세요.",
              "모든 핵심 판단에는 기사 번호 근거를 evidence 배열로 남기세요.",
              "제공 기사만으로 판단하기 어려운 내용은 '근거 부족'이라고 쓰세요.",
              "반드시 유효한 JSON 객체 하나만 출력하세요. Markdown, 코드블록, 설명 문장을 JSON 밖에 쓰지 마세요.",
            ].join("\n"),
          }],
        },
        contents: [{ role: "user", parts: [{ text: buildPrompt(prompt, compactArticles) }] }],
        generationConfig: {
          temperature: 0.16,
          maxOutputTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: "gemini_request_failed", status: response.status, detail }, 502);
  }

  const data = await response.json();
  const rawText = extractText(data);
  if (!rawText) {
    return jsonResponse({ error: "empty_gemini_response" }, 502);
  }

  const parsed = parseJsonObject(rawText);
  const report = normalizeReport(parsed, prompt, compactArticles);
  const analysis = reportToText(report);

  return jsonResponse({
    ok: true,
    analysis,
    report,
    raw: parsed ? undefined : rawText,
    model,
    articleCount: compactArticles.length,
    finishReason: data?.candidates?.[0]?.finishReason || "",
  });
});

function compactArticle(article: ScrapArticle, index: number) {
  return {
    no: index + 1,
    title: limitText(article.title, 180),
    summary: limitText(article.summary, 420),
    press: limitText(article.press, 50),
    date: limitText(article.published_label || article.date, 40),
    keyword: limitText(article.keyword, 60),
    category: limitText(article.category_label, 40),
    tone: limitText(article.tone_label, 30),
    risk: limitText(article.risk, 20),
    link: limitText(article.link, 220),
  };
}

function buildPrompt(userPrompt: string, articles: ReturnType<typeof compactArticle>[]) {
  const articleLines = articles.map((article) => [
    `[${article.no}]`,
    `언론사: ${article.press || "미확인"}`,
    `일시: ${article.date || "-"}`,
    `제목: ${article.title || "제목 없음"}`,
    `요약: ${article.summary || "요약 없음"}`,
    `분류/논조/키워드: ${article.category || "-"} / ${article.tone || "-"} / ${article.keyword || "-"}`,
    `링크: ${article.link || "-"}`,
  ].join("\n")).join("\n\n");

  return [
    "사용자 분석 요청:",
    userPrompt,
    "",
    "분석 대상 스크랩 기사:",
    articleLines,
    "",
    "출력 JSON 스키마:",
    "{",
    '  "title": "스크랩 기사 분석 보고서",',
    '  "subtitle": "사용자 요청을 한 문장으로 재정의",',
    '  "riskLevel": "LOW 또는 MEDIUM 또는 HIGH",',
    '  "executiveSummary": "임원 보고용 핵심 요약 2~4문장",',
    '  "keyFindings": [{"title": "핵심 판단 제목", "body": "판단 내용", "evidence": [1,2]}],',
    '  "risks": [{"title": "리스크 제목", "body": "리스크 내용", "evidence": [1]}],',
    '  "opportunities": [{"title": "활용 기회 제목", "body": "기회 내용", "evidence": [2]}],',
    '  "followUps": ["후속 확인 또는 실행 항목"],',
    '  "evidenceArticles": [{"no": 1, "press": "언론사", "title": "기사 제목", "summary": "한 문장 요약", "tone": "논조", "link": "링크"}]',
    "}",
    "",
    "작성 조건:",
    "- JSON 외 텍스트 금지",
    "- 기사 제목과 요약을 근거 기사에 반드시 포함",
    "- 링크는 evidenceArticles에만 넣고, 긴 URL을 본문 문장에 쓰지 않음",
    "- keyFindings, risks, opportunities는 각각 2~4개 이내",
    "- followUps는 3~5개",
    "- evidenceArticles는 가장 중요한 기사 5건 이내",
    "- 모든 판단은 evidence 번호가 있어야 함",
    "- 과장 표현 금지, 근거 부족 시 명시",
  ].join("\n");
}

function parseJsonObject(text: string): ScrapReport | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeReport(input: ScrapReport | null, prompt: string, articles: ReturnType<typeof compactArticle>[]): Required<ScrapReport> {
  const negativeCount = articles.filter((article) => /부정|negative|risk/i.test(`${article.tone} ${article.risk}`)).length;
  const ownCount = articles.filter((article) => /당사|인카/.test(`${article.category} ${article.title} ${article.summary}`)).length;
  const fallbackRisk = negativeCount >= 2 ? "MEDIUM" : negativeCount ? "LOW" : "LOW";
  const report = input || {};
  const evidenceArticles = normalizeEvidence(report.evidenceArticles, articles);
  const summary = limitText(
    report.executiveSummary || `스크랩 ${articles.length}건 기준으로 당사 관련 ${ownCount}건, 부정 논조 ${negativeCount}건이 확인됐습니다.`,
    520,
  );
  return {
    title: limitText(report.title || "스크랩 기사 분석 보고서", 80),
    subtitle: limitText(report.subtitle || prompt, 140),
    riskLevel: normalizeRisk(report.riskLevel, fallbackRisk),
    executiveSummary: summary,
    keyFindings: normalizeItems(report.keyFindings, articles, "핵심 판단"),
    risks: normalizeItems(report.risks, articles, "리스크"),
    opportunities: normalizeItems(report.opportunities, articles, "활용 포인트"),
    followUps: normalizeFollowUps(report.followUps, negativeCount),
    evidenceArticles,
  };
}

function normalizeItems(items: ReportItem[] | undefined, articles: ReturnType<typeof compactArticle>[], label: string): ReportItem[] {
  const rows = Array.isArray(items) ? items : [];
  const normalized = rows.slice(0, 4).map((item, index) => ({
    title: limitText(item?.title || `${label} ${index + 1}`, 70),
    body: limitText(item?.body || "근거 기사 확인이 필요합니다.", 300),
    evidence: normalizeEvidenceNumbers(item?.evidence, articles.length),
  }));
  if (normalized.length) return normalized;
  return [{
    title: `${label} 확인`,
    body: "스크랩 기사 간 공통 흐름과 사실관계 확인이 필요합니다.",
    evidence: articles[0] ? [1] : [],
  }];
}

function normalizeEvidence(rows: ScrapReport["evidenceArticles"], articles: ReturnType<typeof compactArticle>[]) {
  const source = Array.isArray(rows) && rows.length ? rows : articles.slice(0, 5).map((article) => ({
    no: article.no,
    press: article.press,
    title: article.title,
    summary: article.summary,
    tone: article.tone,
    link: article.link,
  }));
  return source.slice(0, 5).map((article, index) => ({
    no: Number(article?.no) || index + 1,
    press: limitText(article?.press, 50),
    title: limitText(article?.title, 160),
    summary: limitText(article?.summary, 260),
    tone: limitText(article?.tone, 30),
    link: limitText(article?.link, 220),
  }));
}

function normalizeEvidenceNumbers(values: unknown, max: number) {
  const numbers = Array.isArray(values) ? values : [];
  return numbers
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= max)
    .slice(0, 4);
}

function normalizeFollowUps(items: string[] | undefined, negativeCount: number) {
  const rows = Array.isArray(items) ? items.map((item) => limitText(item, 120)).filter(Boolean) : [];
  if (rows.length) return rows.slice(0, 5);
  return [
    negativeCount ? "부정 논조 기사 원문과 사실관계를 우선 확인" : "주요 기사 원문과 반복 보도 여부 확인",
    "동일 이슈 후속 보도 및 관련 키워드 추가 모니터링",
    "임원 보고 또는 유관부서 공유가 필요한 쟁점 선별",
  ];
}

function normalizeRisk(value: unknown, fallback: "LOW" | "MEDIUM" | "HIGH") {
  const risk = String(value || "").toUpperCase();
  return risk === "HIGH" || risk === "MEDIUM" || risk === "LOW" ? risk : fallback;
}

function reportToText(report: Required<ScrapReport>) {
  const section = (title: string, items: ReportItem[]) => [
    title,
    ...items.map((item) => `- ${item.title}: ${item.body}${item.evidence?.length ? ` [${item.evidence.join(", ")}]` : ""}`),
  ].join("\n");
  return [
    report.title,
    `리스크 레벨: ${report.riskLevel}`,
    "",
    "핵심 요약",
    report.executiveSummary,
    "",
    section("핵심 판단", report.keyFindings),
    "",
    section("리스크", report.risks),
    "",
    section("활용 포인트", report.opportunities),
    "",
    "후속 확인",
    ...report.followUps.map((item) => `- ${item}`),
    "",
    "근거 기사",
    ...report.evidenceArticles.map((article) => `- [${article.no}] ${article.press}: ${article.title}`),
  ].join("\n");
}

function limitText(value: unknown, max: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function extractText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text || "").join("\n").trim();
}

async function safeJson<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    return {} as T;
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = [
    Deno.env.get("PUBLIC_SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ].filter(Boolean);
  return allowed.includes(apiKey);
}
