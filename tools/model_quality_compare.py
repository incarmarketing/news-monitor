"""Compare Gemini and Groq issue-summary quality on fixed monitoring cases.

This smoke test is intentionally small. It uses the same prompt builder and
cleanup path that the dashboard issue summaries use, then writes a markdown and
JSON artifact that can be inspected after a GitHub Actions run.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import google.generativeai as genai

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import ai_fallback
import config
import gemini_helper
import groq_helper

KST = timezone(timedelta(hours=9))

FORBIDDEN_TERMS = (
    "당사 직접 언급 기사",
    "평판 영향",
    "우호 보도",
    "홍보 자산",
    "확인이 필요",
    "확인합니다",
    "관찰합니다",
    "추적합니다",
    "보고서에 포함",
    "기사 열기",
    "기자",
)


SAMPLES = [
    {
        "id": "own_positive_certified_planners",
        "label": "당사 성과 보도",
        "expected_terms": ("우수인증설계사", "2262", "GA"),
        "articles": [
            {
                "title": "인카금융서비스, 우수인증설계사 2262명 배출…GA업계 최다 기록",
                "source": "보험매일",
                "keyword": "인카금융서비스",
                "category": "당사",
                "tone": "긍정",
                "summary": "인카금융서비스가 2026년 우수인증설계사 2262명을 배출하며 GA업계 최다 규모를 기록했다. 회사는 교육과 내부통제 체계를 기반으로 완전판매 역량을 강화하고 있다고 밝혔다.",
            },
            {
                "title": "인카금융서비스, 우수인증설계사 배출 규모 확대",
                "source": "뉴스투데이",
                "keyword": "인카금융서비스",
                "category": "당사",
                "tone": "긍정",
                "summary": "인카금융서비스의 우수인증설계사 배출 규모가 늘며 영업조직의 전문성과 계약관리 역량이 부각됐다.",
            },
        ],
    },
    {
        "id": "own_stock_caution",
        "label": "당사 주가 주의",
        "expected_terms": ("인카금융서비스", "주가", "하락"),
        "articles": [
            {
                "title": "[52주]최고가 25개, 최저가 556개.. 코스피 8600 돌파",
                "source": "아이투자",
                "keyword": "인카금융서비스",
                "category": "당사",
                "tone": "주의",
                "summary": "인카금융서비스 주가는 9330원으로 전일 대비 2.4% 하락하며 52주 저가권 종목 목록에 포함됐다. 기사에는 지수 상승과 개별 종목 약세가 함께 정리됐다.",
            }
        ],
    },
    {
        "id": "industry_1200_rule",
        "label": "업계 규제/주의",
        "expected_terms": ("1200%룰", "정착지원금", "GA"),
        "articles": [
            {
                "title": "설계사 쟁탈전에 소비자 피해 불똥…'1200%룰' 앞두고 보험업계 긴장",
                "source": "뉴시스",
                "keyword": "1200%룰",
                "category": "GA",
                "tone": "주의",
                "summary": "7월 1200%룰 시행을 앞두고 주요 GA의 설계사 영입 경쟁과 정착지원금 지급이 확대됐다. 기사에는 인카금융서비스 등 상위 GA의 정착지원금 증가와 부당승환 민원 확대 우려가 함께 언급됐다.",
            }
        ],
    },
    {
        "id": "social_contribution_neutral",
        "label": "사회공헌 중립",
        "expected_terms": ("전세사기", "피해", "지원"),
        "articles": [
            {
                "title": "생명보험사회공헌위, 전세사기 피해 청년 위해 1억원 지원",
                "source": "한국보험신문",
                "keyword": "전세사기",
                "category": "업계동향",
                "tone": "중립",
                "summary": "생명보험사회공헌위원회가 전세사기 피해 청년의 주거 안정을 돕기 위해 1억원 규모의 지원 사업을 진행한다. 금융취약계층 보호와 사회공헌 활동을 다룬 ESG 성격의 보도다.",
            }
        ],
    },
    {
        "id": "unrelated_policy",
        "label": "당사 미언급 정책",
        "expected_terms": ("기업공시", "설명회", "상법"),
        "articles": [
            {
                "title": "금감원, 찾아가는 기업공시 설명회 개최…개정 상법·공시제도 집중 안내",
                "source": "아주경제",
                "keyword": "공시",
                "category": "정책/규제",
                "tone": "중립",
                "summary": "금융감독원이 기업공시 담당자를 대상으로 개정 상법과 공시제도 설명회를 연다. 기사에는 인카금융서비스 직접 언급 없이 상장사 공시 실무 안내 내용이 담겼다.",
            }
        ],
    },
]


def main() -> None:
    output_dir = Path(os.getenv("MODEL_QUALITY_OUTPUT_DIR", "artifacts/model-quality-compare"))
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    strict_mode = os.getenv("MODEL_QUALITY_STRICT", "0").strip().lower() in {"1", "true", "yes"}

    results = []
    for sample in SAMPLES:
        articles = sample["articles"]
        gemini_result = summarize_with_gemini(articles)
        groq_result = summarize_with_groq(articles)
        results.append(
            {
                "id": sample["id"],
                "label": sample["label"],
                "expected_terms": list(sample["expected_terms"]),
                "gemini": evaluate_provider_result(gemini_result, sample),
                "groq": evaluate_provider_result(groq_result, sample),
                "input_titles": [article["title"] for article in articles],
            }
        )

    payload = {
        "generated_at": generated_at,
        "strict_mode": strict_mode,
        "gemini_model": os.getenv("GEMINI_MODEL", config.GEMINI_MODEL),
        "groq_model": os.getenv("GROQ_ISSUE_MODEL") or os.getenv("GROQ_MODEL", ""),
        "case_count": len(results),
        "results": results,
        "overall": {
            "gemini_pass": sum(1 for item in results if item["gemini"]["passed"]),
            "groq_pass": sum(1 for item in results if item["groq"]["passed"]),
            "groq_rate_limited": sum(1 for item in results if item["groq"].get("status") == "rate_limited"),
        },
    }

    (output_dir / "model_quality_compare.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    markdown = render_markdown(payload)
    (output_dir / "model_quality_compare.md").write_text(markdown, encoding="utf-8")
    print(markdown)

    failed = [
        f"{item['label']}:{provider}"
        for item in results
        for provider in ("gemini", "groq")
        if not item[provider]["passed"]
    ]
    if strict_mode and failed:
        print("Model quality compare failed:", ", ".join(failed), file=sys.stderr)
        raise SystemExit(1)


def summarize_with_gemini(articles: list[dict]) -> dict:
    prompt = groq_helper.build_issue_prompt(articles)
    full_prompt = f"{ai_fallback.ISSUE_SYSTEM_PROMPT}\n\n{prompt}"
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return provider_payload("gemini", "gemini_key_missing", model=os.getenv("GEMINI_MODEL", ""))

    ai_fallback.configure_gemini(api_key)
    attempts: list[dict] = []
    for model_name in gemini_helper.model_candidates():
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                full_prompt,
                generation_config={"max_output_tokens": 180, "temperature": 0.1},
                request_options=gemini_helper.request_options(),
            )
            raw_text, extraction_error, metadata = extract_gemini_text(response)
            summary = groq_helper.clean_issue_summary(raw_text)
            status = "ok" if summary else ("raw_rejected" if raw_text else "empty")
            return provider_payload(
                "gemini",
                status,
                model=model_name,
                raw=raw_text,
                summary=summary,
                extraction_error=extraction_error,
                metadata=metadata,
            )
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            attempts.append({"model": model_name, "error": gemini_helper.error_summary(exc)})
            if gemini_helper.is_quota_error(exc):
                return provider_payload(
                    "gemini",
                    "quota_or_rate_limit",
                    model=model_name,
                    error=gemini_helper.error_summary(exc),
                    attempts=attempts,
                )

    return provider_payload("gemini", "failed", error="all model candidates failed", attempts=attempts)


def summarize_with_groq(articles: list[dict]) -> dict:
    if not groq_helper.is_enabled():
        return provider_payload("groq", "groq_key_missing", model=os.getenv("GROQ_ISSUE_MODEL", ""))

    model_name = os.getenv("GROQ_ISSUE_MODEL", config.GROQ_MODEL)
    raw_text = groq_helper.chat_completion(
        [
            {"role": "system", "content": groq_helper.ISSUE_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": groq_helper.build_issue_prompt(articles)},
        ],
        max_tokens=int(os.getenv("GROQ_ISSUE_MAX_TOKENS", "90")),
        temperature=0.1,
        retries=1,
        purpose="model_quality_compare",
        model=model_name,
    )
    summary = groq_helper.clean_issue_summary(raw_text)
    rate_limit = groq_helper.rate_limit_status()
    status = "ok" if summary else ("rate_limited" if is_groq_rate_limited(rate_limit) else "raw_rejected" if raw_text else "empty")
    return provider_payload(
        "groq",
        status,
        model=model_name,
        raw=raw_text,
        summary=summary,
        rate_limit=rate_limit,
    )


def provider_payload(
    provider: str,
    status: str,
    *,
    model: str = "",
    raw: str = "",
    summary: str = "",
    error: str = "",
    extraction_error: str = "",
    attempts: list[dict] | None = None,
    metadata: dict | None = None,
    rate_limit: dict | None = None,
) -> dict:
    return {
        "provider": provider,
        "status": status,
        "model": model,
        "raw": raw,
        "summary": summary,
        "error": error,
        "extraction_error": extraction_error,
        "attempts": attempts or [],
        "metadata": metadata or {},
        "rate_limit": rate_limit or {},
    }


def extract_gemini_text(response: object) -> tuple[str, str, dict]:
    extraction_error = ""
    try:
        text = str(getattr(response, "text", "") or "").strip()
        if text:
            return text, "", gemini_response_metadata(response)
    except Exception as exc:
        extraction_error = gemini_helper.error_summary(exc)

    parts: list[str] = []
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            value = getattr(part, "text", "")
            if value:
                parts.append(str(value))
    return "\n".join(parts).strip(), extraction_error, gemini_response_metadata(response)


def gemini_response_metadata(response: object) -> dict:
    candidates = []
    for candidate in getattr(response, "candidates", []) or []:
        candidates.append(
            {
                "finish_reason": str(getattr(candidate, "finish_reason", "") or ""),
                "safety_ratings": str(getattr(candidate, "safety_ratings", "") or "")[:240],
            }
        )
    return {
        "prompt_feedback": str(getattr(response, "prompt_feedback", "") or "")[:240],
        "candidates": candidates[:2],
    }


def is_groq_rate_limited(rate_limit: dict) -> bool:
    if not rate_limit:
        return False
    status = str(rate_limit.get("status", ""))
    return status == "429" or bool(rate_limit.get("daily_limit_tokens"))


def evaluate_provider_result(result: dict, sample: dict) -> dict:
    evaluated = evaluate_summary(result.get("summary", ""), sample)
    evaluated.update(
        {
            "provider": result.get("provider", ""),
            "status": result.get("status", ""),
            "model": result.get("model", ""),
            "raw_preview": preview_text(result.get("raw", "")),
            "error": result.get("error", ""),
            "extraction_error": result.get("extraction_error", ""),
            "attempts": result.get("attempts", []),
            "metadata": result.get("metadata", {}),
            "rate_limit": result.get("rate_limit", {}),
        }
    )
    return evaluated


def evaluate_summary(summary: str, sample: dict) -> dict:
    text = groq_helper.clean_prompt_text(summary)
    checks = {
        "non_empty": bool(text),
        "length": 24 <= len(text) <= 135,
        "complete_sentence": bool(re.search(r"[.!?。]$", text)),
        "no_forbidden_terms": not any(term in text for term in FORBIDDEN_TERMS),
        "expected_context": any(term in text for term in sample["expected_terms"]),
        "not_title_copy": not looks_like_title_copy(text, sample["articles"]),
    }
    return {
        "summary": text,
        "checks": checks,
        "passed": all(checks.values()),
    }


def looks_like_title_copy(summary: str, articles: list[dict]) -> bool:
    summary_key = normalize_text(summary)
    if not summary_key:
        return False
    for article in articles:
        title_key = normalize_text(article.get("title", ""))
        if title_key and (summary_key.startswith(title_key[: min(28, len(title_key))]) or title_key in summary_key):
            return True
    return False


def normalize_text(value: object) -> str:
    return re.sub(r"\W+", "", str(value or "").lower())


def preview_text(value: object, limit: int = 180) -> str:
    text = groq_helper.clean_prompt_text(value)
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def render_markdown(payload: dict) -> str:
    lines = [
        "# Model Quality Compare",
        "",
        f"- 생성: {payload['generated_at']}",
        f"- Strict mode: {'on' if payload.get('strict_mode') else 'off'}",
        f"- Gemini 모델: {payload.get('gemini_model') or '-'}",
        f"- Groq 모델: {payload.get('groq_model') or '-'}",
        f"- Gemini 통과: {payload['overall']['gemini_pass']}/{payload['case_count']}",
        f"- Groq 통과: {payload['overall']['groq_pass']}/{payload['case_count']}",
        f"- Groq rate limit: {payload['overall'].get('groq_rate_limited', 0)}건",
        "",
        "| 케이스 | Gemini 상태 | Gemini 요약 | Groq 상태 | Groq 요약 | 판정 |",
        "|---|---|---|---|---|---|",
    ]
    for item in payload["results"]:
        gemini = item["gemini"]
        groq = item["groq"]
        verdict = "OK" if gemini["passed"] and groq["passed"] else "CHECK"
        lines.append(
            "| {label} | {gemini_status} | {gemini} | {groq_status} | {groq} | {verdict} |".format(
                label=escape_cell(item["label"]),
                gemini_status=escape_cell(gemini.get("status") or "-"),
                gemini=escape_cell(gemini["summary"] or "(empty)"),
                groq_status=escape_cell(groq.get("status") or "-"),
                groq=escape_cell(groq["summary"] or "(empty)"),
                verdict=verdict,
            )
        )
    lines.append("")
    lines.append("## Detailed Checks")
    for item in payload["results"]:
        lines.append(f"### {item['label']}")
        for provider in ("gemini", "groq"):
            result = item[provider]
            failed = [name for name, ok in result["checks"].items() if not ok]
            lines.append(
                f"- {provider}: {'PASS' if result['passed'] else 'FAIL'} "
                f"/ status={result.get('status') or '-'} / failed={failed or '-'}"
            )
            if result.get("raw_preview"):
                lines.append(f"  - raw: {escape_cell(result['raw_preview'])}")
            if result.get("error"):
                lines.append(f"  - error: {escape_cell(result['error'])}")
            if result.get("extraction_error"):
                lines.append(f"  - extraction: {escape_cell(result['extraction_error'])}")
            rate_limit = result.get("rate_limit") or {}
            if rate_limit:
                brief_rate_limit = {
                    key: rate_limit.get(key)
                    for key in ("status", "daily_limit_tokens", "daily_used_tokens", "daily_requested_tokens", "retry_after")
                    if rate_limit.get(key)
                }
                lines.append(f"  - rate_limit: {escape_cell(json.dumps(brief_rate_limit, ensure_ascii=False))}")
    return "\n".join(lines)


def escape_cell(value: str) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


if __name__ == "__main__":
    main()
