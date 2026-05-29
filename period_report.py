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
## 핵심 브리핑
3문장. 기간 전체에서 보고받는 사람이 먼저 알아야 할 사실과 가장 큰 변화 축을 압축해 씁니다.

## 기간 해석
4문장. 원문 수집량과 중복 정리 후 분석 기사 수가 다른 이유, 당사 노출 비중, 업계/정책 흐름, 특정 일자 변동을 해석합니다.

## 리스크 판독
4개 bullet. 당사 직접 부정, 일반 부정 논조, 정책/감독, GA/보험사 동향을 각각 해석합니다. 화면 숫자를 그대로 반복하지 말고 의미를 설명합니다.

## 관찰 포인트
3개 bullet. 다음 기간에도 비교해야 할 반복 신호를 씁니다.

작성 제한:
- 전체 1,150자 이내.
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
    total_collected = aggregate.get("total_collected", 0)
    total_after_cluster = aggregate.get("total_after_cluster", 0)
    regulation = aggregate["by_category"]["regulation"]
    own = aggregate["by_category"]["own"]
    negative = aggregate["by_tone"].get("negative", 0)
    neutral = aggregate["by_tone"].get("neutral", 0)
    conversion = round(total_after_cluster / max(total_collected, 1) * 100)
    top_keyword = aggregate.get("top_keywords", [{}])[0].get("keyword", "-") if aggregate.get("top_keywords") else "-"
    top_keyword_count = aggregate.get("top_keywords", [{}])[0].get("count", 0) if aggregate.get("top_keywords") else 0
    top_source = aggregate.get("top_sources", [{}])[0].get("source", "-") if aggregate.get("top_sources") else "-"
    top_source_count = aggregate.get("top_sources", [{}])[0].get("count", 0) if aggregate.get("top_sources") else 0
    daily_volume = aggregate.get("daily_volume", [])
    peak_day = max(daily_volume, key=lambda row: row.get("total", 0), default={})
    latest_day = daily_volume[-1] if daily_volume else {}
    risk_dates = [
        row.get("date", "")[5:]
        for row in daily_volume
        if row.get("risk") in {"HIGH", "MEDIUM"}
    ]
    risk_date_text = ", ".join(risk_dates) if risk_dates else "없음"
    return f"""## 핵심 브리핑
{period_label} 기준 원문 수집은 {total_collected}건, 중복 정리 후 분석 기사는 {total_after_cluster}건입니다. 당사 언급은 {own}건이며, 당사 직접 부정은 {own_negative_total}건으로 별도 추적 대상입니다. 전체 흐름은 {top_keyword} 키워드와 GA/보험사 동향이 주도했고, 주의 이상 일자는 {risk_days}일로 제한적입니다.

## 기간 해석
원문 수집 건수는 슬롯별 검색량을 합산한 값이고, 분석 기사는 중복 링크와 유사 기사를 정리한 실제 검토 기준입니다. 분석 전환율은 {conversion}%로, 같은 이슈가 여러 매체와 포털 경로에서 반복 노출된 비중을 함께 보여줍니다. 당사 직접 보도보다 GA/보험사 및 정책성 보도의 흐름이 더 큰 비중을 차지했습니다. 일자별로는 {peak_day.get('date', '-')}에 {peak_day.get('total', 0)}건으로 노출이 가장 컸고, 최근 기준일 {latest_day.get('date', '-')}은 {latest_day.get('total', 0)}건으로 마감됐습니다.

## 리스크 판독
- 당사 직접 부정: {own_negative_total}건으로, 일반 업계 부정 기사와 분리해 관리해야 하는 평판 신호입니다.
- 일반 부정 논조: {negative}건으로, 대부분 당사 직접 이슈보다 업계·상품·제도 환경의 부정 흐름으로 읽힙니다.
- 정책/감독: {regulation}건으로, 제도 변화가 업계 보도량을 끌어올리는지 확인하는 축입니다.
- GA/보험사 동향: {market}건으로, 당사 직접 이슈보다 시장 환경 신호가 강한 구간입니다.

## 관찰 포인트
- {top_keyword}: {top_keyword_count}건 관찰되어 다음 기간에도 반복 노출 여부를 비교해야 합니다.
- {top_source}: {top_source_count}건으로 영향 매체 상위에 있어 포털/원매체 보정 여부를 함께 봐야 합니다.
- 주의 관찰일: {risk_date_text} 구간이 리스크 판정일이며, 동일 이슈의 재확산인지 신규 이슈인지 분리해 봐야 합니다."""


def build_report_context(aggregate: dict, top_articles: list[dict]) -> dict:
    def pct(value: int | float, denominator: int | float) -> int:
        if not denominator:
            return 0
        return max(0, min(100, round(value / denominator * 100)))

    def bar_share(value: int | float) -> int:
        value = max(0, min(100, round(value)))
        if value and value < 4:
            return 4
        return value

    cats = aggregate["by_category"]
    tones = aggregate["by_tone"]
    own = cats.get("own", 0)
    regulation = cats.get("regulation", 0)
    market = cats.get("competitor", 0) + cats.get("industry", 0)
    own_negative = sum(d.get("value", 0) for d in aggregate.get("daily_own_negative", []))
    risk_distribution = aggregate.get("risk_distribution", {})
    risk_level = "HIGH" if risk_distribution.get("HIGH", 0) or own_negative >= 3 else "MEDIUM" if risk_distribution.get("MEDIUM", 0) or own_negative else "LOW"

    top_keywords = aggregate.get("top_keywords", [])
    top_sources = aggregate.get("top_sources", [])
    risk_keywords = aggregate.get("risk_keywords", [])
    top_keyword = top_keywords[0]["keyword"] if top_keywords else "-"

    watch_days = risk_distribution.get("HIGH", 0) + risk_distribution.get("MEDIUM", 0)
    total_after_cluster = max(aggregate.get("total_after_cluster", 0), 1)
    period_days = max(aggregate.get("period_days", 0), 1)
    total_collected = max(aggregate.get("total_collected", 0), 1)
    tone_total = max(sum(tones.values()), total_collected, 1)
    if risk_level == "HIGH":
        headline = f"당사 직접 부정 {own_negative}건과 주의 이상 {watch_days}일이 확인된 고위험 관찰 구간입니다."
    elif own_negative:
        headline = f"당사 직접 부정 {own_negative}건이 포착되어 부정 논조의 확산 여부를 별도 추적하는 구간입니다."
    elif own:
        headline = f"당사 언급 {own}건이 관찰됐고, 직접 부정 리스크는 낮은 수준으로 유지됐습니다."
    elif regulation >= max(3, market):
        headline = "정책·감독 이슈 비중이 높아 제도 변화와 업계 반응이 주요 관찰 축으로 나타났습니다."
    else:
        headline = f"GA/보험 동향 {market}건을 중심으로 시장 노출 흐름을 추적하는 구간입니다."

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

    category_items = [
        ("own", "당사", own, pct(own, total_collected), "인카금융서비스 직접 언급 보도입니다. 브랜드평판·실적·당사 이슈 노출을 별도로 봅니다."),
        ("regulation", "정책", regulation, pct(regulation, total_collected), "법안·감독·제도성 기사입니다. 업계 리스크의 배경 신호로 해석합니다."),
        ("market", "GA/보험", market, pct(market, total_collected), "GA·보험사·보험상품 관련 보도입니다. 시장 환경 변화의 주된 관찰 축입니다."),
        ("other", "기타", cats.get("other", 0), pct(cats.get("other", 0), total_collected), "핵심 분류와 직접 연결되지 않는 잔여 기사입니다."),
    ]
    categories = [
        {"key": key, "label": label, "value": f"{value:,}건", "share": share, "bar_share": bar_share(share), "note": note}
        for key, label, value, share, note in category_items
    ]
    risk_items = [
        ("negative", "부정 논조", tones.get("negative", 0), pct(tones.get("negative", 0), tone_total), "전체 수집 기사 중 부정 톤으로 분류된 기사입니다."),
        ("own-negative", "당사 부정", own_negative, pct(own_negative, tone_total), "당사가 직접 언급된 부정 기사입니다. 일반 부정 기사와 분리해 봅니다."),
        ("watch-days", "주의 관찰일", watch_days, pct(watch_days, period_days), "HIGH 또는 MEDIUM으로 판정된 일자 수입니다. 기사 건수가 아니라 날짜 기준입니다."),
        ("neutral", "중립 논조", tones.get("neutral", 0), pct(tones.get("neutral", 0), tone_total), "사실 전달형 기사 비중입니다. 기본 노출량의 바탕 흐름입니다."),
    ]
    risk_mix = [
        {
            "key": key,
            "label": label,
            "value": f"{value:,}일" if key == "watch-days" else f"{value:,}건",
            "share": share,
            "bar_share": bar_share(share),
            "note": note,
        }
        for key, label, value, share, note in risk_items
    ]
    density_rows = [
        {"label": "원문/분석", "value": f"{aggregate.get('total_collected', 0):,} / {aggregate.get('total_after_cluster', 0):,}", "note": f"중복 정리 후 {round(aggregate.get('total_after_cluster', 0) / total_collected * 100)}%"},
        {"label": "모니터링 구간", "value": f"{aggregate.get('period_days', 0)}일 · {aggregate.get('period_windows', 0)}회", "note": f"일평균 {aggregate.get('avg_daily_collected', 0)}건"},
        {"label": "최대 기사량", "value": f"{aggregate.get('max_daily_total', 0):,}건", "note": "일 단위 최고 수집량"},
        {"label": "핵심 키워드", "value": top_keyword, "note": "반복 노출 상위 키워드"},
    ]
    keyword_rows = [
        {
            "keyword": item.get("keyword", "-"),
            "count": item.get("count", 0),
            "share": round(item.get("count", 0) / total_after_cluster * 100),
            "risk": next((risk_item.get("count", 0) for risk_item in risk_keywords if risk_item.get("keyword") == item.get("keyword")), 0),
        }
        for item in top_keywords[:8]
    ]
    source_rows = [
        {
            "source": item.get("source", "-"),
            "count": item.get("count", 0),
            "share": round(item.get("count", 0) / total_after_cluster * 100),
        }
        for item in top_sources[:6]
    ]
    daily_volume = aggregate.get("daily_volume", [])
    peak_day = max(daily_volume, key=lambda row: row.get("total", 0), default={})
    latest_day = daily_volume[-1] if daily_volume else {}
    risk_dates = [
        row.get("date", "")[5:]
        for row in daily_volume
        if row.get("risk") in {"HIGH", "MEDIUM"}
    ]
    risk_date_text = ", ".join(risk_dates) if risk_dates else "없음"
    top_source = top_sources[0].get("source", "-") if top_sources else "-"
    top_source_count = top_sources[0].get("count", 0) if top_sources else 0
    negative_count = tones.get("negative", 0)
    interpretation_notes = [
        {
            "title": "노출 구조",
            "body": f"{top_keyword} 키워드가 상위 반복 축이며, GA/보험 동향 {market:,}건이 전체 흐름을 주도합니다. 당사 언급은 {own:,}건으로 별도 성과·평판 축에서 보는 것이 적절합니다.",
        },
        {
            "title": "리스크 구조",
            "body": f"부정 논조 {negative_count:,}건 중 당사 직접 부정은 {own_negative:,}건입니다. 나머지는 업계·상품·제도 환경 리스크로 읽어야 과잉 대응을 줄일 수 있습니다.",
        },
        {
            "title": "일자 신호",
            "body": f"최대 노출일은 {peak_day.get('date', '-')} {peak_day.get('total', 0):,}건, 최근 기준일은 {latest_day.get('date', '-')} {latest_day.get('total', 0):,}건입니다. 주의 관찰일은 {risk_date_text}입니다.",
        },
        {
            "title": "매체 기준",
            "body": f"상위 매체는 {top_source} {top_source_count:,}건입니다. 포털 경유 기사와 원매체명이 섞이면 영향 매체 해석이 흔들리므로 매체명 보정 상태를 함께 봐야 합니다.",
        },
    ]
    daily_rows = [
        {
            **row,
            "market": row.get("market", 0),
            "negative": row.get("negative", 0),
        }
        for row in aggregate.get("daily_volume", [])[-8:]
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
        "density_rows": density_rows,
        "keyword_rows": keyword_rows,
        "source_rows": source_rows,
        "interpretation_notes": interpretation_notes,
        "daily_rows": daily_rows,
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
        f"원문 {_fmt_count(aggregate['total_collected'])}건 | "
        f"분석 {_fmt_count(aggregate['total_after_cluster'])}건 | "
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
        top_articles=top_articles[:10],
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
