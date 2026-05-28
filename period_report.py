"""Generate weekly and monthly monitoring reports."""

from __future__ import annotations

import os
import re
import sys
import html as html_lib
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

PERIOD_REPORT_DISABLE_AI = os.getenv("PERIOD_REPORT_DISABLE_AI", "").lower() in {"1", "true", "yes", "y"}
GEMINI_API_KEY = "" if PERIOD_REPORT_DISABLE_AI else os.getenv("GEMINI_API_KEY")
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
        return fallback_period_summary(aggregate, top_articles, period_label)

    top_text = "\n".join(
        f"- {a.get('_date', '')} | {a.get('_tone', 'neutral')} | 점수 {a.get('_score', 0)} | "
        f"{a.get('title', '')[:90]}"
        for a in top_articles[:14]
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
- 일일 보고서처럼 기사 나열을 하지 말고, 기간 전체의 변화와 반복 패턴을 해석합니다.
- 사내 보고용으로 간결하지만, 의사결정자가 바로 상황을 파악할 수 있는 전문적인 문장으로 씁니다.
- 제언, 실행 지시, 활용 방안보다 관찰 사실, 변동 방향, 추적해야 할 신호를 우선합니다.
- 당사가 직접 언급되지 않은 부정 이슈는 업계 리스크로만 다루고, 당사 부정 이슈처럼 표현하지 않습니다.

누적 지표:
- 분석 일수: {aggregate['period_days']}일
- 모니터링 구간: {aggregate.get('period_windows', aggregate['period_days'])}회
- 전체 수집: {aggregate['total_collected']}건
- 분석 기사: {aggregate['total_after_cluster']}건
- 당사 언급: {aggregate['by_category']['own']}건
- 규제/제도: {aggregate['by_category']['regulation']}건
- 경쟁/업계: {aggregate['by_category']['competitor'] + aggregate['by_category']['industry']}건
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
## 기간 핵심 분석
2문장. 기간 전체의 결론을 먼저 제시합니다.

## 숫자로 본 흐름
- 기사량
- 당사 보도
- 부정/규제성 이슈
각 항목은 한 문장으로만 씁니다.

## 리스크 관찰 메모
3개 bullet. 판단에 필요한 관찰 축과 현재 신호를 같이 씁니다. 실행을 지시하는 문장은 쓰지 않습니다.

작성 제한:
- 전체 650자 이내.
- 마크다운 굵게 표시(**)를 쓰지 마세요.
- ###, #### 제목을 쓰지 마세요.
- 근거 없는 추측을 쓰지 마세요.
- 긴 문장보다 짧고 판단이 분명한 문장을 우선하세요.
- "공유", "활용", "선별", "대응하세요", "확인합니다"처럼 실행 제안으로 읽히는 표현을 피하세요.
"""

    with console.status(f"[cyan]Gemini AI {period_label} 보고서 작성 중...[/]", spinner="dots"):
        model = genai.GenerativeModel(config.GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={"max_output_tokens": config.MAX_TOKENS, "temperature": 0.45},
        )
    return response.text


def fallback_period_summary(aggregate: dict, top_articles: list[dict], period_label: str) -> str:
    market = aggregate["by_category"]["competitor"] + aggregate["by_category"]["industry"]
    risk_days = aggregate["risk_distribution"]["HIGH"] + aggregate["risk_distribution"]["MEDIUM"]
    own_negative_total = sum(d.get("value", 0) for d in aggregate.get("daily_own_negative", []))
    top_keyword = "-"
    keyword_counts: dict[str, int] = {}
    for article in top_articles:
        keyword = (article.get("keyword") or "").strip()
        if not keyword:
            continue
        keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
    if keyword_counts:
        top_keyword = sorted(keyword_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
    return f"""## 기간 핵심 분석
{period_label} 기준 전체 {aggregate['total_collected']}건 중 분석 기사 {aggregate['total_after_cluster']}건이 집계되었습니다. 당사 언급은 {aggregate['by_category']['own']}건, 주의 이상 일수는 {risk_days}일입니다.

## 숫자로 본 흐름
- 기사량: {aggregate['period_days']}일/{aggregate.get('period_windows', aggregate['period_days'])}구간 기준 일평균 {aggregate['avg_daily_collected']}건입니다.
- 당사 보도: 당사 언급 {aggregate['by_category']['own']}건, 당사 부정 {own_negative_total}건입니다.
- 시장 동향: 경쟁/업계 동향 {market}건, 규제·제도 {aggregate['by_category']['regulation']}건입니다.

## 리스크 관찰 메모
- {top_keyword}: 반복 노출 여부와 확산 매체가 핵심 관찰 축입니다.
- 당사 부정 기사: 직접 언급 부정 이슈와 후속 보도 여부가 별도 관리 대상입니다.
- GA/보험사 동향: 시장 기사량과 정책성 이슈의 동반 상승 여부가 주요 신호입니다."""


def build_report_context(aggregate: dict, top_articles: list[dict]) -> dict:
    cats = aggregate["by_category"]
    tones = aggregate["by_tone"]
    own = cats.get("own", 0)
    regulation = cats.get("regulation", 0)
    market = cats.get("competitor", 0) + cats.get("industry", 0)
    own_negative = sum(d.get("value", 0) for d in aggregate.get("daily_own_negative", []))
    risk_distribution = aggregate.get("risk_distribution", {})
    risk_level = "HIGH" if risk_distribution.get("HIGH", 0) or own_negative >= 3 else "MEDIUM" if risk_distribution.get("MEDIUM", 0) or own_negative else "LOW"

    top_keyword = "-"
    keyword_counts: dict[str, int] = {}
    for article in top_articles:
        keyword = (article.get("keyword") or "").strip()
        if not keyword:
            continue
        keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
    if keyword_counts:
        top_keyword = sorted(keyword_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]

    watch_days = risk_distribution.get("HIGH", 0) + risk_distribution.get("MEDIUM", 0)
    total_after_cluster = max(aggregate.get("total_after_cluster", 0), 1)
    period_days = max(aggregate.get("period_days", 0), 1)
    if risk_level == "HIGH":
        headline = f"당사 부정 이슈 {own_negative}건, 주의 이상 {watch_days}일로 리스크 관찰 강도가 높은 기간입니다."
    elif own_negative:
        headline = f"당사 직접 부정 이슈 {own_negative}건이 포착되어 부정 추이를 별도 추적하는 기간입니다."
    elif own:
        headline = f"당사 언급 {own}건이 관찰됐고 직접 부정 리스크는 낮은 상태로 유지됐습니다."
    elif regulation >= max(3, market):
        headline = "정책·감독 이슈 비중이 높아 제도 변화와 업계 반응이 주요 관찰 축입니다."
    else:
        headline = f"GA/보험사 동향 {market}건을 중심으로 시장 흐름을 추적하는 구간입니다."

    tracking_points = [
        {
            "title": "당사 부정",
            "value": f"{own_negative}건",
            "body": "직접 언급 부정 기사와 후속 보도 발생 여부를 분리해 추적합니다." if own_negative else "직접 언급 부정 기사는 없고 신규 발생 여부만 추적합니다.",
        },
        {
            "title": "주의 구간",
            "value": f"{watch_days}일",
            "body": "HIGH/MEDIUM으로 분류된 날짜 수입니다. 기간 내 리스크 밀도를 판단하는 기준입니다.",
        },
        {
            "title": "주요 축",
            "value": top_keyword,
            "body": "반복 노출된 키워드와 관련 매체 확산 여부가 기간 비교 기준입니다.",
        },
    ]

    categories = [
        {"key": "own", "label": "당사", "value": own, "share": aggregate["category_share"].get("own", 0)},
        {"key": "regulation", "label": "정책", "value": regulation, "share": aggregate["category_share"].get("regulation", 0)},
        {"key": "market", "label": "GA/보험사", "value": market, "share": aggregate["category_share"].get("competitor", 0) + aggregate["category_share"].get("industry", 0)},
        {"key": "other", "label": "기타", "value": cats.get("other", 0), "share": aggregate["category_share"].get("other", 0)},
    ]
    risk_mix = [
        {"key": "negative", "label": "전체 부정", "value": tones.get("negative", 0), "share": round(tones.get("negative", 0) / total_after_cluster * 100)},
        {"key": "own-negative", "label": "당사 부정", "value": own_negative, "share": round(own_negative / total_after_cluster * 100)},
        {"key": "watch-days", "label": "주의 일수", "value": watch_days, "share": round(watch_days / period_days * 100)},
    ]
    return {
        "headline": headline,
        "risk_level": risk_level,
        "own_negative": own_negative,
        "market": market,
        "top_keyword": top_keyword,
        "watch_days": watch_days,
        "tracking_points": tracking_points,
        "categories": categories,
        "risk_mix": risk_mix,
    }


def markdown_to_html(md: str) -> str:
    out: list[str] = []
    in_list = False
    for raw_line in md.replace("**", "").splitlines():
        line = raw_line.strip()
        if not line:
            if in_list:
                out.append("</ul>")
                in_list = False
            continue
        heading = re.match(r"^#{1,6}\s+(.+)$", line)
        if heading:
            if in_list:
                out.append("</ul>")
                in_list = False
            level = "h3" if line.startswith("###") else "h2"
            out.append(f"<{level}>{html_lib.escape(heading.group(1))}</{level}>")
            continue
        bullet = re.match(r"^[-*]\s+(.+)$", line)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{html_lib.escape(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        out.append(f"<p>{html_lib.escape(line)}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


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
    trend_days = aggregate.get("daily_volume", [])[-12:]
    risk_trend_days = aggregate.get("daily_own_negative", [])[-12:]
    max_trend_total = max((d["total"] for d in trend_days), default=0)

    console.print(
        f"[green]OK[/] {aggregate['period_days']}일/{aggregate.get('period_windows', len(daily_data))}구간 데이터 로드 | "
        f"전체 {_fmt_count(aggregate['total_collected'])}건 | "
        f"당사 {aggregate['by_category']['own']}건 | "
        f"부정 {aggregate['by_tone']['negative']}건"
    )

    ai_report = generate_ai_report(aggregate, top_articles, label)
    report_context = build_report_context(aggregate, top_articles)
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
        report_context=report_context,
        trend_days=trend_days,
        risk_trend_days=risk_trend_days,
        max_trend_total=max_trend_total,
        max_neg=max_neg,
        ai_report_html=markdown_to_html(ai_report),
        top_articles=top_articles[:8],
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
