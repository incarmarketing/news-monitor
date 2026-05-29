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
  const maxOutputTokens = Number(Deno.env.get("GEMINI_MAX_OUTPUT_TOKENS") || "5200") || 5200;

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
              "모든 핵심 판단에는 기사 번호 근거를 붙이세요. 예: [1], [2][5].",
              "제공 기사만으로 판단하기 어려운 내용은 '근거 부족'이라고 쓰세요.",
              "Markdown 제목 기호(#), 굵게 표시(**), 긴 장식선은 쓰지 마세요.",
              "문장은 짧고 보고서형으로 작성하되, 단순 요약이 아니라 판단과 활용 포인트를 제시하세요.",
            ].join("\n"),
          }],
        },
        contents: [{ role: "user", parts: [{ text: buildPrompt(prompt, compactArticles) }] }],
        generationConfig: {
          temperature: 0.18,
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
  const analysis = extractText(data);
  if (!analysis) {
    return jsonResponse({ error: "empty_gemini_response" }, 502);
  }

  return jsonResponse({
    ok: true,
    analysis,
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
    "작성 방식:",
    "1. 먼저 기사별 사실을 내부적으로 정리한 뒤, 사용자 요청 관점에 맞춰 종합 판단을 작성하세요.",
    "2. 단순히 기사 목록을 다시 나열하지 말고, 공통 흐름과 차이를 구분하세요.",
    "3. 긍정/부정/중립 논조가 섞여 있으면 왜 그렇게 판단했는지 근거 기사 번호를 붙이세요.",
    "4. 회사 대응 또는 활용 방향은 실행 가능한 문장으로 쓰세요.",
    "5. 링크 주소를 본문에 길게 쓰지 말고, 근거 기사 번호로만 인용하세요.",
    "",
    "출력 형식:",
    "분석 관점",
    "- 사용자의 요청을 한 문장으로 재정의",
    "",
    "핵심 판단",
    "- 2~4개 bullet. 각 bullet 끝에 근거 기사 번호 포함",
    "",
    "주요 이슈",
    "- 이슈별로 제목 / 판단 / 근거 기사 번호 구성",
    "",
    "리스크와 기회",
    "- 리스크와 기회를 분리해 작성",
    "",
    "실무 활용 제안",
    "- 임원 보고, 홍보 대응, 추가 모니터링 중 필요한 조치 중심",
    "",
    "근거 기사",
    "- 가장 중요한 기사 5건 이내를 기사 번호, 언론사, 제목으로 정리",
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
