"""Generate a compact Korean daily monitoring report and save it as printable HTML."""

from __future__ import annotations

import html
import json
import os
import re
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

import analyzer
import archiver
import config
import report_window

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()
console = Console()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_RECIPIENTS = [e.strip() for e in os.getenv("EMAIL_RECIPIENTS", "").split(",") if e.strip()]

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
KST = timezone(timedelta(hours=9))

CATEGORY_LABELS = {
    "own": "당사",
    "regulation": "규제",
    "competitor": "경쟁",
    "industry": "업계",
    "other": "기타",
}

TONE_LABELS = {
    "negative": "부정",
    "positive": "긍정",
    "neutral": "중립",
}


def run_briefing(articles: list[dict]) -> Path:
    console.print("\n[cyan]분석 단계: 스코어링 / 카테고리화 / 유사 기사 묶기[/]")
    clustered, metrics = analyzer.analyze(articles, top_n=config.TOP_N_FOR_BRIEFING)
    assign_report_ids(clustered)
    yesterday = archiver.load_yesterday()

    risk_color = {"HIGH": "red", "MEDIUM": "yellow", "LOW": "green"}.get(metrics["risk_level"], "green")
    market_count = metrics["by_category"]["competitor"] + metrics["by_category"]["industry"]
    own_tone = metrics.get("own_by_tone", {})
    console.print(
        f"  수집 {metrics['total_collected']}건 -> 분석 기사 {metrics['total_after_cluster']}건 "
        f"(당사 {metrics['by_category']['own']} "
        f"긍정 {own_tone.get('positive', 0)}·중립 {own_tone.get('neutral', 0)}·부정 {own_tone.get('negative', 0)} / "
        f"경쟁·업계 {market_count} / 리스크 [{risk_color}]{metrics['risk_level']}[/])"
    )

    report = generate_report(clustered, metrics, yesterday)
    console.print(Panel(Markdown(report), title=f"일일 모니터링 보고서 [{metrics['risk_level']}]", border_style="cyan"))

    html_body = build_html_report(report, clustered, metrics, yesterday)
    send_email(html_body, metrics)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    html_path = LOG_DIR / f"briefing_{timestamp}.html"
    json_path = LOG_DIR / f"articles_{timestamp}.json"
    html_path.write_text(html_body, encoding="utf-8")
    json_path.write_text(json.dumps(clustered, ensure_ascii=False, indent=2), encoding="utf-8")
    archive_path = archiver.save_daily(clustered, report, metrics)

    console.print(f"[dim]저장: {html_path.name} / {json_path.name} / {archive_path.name}[/]")
    return html_path


def generate_report(clustered: list[dict], metrics: dict, yesterday: dict | None) -> str:
    if not clustered:
        window = report_window.current_window()
        return f"## 최종 결론\n{window['label']} 기준 주요 모니터링 대상 뉴스가 없습니다."
    if not GEMINI_API_KEY:
        return fallback_report(clustered, metrics)

    prompt = build_prompt(clustered, metrics, yesterday)
    with console.status("[cyan]Gemini가 보고서를 작성 중...[/]", spinner="dots"):
        model = genai.GenerativeModel(config.GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={"max_output_tokens": config.MAX_TOKENS, "temperature": 0.25},
        )
    return clean_markdown(response.text)


def build_prompt(clustered: list[dict], metrics: dict, yesterday: dict | None) -> str:
    prompt_articles = select_prompt_articles(clustered, config.MAX_ARTICLES_FOR_PROMPT)
    articles_text = format_articles_for_prompt(prompt_articles)
    market_count = metrics["by_category"]["competitor"] + metrics["by_category"]["industry"]
    own_tone = metrics.get("own_by_tone", {})
    action_instruction = build_action_instruction(metrics)
    window = report_window.current_window()

    return f"""
당신은 {config.COMPANY_NAME} {config.TEAM_NAME}의 언론 모니터링 분석 담당자입니다.
아래 {window['label']} 기사만 근거로 사내 의사결정용 언론 모니터링 보고서를 작성하세요.

분류 기준:
- {config.COMPANY_NAME}가 직접 언급되지 않은 기사는 긍정/부정으로 과도하게 판단하지 말고 업계/경쟁 동향으로만 해석하세요.
- 보험사기, 설계사 감소, 법안 동향 등 업계 이슈는 당사 직접 언급이 없으면 부정기사로 보지 마세요.
- 경쟁사 1위, 매출 증가, 수성은 당사 긍정 기사가 아니라 경쟁 동향입니다.
- 사회공헌/기부/지원 기사는 피해자나 사기 같은 단어가 있어도 당사 CSR 맥락이면 부정으로 보지 마세요.

데이터:
- 수집 구간: {window['label']}
- 총 수집: {metrics['total_collected']}건
- 분석 기사: {metrics['total_after_cluster']}건
- 당사 언급: {metrics['by_category']['own']}건
- 당사 톤: 긍정 {own_tone.get('positive', 0)}건, 중립 {own_tone.get('neutral', 0)}건, 부정 {own_tone.get('negative', 0)}건
- 경쟁/업계 동향: {market_count}건
- 리스크: {metrics['risk_level']}

주요 기사:
{articles_text}

출력 규칙:
- 전체 700자 이내.
- 제목은 아래 지정된 제목만 사용. ###, ####, 번호형 대제목 금지.
- 굵게 표시용 ** 문법 금지.
- 기사 나열 금지. 중복 기사는 하나의 이슈로 설명.
- 기사 목록에 없는 이슈, 키워드, 법안, 사건은 절대 추가하지 마세요.
- 핵심 이슈에는 반드시 근거 기사 ID를 [N] 형식으로 붙이세요. 예: - [3] 브랜드평판 1위: 당사 긍정 보도.
- 불확실한 내용은 "확인 필요"라고 표현하세요.
- 액션/대응 섹션은 아래 조건을 따르세요.
{action_instruction}

반드시 이 형식:
## 최종 결론
한 문장. 55자 이내.

## 핵심 이슈
- [기사ID] 이슈명: 판단
- 최대 2개

## 지표 해석
1~2문장. 당사 보도 톤, 당사 부정, 경쟁/업계 동향 중심.

## 분석 키워드
키워드 3~5개만 쉼표로 나열.
""".strip()


def build_action_instruction(metrics: dict) -> str:
    if should_show_action(metrics):
        return (
            "- 리스크가 MEDIUM 이상이거나 당사 부정 이슈가 있으므로 "
            "'## 대응 필요 사항' 섹션을 '## 분석 키워드' 바로 앞에 추가하세요.\n"
            "- 대응 필요 사항은 최대 2개 bullet로 작성하고, 각 bullet은 35자 이내로 제한하세요.\n"
            "- 일반적인 '모니터링 지속', '내부 공유' 같은 관성적 문구는 금지합니다."
        )
    return (
        "- 리스크가 LOW이고 당사 부정 이슈가 없으므로 액션/대응 섹션을 쓰지 마세요.\n"
        "- '모니터링 지속', '내부 공유', '추이 관찰' 같은 형식적 액션은 작성하지 마세요."
    )


def should_show_action(metrics: dict) -> bool:
    return metrics.get("risk_level") in {"MEDIUM", "HIGH"} or metrics.get("own_negative", 0) > 0


def assign_report_ids(articles: list[dict]) -> None:
    for idx, article in enumerate(articles, 1):
        article["_report_id"] = idx


def select_prompt_articles(clustered: list[dict], limit: int) -> list[dict]:
    selected: list[dict] = []
    seen_links: set[str] = set()

    def add(article: dict) -> None:
        link = article.get("link", "")
        key = link or article.get("title", "")
        if key in seen_links or len(selected) >= limit:
            return
        selected.append(article)
        seen_links.add(key)

    priority_terms = ("브랜드평판", "1위", "수성", "금감원", "금융위", "근로자성", "불완전판매")
    for article in clustered:
        if article.get("_category") == "own":
            add(article)
    for article in clustered:
        text = article.get("title", "") + " " + article.get("description", "")
        if any(term in text for term in priority_terms):
            add(article)
    for category in ("regulation", "competitor", "industry"):
        for article in clustered:
            if article.get("_category") == category:
                add(article)
    for article in clustered:
        add(article)

    return selected[:limit]


def format_articles_for_prompt(articles: list[dict]) -> str:
    rows = []
    for article in articles:
        rows.append(
            f"{article.get('_report_id')}. [{article.get('_category')}/{article.get('_tone')}/점수{article.get('_score')}] "
            f"{article.get('title', '')[:95]} "
            f"(출처 {article.get('source')}, 검색어 {article.get('keyword')}, 유사 {article.get('_cluster_size', 1)}건)"
        )
    return "\n".join(rows)


def format_diff(today: dict, yesterday: dict | None) -> str:
    if not yesterday:
        return "전일 데이터 없음"

    def delta(key_path):
        current = today
        previous = yesterday
        for key in key_path:
            current = current[key]
            previous = previous[key]
        return f"{current - previous:+d}"

    return (
        f"당사 {delta(['by_category', 'own'])}, "
        f"당사부정 {delta(['own_negative'])}, "
        f"경쟁/업계 {delta_market(today, yesterday)}"
    )


def delta_market(today: dict, yesterday: dict) -> str:
    current = today["by_category"]["competitor"] + today["by_category"]["industry"]
    previous = yesterday["by_category"]["competitor"] + yesterday["by_category"]["industry"]
    return f"{current - previous:+d}"


def clean_markdown(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^#{3,6}\s*", "## ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"```(?:markdown)?|```", "", text)
    text = text.replace("**", "")
    return text.strip()


def fallback_report(clustered: list[dict], metrics: dict) -> str:
    window = report_window.current_window()
    issue_lines = "\n".join(
        f"- {article.get('title', '')[:55]}: 확인 필요"
        for article in clustered[:2]
    )
    response_section = ""
    if should_show_action(metrics):
        response_section = """
## 대응 필요 사항
- 당사 부정 기사 원문 확인
- 관련 부서 사실관계 점검
"""

    return f"""## 최종 결론
{window['label']} 기준 리스크는 {metrics['risk_level']}이며, 당사 부정 {metrics['own_negative']}건입니다.

## 핵심 이슈
{issue_lines}

## 지표 해석
전체 {metrics['total_collected']}건 중 당사 보도 {metrics['by_category']['own']}건, 당사 부정 {metrics['own_negative']}건입니다.
{response_section}

## 분석 키워드
인카금융서비스, 정착률, GA, 보험설계사"""


def build_html_report(report_md: str, clustered: list[dict], metrics: dict, yesterday: dict | None) -> str:
    env = Environment(loader=FileSystemLoader(BASE_DIR / "templates"))
    template = env.get_template("email.html")
    y_metrics = yesterday.get("metrics") if yesterday else None
    sections = parse_report_sections(report_md, metrics)
    market_count = metrics["by_category"]["competitor"] + metrics["by_category"]["industry"]
    window = report_window.current_window()

    return template.render(
        subject_prefix=config.EMAIL_SUBJECT_PREFIX,
        date_str=datetime.now(KST).strftime("%Y.%m.%d %H:%M"),
        basis_datetime=datetime.now(KST).strftime("%y-%m-%d %H:%M"),
        company=config.COMPANY_NAME,
        team=config.TEAM_NAME,
        metrics=metrics,
        diff=build_diff_for_template(metrics, y_metrics),
        sections=sections,
        article_tabs=build_article_tabs(clustered, sections),
        risk_message=risk_message(metrics),
        market_count=market_count,
        methodology=build_methodology(metrics),
        window=window,
    )


def parse_report_sections(markdown: str, metrics: dict | None = None) -> dict:
    cleaned = clean_markdown(markdown)
    pattern = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
    matches = list(pattern.finditer(cleaned))
    raw = {}

    for idx, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(cleaned)
        raw[title] = cleaned[start:end].strip()

    action_text = raw.get("대응 필요 사항", "") or raw.get("액션", "")
    if metrics is not None and not should_show_action(metrics):
        action_text = ""

    return {
        "conclusion": raw.get("최종 결론", ""),
        "issues": parse_bullets(raw.get("핵심 이슈", "")),
        "interpretation_html": markdown_to_html("## 지표 해석\n" + raw.get("지표 해석", "")) if raw.get("지표 해석") else "",
        "action_html": markdown_to_html("## 대응 필요 사항\n" + action_text) if action_text else "",
        "keywords": parse_keywords(raw),
    }


def parse_keywords(raw: dict) -> list[str]:
    text = raw.get("분석 키워드", "") or raw.get("추적 키워드", "")
    return [item.strip() for item in text.replace("\n", ",").split(",") if item.strip()]


def select_evidence_articles(clustered: list[dict], sections: dict, limit: int = 12) -> list[dict]:
    selected: list[dict] = []
    seen_links: set[str] = set()

    by_id = {article.get("_report_id"): article for article in clustered}

    def add_article(article: dict | None) -> None:
        if not article:
            return
        link = article.get("link", "")
        key = link or article.get("title", "")
        if key in seen_links or len(selected) >= limit:
            return
        selected.append(article)
        seen_links.add(key)

    for issue in sections.get("issues", []):
        for ref_id in issue.get("refs", []):
            add_article(by_id.get(ref_id))

    def add_matching(category: str, count: int) -> None:
        current = 0
        for article in clustered:
            if current >= count:
                break
            if article.get("_category") != category:
                continue
            before = len(selected)
            add_article(article)
            if len(selected) == before:
                continue
            current += 1

    for article in clustered:
        text = article.get("title", "") + " " + article.get("description", "")
        if any(term in text for term in ("브랜드평판", "1위", "수성")):
            add_article(article)

    add_matching("own", 2)
    add_matching("regulation", 2)
    add_matching("competitor", 2)
    add_matching("industry", 2)

    for article in clustered:
        if len(selected) >= limit:
            break
        add_article(article)
    return selected[:limit]


def build_article_tabs(clustered: list[dict], sections: dict) -> list[dict]:
    return [
        {
            "id": "evidence",
            "label": "분석 근거",
            "description": "오늘의 판단과 핵심 이슈에 직접 연결되는 기사입니다.",
            "articles": enrich_articles(select_evidence_articles(clustered, sections, limit=8)),
        },
        {
            "id": "own",
            "label": "당사 언급",
            "description": "인카금융서비스가 직접 언급된 기사입니다.",
            "articles": enrich_articles(select_articles_by_category(clustered, {"own"}, limit=10)),
        },
        {
            "id": "risk",
            "label": "규제/리스크",
            "description": "규제, 제도, 감독 이슈와 리스크 관찰 기사입니다.",
            "articles": enrich_articles(select_articles_by_category(clustered, {"regulation"}, limit=10)),
        },
        {
            "id": "market",
            "label": "업계/경쟁",
            "description": "경쟁사와 보험·GA 업계 흐름을 보여주는 기사입니다.",
            "articles": enrich_articles(select_articles_by_category(clustered, {"competitor", "industry"}, limit=12)),
        },
    ]


def select_articles_by_category(clustered: list[dict], categories: set[str], limit: int) -> list[dict]:
    selected = []
    seen_links: set[str] = set()

    for article in clustered:
        link = article.get("link", "")
        key = link or article.get("title", "")
        if article.get("_category") not in categories or key in seen_links:
            continue
        selected.append(article)
        seen_links.add(key)
        if len(selected) >= limit:
            break

    return selected


def parse_bullets(text: str) -> list[dict]:
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith(("-", "*")):
            continue
        body = line[1:].strip()
        if ":" in body:
            title, detail = body.split(":", 1)
        else:
            title, detail = body, ""
        refs = [int(value) for value in re.findall(r"\[(\d+)\]", body)]
        title = re.sub(r"\[\d+\]\s*", "", title).strip()
        detail = re.sub(r"\[\d+\]\s*", "", detail).strip()
        items.append({"title": title.strip(), "detail": detail.strip(), "refs": refs})
    return items[:2]


def enrich_articles(articles: list[dict]) -> list[dict]:
    return [
        {
            **article,
            "_category_label": CATEGORY_LABELS.get(article.get("_category", "other"), "기타"),
            "_tone_label": TONE_LABELS.get(article.get("_tone", "neutral"), "중립"),
            "_impact": article_impact(article),
            "_evidence_id": article.get("_report_id", "-"),
        }
        for article in articles
    ]


def article_impact(article: dict) -> str:
    score = article.get("_score", 0)
    if article.get("_category") == "own" and article.get("_tone") == "negative":
        return "높음"
    if score >= 18:
        return "높음"
    if score >= 10:
        return "중간"
    return "낮음"


def build_methodology(metrics: dict) -> dict:
    window = report_window.current_window()
    return {
        "sources": "네이버 뉴스, 구글 뉴스",
        "window": window["label"],
        "keywords": len(config.KEYWORDS),
        "collected": metrics["total_collected"],
        "candidates": metrics["total_after_cluster"],
    }


def risk_message(metrics: dict) -> str:
    if metrics["risk_level"] == "HIGH":
        return "당사 부정 이슈 확인 필요"
    if metrics["risk_level"] == "MEDIUM":
        return "주의 이슈 모니터링 필요"
    return "당사 부정 이슈 없음"


def markdown_to_html(markdown: str) -> str:
    text = clean_markdown(markdown)
    text = html.escape(text)
    text = re.sub(r"^\s*##\s+(.+)$", r"<h2>\1</h2>", text, flags=re.MULTILINE)
    text = convert_tables(text)

    lines = text.splitlines()
    out = []
    in_ul = False

    for line in lines:
        bullet = re.match(r"^\s*[-*]\s+(.+)$", line)
        if bullet:
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{bullet.group(1)}</li>")
            continue
        if in_ul:
            out.append("</ul>")
            in_ul = False
        out.append(line)

    if in_ul:
        out.append("</ul>")

    blocks = re.split(r"\n\s*\n", "\n".join(out))
    final = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if re.match(r"^<(h2|ul|table)", block):
            final.append(block)
        else:
            final.append(f"<p>{block.replace(chr(10), '<br>')}</p>")
    return "\n".join(final)


def convert_tables(text: str) -> str:
    pattern = re.compile(r"((?:^\|.*\|\s*$\n?){2,})", re.MULTILINE)

    def repl(match: re.Match) -> str:
        rows = [row.strip() for row in match.group(1).strip().splitlines()]
        html_rows = ["<table>"]
        header_done = False
        for row in rows:
            bare = row.replace("|", "").replace("-", "").replace(":", "").strip()
            if not bare:
                continue
            cells = [cell.strip() for cell in row.strip("|").split("|")]
            tag = "th" if not header_done else "td"
            html_rows.append("<tr>" + "".join(f"<{tag}>{cell}</{tag}>" for cell in cells) + "</tr>")
            header_done = True
        html_rows.append("</table>")
        return "\n".join(html_rows)

    return pattern.sub(repl, text)


def build_diff_for_template(today: dict, yesterday: dict | None) -> dict:
    if not yesterday:
        return {"available": False}

    def item(today_value: int, yesterday_value: int) -> dict:
        diff = today_value - yesterday_value
        direction = "same"
        if diff > 0:
            direction = "up"
        elif diff < 0:
            direction = "down"
        return {"diff": f"{diff:+d}", "direction": direction}

    return {
        "available": True,
        "own": item(today["by_category"]["own"], yesterday["by_category"]["own"]),
        "own_neg": item(today["own_negative"], yesterday["own_negative"]),
        "market": item(
            today["by_category"]["competitor"] + today["by_category"]["industry"],
            yesterday["by_category"]["competitor"] + yesterday["by_category"]["industry"],
        ),
    }


def send_email(html_body: str, metrics: dict) -> bool:
    if not EMAIL_SENDER or not EMAIL_PASSWORD or not EMAIL_RECIPIENTS:
        console.print("[yellow]이메일 설정 없음: HTML 저장만 진행[/]")
        return False

    subject = (
        f"{config.EMAIL_SUBJECT_PREFIX} {datetime.now().strftime('%Y.%m.%d')} "
        f"{metrics['risk_level']} 당사{metrics['by_category']['own']} 부정{metrics['own_negative']}"
    )
    message = MIMEMultipart("alternative")
    message["From"] = EMAIL_SENDER
    message["To"] = ", ".join(EMAIL_RECIPIENTS)
    message["Subject"] = subject
    message.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, EMAIL_RECIPIENTS, message.as_string())
        console.print(f"[green]이메일 발송 완료: {len(EMAIL_RECIPIENTS)}명[/]")
        return True
    except Exception as exc:
        console.print(f"[red]이메일 발송 실패:[/] {exc}")
        return False
