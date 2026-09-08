"""Provider-independent prompt and summary text helpers."""

from __future__ import annotations

import re

SUMMARY_QUALITY_RULES = """
공통 품질 기준:
- 기사 제목을 그대로 반복하지 말고 본문에서 확인되는 핵심 사실을 요약한다.
- 기자명, 언론사 상투 문구, "기사 열기", 분류 라벨, 대응 제안 문구를 쓰지 않는다.
- "당사 직접 언급 기사입니다", "평판 영향 확인이 필요합니다", "우호 보도로 활용 가능합니다" 같은 운영 문구를 쓰지 않는다.
- 당사가 직접 언급되지 않은 기사는 당사 긍정이나 당사 부정으로 표현하지 않고 업계/정책/경쟁 동향으로만 정리한다.
- 주가 하락, 투자의견 하향, 규제, 소송, 민원, 소비자 피해는 주체와 사실관계를 명확히 쓰되 과장하지 않는다.
- "강력히", "충격", "논란" 같은 감정적 단어는 원문 제목에 있더라도 본문 요약에서는 사실 중심으로 순화한다.
- 문장은 완결형으로 쓰고, 1문장은 45~95자 안에서 마침표로 끝낸다.
""".strip()


def clean_prompt_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("&nbsp;", " ").replace("&amp;nbsp;", " ")
    text = text.replace("&quot;", '"').replace("&#39;", "'")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"^\s*[\[［(【]?[가-힣A-Za-z0-9_.-]{2,20}\s*=\s*[가-힣]{2,6}\s*기자[\]］)】]?\s*", "", text)
    text = re.sub(r"^\s*[\[［(【]?[^\]］)】\n]{2,30}\s+기자[\]］)】]?\s*", "", text)
    text = re.sub(r"\b기사\s*열기\b", " ", text)
    text = re.sub(r"\b원문\s*기사\s*보기\b", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_issue_summary(value: object) -> str:
    text = clean_prompt_text(value)
    text = text.strip("\"'` ")
    text = re.sub(r"^(요약|이슈|핵심|정리)\s*[:：-]\s*", "", text)
    text = re.sub(r"^[\-•]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    if not text:
        return ""
    forbidden = (
        "당사 직접 언급 기사입니다",
        "평판 영향",
        "우호 보도",
        "홍보 자산",
        "확인이 필요",
        "확인합니다",
        "관찰합니다",
        "추적합니다",
        "보고서에 포함",
        "별도 추적",
        "정책·감독 이슈로",
    )
    if any(term in text for term in forbidden):
        return ""

    lines = [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]
    text = lines[0] if lines else text
    sentence = re.split(r"(?<=[.!?。])\s+", text)[0].strip()
    if sentence:
        text = sentence

    text = remove_action_or_judgment_tail(text)
    text = normalize_risk_claim_wording(text)
    if len(text) < 18:
        return ""
    if len(text) > 120:
        text = text[:120].rstrip()
    if not re.search(r"[.!?。]$", text):
        text += "."
    return text


def normalize_risk_claim_wording(text: str) -> str:
    if not text:
        return ""
    if "인카" in text and ("가로챈" in text or ("가로" in text and "밝혀" in text)):
        return "인카금융 관련 보험 대리점 관리 부실 논란이 제기됐다"
    if "인카" in text and "투자의견" in text and ("하향" in text or "낮아" in text):
        return "인카금융서비스의 투자의견 하향 보도가 나왔다"
    if "금감원" in text and "인카" in text and ("전격 점검" in text or "이직 보따리" in text or "ga" in text.lower()):
        return "금감원이 인카금융서비스 등 GA 정착지원금 지급 실태를 점검했다"
    text = re.sub(r"(.+?)(?:이|가)\s*문제가 되고 있다\.?$", r"\1 논란이 제기됐다", text)
    text = re.sub(r"(.+?)이\s*밝혀졌다\.?$", r"\1 관련 논란이 제기됐다", text)
    return text.strip()


def remove_action_or_judgment_tail(text: str) -> str:
    patterns = (
        r"\s*확인이 필요.*$",
        r"\s*검토가 필요.*$",
        r"\s*주의가 필요.*$",
        r"\s*모니터링이 필요.*$",
        r"\s*추적이 필요.*$",
        r"\s*리스크로.*$",
    )
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned)
    return cleaned.strip(" .")


def build_issue_prompt(articles: list[dict]) -> str:
    rows = []
    for index, article in enumerate(articles[: 5], 1):
        title = clean_prompt_text(article.get("title", ""))[:110]
        source = clean_prompt_text(article.get("source", ""))[:28]
        category = clean_prompt_text(article.get("_category", article.get("category", "")))[:16]
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))[:16]
        summary = clean_prompt_text(article.get("summary", "") or article.get("description", ""))[:180]
        rows.append(f"{index}. {source} | {category}/{tone} | {title}\nsummary: {summary}")

    return (
        "다음 관련 기사 묶음의 핵심 이슈를 한국어 한 문장으로 요약하세요.\n"
        "제목을 그대로 반복하지 말고, 무엇이 보도됐는지만 말하세요.\n"
        "판단/대응/위험평가/출처/날짜는 쓰지 마세요.\n"
        f"{SUMMARY_QUALITY_RULES}\n\n"
        + "\n".join(rows)
    )

