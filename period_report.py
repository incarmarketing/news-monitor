"""Generate weekly and monthly monitoring reports."""

from __future__ import annotations

import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import google.generativeai as genai
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

import archiver
import config

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()
console = Console()

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
KST = timezone(timedelta(hours=9))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def today_kst() -> date:
    return datetime.now(KST).date()


def now_kst() -> datetime:
    return datetime.now(KST)


def _fmt_count(value: int | float) -> str:
    if isinstance(value, float) and not value.is_integer():
        return f"{value:,.1f}"
    return f"{int(value):,}"


def generate_ai_report(aggregate: dict, top_articles: list[dict], period_label: str) -> str:
    if not GEMINI_API_KEY:
        return "GEMINI_API_KEY가 없어 AI 종합 분석을 생성하지 않았습니다."

    top_text = "\n".join(
        f"- {a.get('_date', '')} | {a.get('_tone', 'neutral')} | 점수 {a.get('_score', 0)} | "
        f"{a.get('title', '')[:90]}"
        for a in top_articles[:25]
    )
    volume_text = "\n".join(
        f"- {d['date']}: 수집 {d['total']}건, 분석 {d['analyzed']}건, 당사 {d['own']}건, "
        f"당사 부정 {d['own_negative']}건, 리스크 {d['risk']}"
        for d in aggregate.get("daily_volume", [])
    )
    own_negative_text = "\n".join(
        f"- {d['date']}: {d['value']}건"
        for d in aggregate.get("daily_own_negative", [])
    )

    prompt = f"""
당신은 {config.COMPANY_NAME} {config.TEAM_NAME}의 언론 모니터링 분석가입니다.
아래 누적 데이터를 바탕으로 {period_label} 보고서 본문을 작성하세요.

분석 목적:
- 일일 브리핑처럼 기사 나열을 하지 말고, 기간 전체의 변화와 반복 패턴을 해석합니다.
- 사내 보고용으로 간결하지만, 고객에게 제안해도 어색하지 않은 수준의 전문적인 문장으로 씁니다.
- 당사가 직접 언급되지 않은 부정 이슈는 업계 리스크로만 다루고, 당사 부정 이슈처럼 표현하지 않습니다.

누적 지표:
- 분석 일수: {aggregate['period_days']}일
- 모니터링 구간: {aggregate.get('period_windows', aggregate['period_days'])}회
- 전체 수집: {aggregate['total_collected']}건
- 분석 기사: {aggregate['total_after_cluster']}건
- 당사 언급: {aggregate['by_category']['own']}건
- 규제/제도: {aggregate['by_category']['regulation']}건
- 경쟁/업계: {aggregate['by_category']['competitor'] + aggregate['by_category']['industry']}건
- 긍정 톤: {aggregate['by_tone']['positive']}건
- 중립 톤: {aggregate['by_tone']['neutral']}건
- 부정 톤: {aggregate['by_tone']['negative']}건
- HIGH 일수: {aggregate['risk_distribution']['HIGH']}일
- MEDIUM 일수: {aggregate['risk_distribution']['MEDIUM']}일
- LOW 일수: {aggregate['risk_distribution']['LOW']}일

일자별 추이:
{volume_text}

당사 부정 이슈 추이:
{own_negative_text}

주요 기사 후보:
{top_text}

작성 형식:
## 기간 핵심 판단
2~3문장. 기간 전체의 결론을 먼저 제시합니다.

## 통계로 본 흐름
- 기사량 변화
- 당사 보도 흐름
- 부정/규제성 이슈 흐름
각 항목은 1~2문장으로 씁니다.

## 누적 핵심 이슈
3개 이내. 각 이슈는 제목과 해석을 한 줄씩만 씁니다.

## 다음 기간 관찰 포인트
3~5개 bullet. 실제 모니터링에 도움이 되는 키워드와 관찰 이유를 같이 씁니다.

작성 제한:
- 마크다운 굵게 표시(**)를 쓰지 마세요.
- ###, #### 제목을 쓰지 마세요.
- 근거 없는 추측을 쓰지 마세요.
- 긴 문장보다 짧고 판단이 분명한 문장을 우선하세요.
"""

    with console.status(f"[cyan]Gemini AI {period_label} 보고서 작성 중...[/]", spinner="dots"):
        model = genai.GenerativeModel(config.GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={"max_output_tokens": config.MAX_TOKENS, "temperature": 0.45},
        )
    return response.text


def markdown_to_html(md: str) -> str:
    html = md.replace("**", "")
    html = re.sub(r"^#{4,6}\s+(.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^###\s+(.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^##\s+(.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^#\s+(.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)

    def _table(match: re.Match) -> str:
        rows = [r.strip() for r in match.group(0).strip().split("\n") if r.strip()]
        if len(rows) < 2:
            return match.group(0)
        out = ["<table>"]
        for i, row in enumerate(rows):
            stripped = row.replace("|", "").replace("-", "").replace(":", "").strip()
            if not stripped:
                continue
            cells = [c.strip() for c in row.strip("|").split("|")]
            tag = "th" if i == 0 else "td"
            out.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>")
        out.append("</table>")
        return "\n".join(out)

    html = re.sub(r"((?:^\|.+\|\n?)+)", _table, html, flags=re.MULTILINE)
    html = re.sub(r"^- (.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
    html = re.sub(r"(<li>.+?</li>(\n<li>.+?</li>)*)", r"<ul>\1</ul>", html, flags=re.DOTALL)
    html = html.replace("\n\n", "</p><p>")
    html = "<p>" + html + "</p>"
    for tag in ["h2", "h3", "ul", "table"]:
        html = html.replace(f"<p><{tag}>", f"<{tag}>").replace(f"</{tag}></p>", f"</{tag}>")
    return html


def get_period(period: str, custom_days: int | None = None) -> tuple[date, date, str, str, str]:
    today = today_kst()
    if period == "weekly":
        start = today - timedelta(days=today.weekday())
        return start, today, "주간", "WEEKLY REPORT", "weekly"
    if period == "weekly_previous":
        start = today - timedelta(days=today.weekday() + 7)
        return start, start + timedelta(days=6), "전주 주간", "WEEKLY REPORT", "weekly"
    if period == "monthly":
        return today.replace(day=1), today, "월간", "MONTHLY REPORT", "monthly"
    if period == "monthly_previous":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end, "전월 월간", "MONTHLY REPORT", "monthly"

    days = custom_days or 7
    start = today - timedelta(days=days - 1)
    return start, today, f"최근 {days}일", f"{days}-DAY REPORT", "custom"


def run(period: str, custom_days: int | None = None) -> Path | None:
    start, end, label, badge, output_slug = get_period(period, custom_days)

    console.print(Panel.fit(
        f"[bold cyan]{label} 모니터링 보고서 생성[/]\n{start.isoformat()} ~ {end.isoformat()}",
        border_style="cyan",
    ))

    daily_data = archiver.load_between(start, end)
    if not daily_data:
        console.print("[red]누적된 일일 데이터가 없습니다.[/]")
        console.print("[dim]먼저 run_once.py를 실행해 일일 데이터를 쌓아주세요.[/]")
        return None

    aggregate = archiver.aggregate_metrics(daily_data)
    top_articles = archiver.collect_top_articles(daily_data, limit=20)

    console.print(
        f"[green]OK[/] {aggregate['period_days']}일/{aggregate.get('period_windows', len(daily_data))}구간 데이터 로드 | "
        f"전체 {_fmt_count(aggregate['total_collected'])}건 | "
        f"당사 {aggregate['by_category']['own']}건 | "
        f"부정 {aggregate['by_tone']['negative']}건"
    )

    ai_report = generate_ai_report(aggregate, top_articles, label)
    console.print(Panel(
        Markdown(ai_report),
        title=f"[bold cyan]{label} 종합 분석[/]",
        border_style="cyan",
        padding=(1, 2),
    ))

    env = Environment(loader=FileSystemLoader(BASE_DIR / "templates"))
    template = env.get_template("period_report.html")
    max_neg = max((d["value"] for d in aggregate.get("daily_own_negative", [])), default=0)

    html = template.render(
        period_label=label,
        period_badge=badge,
        period_range=f"{start.isoformat()} ~ {end.isoformat()}",
        generated_at=now_kst().strftime("%Y.%m.%d %H:%M"),
        company=config.COMPANY_NAME,
        team=config.TEAM_NAME,
        aggregate=aggregate,
        max_neg=max_neg,
        ai_report_html=markdown_to_html(ai_report),
        top_articles=top_articles[:12],
    )

    out_path = LOG_DIR / f"{output_slug}_report_{now_kst().strftime('%Y%m%d_%H%M')}.html"
    out_path.write_text(html, encoding="utf-8")
    console.print(f"[green]HTML 저장 완료:[/] {out_path}")

    latest_path = LOG_DIR / f"{output_slug}_report.html"
    latest_path.write_text(html, encoding="utf-8")

    if not os.getenv("CI"):
        os.startfile(out_path)

    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        console.print("사용법: python period_report.py weekly|weekly_previous|monthly|monthly_previous|custom [days]")
        sys.exit(1)

    arg = sys.argv[1]
    days_arg = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
    run(arg, days_arg)
