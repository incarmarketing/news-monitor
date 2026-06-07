"""Generate weekly and monthly monitoring reports."""

from __future__ import annotations

import os
import re
import sys
import html as html_lib
import calendar
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
import gemini_helper
import groq_helper
import public_urls

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
    baseline = fallback_period_summary(aggregate, top_articles, period_label)
    if not GEMINI_API_KEY:
        return groq_or_rules_period_report(aggregate, top_articles, period_label, baseline, reason="gemini_key_missing")

    is_open, circuit_state = gemini_helper.circuit_open()
    if is_open:
        console.print(f"[yellow]{gemini_helper.circuit_message(circuit_state)}[/]")
        return groq_or_rules_period_report(aggregate, top_articles, period_label, baseline, reason="gemini_circuit_open")

    top_text = "\n".join(
        f"- {a.get('_date', '')} | {a.get('_tone', 'neutral')} | ?? {a.get('_score', 0)} | "
        f"{a.get('title', '')[:90]}"
        for a in top_articles[:14]
    )
    volume_text = "\n".join(
        f"- {d['date']}: ?? {d['total']}?, ?? {d['analyzed']}?, ?? {d['own']}?, "
        f"?? ?? {d['own_negative']}?, ??? {d['risk']}"
        for d in aggregate.get("daily_volume", [])
    )
    own_negative_text = "\n".join(
        f"- {d['date']}: {d['value']}?"
        for d in aggregate.get("daily_own_negative", [])
    )

    prompt = f"""
??? {config.COMPANY_NAME} {config.TEAM_NAME}? ?? ???? ??????.
?? ?? ???? ???? {period_label} ??? ??? ?????.

?? ??:
- ?? ????? ?? ??? ?? ??, ?? ??? ??? ?? ??? ?????.
- ?? ????? ?????, ?????? ?? ??? ??? ? ?? ???? ???? ???.
- ??, ?? ??, ?? ???? ?? ??, ?? ??, ???? ? ??? ?????.
- ??? ?? ???? ?? ?? ??? ?? ????? ???, ?? ?? ???? ???? ????.

?? ??:
- ?? ??: {aggregate['period_days']}?
- ???? ??: {aggregate.get('period_windows', aggregate['period_days'])}?
- ?? ??: {aggregate['total_collected']}?
- ?? ??: {aggregate['total_after_cluster']}?
- ?? ??: {aggregate['by_category']['own']}?
- ??/??: {aggregate['by_category']['regulation']}?
- ??/??: {aggregate['by_category']['competitor'] + aggregate['by_category']['industry']}?
- ?? ?: {aggregate['by_tone']['neutral']}?
- ?? ?: {aggregate['by_tone']['negative']}?
- HIGH ??: {aggregate['risk_distribution']['HIGH']}?
- MEDIUM ??: {aggregate['risk_distribution']['MEDIUM']}?
- LOW ??: {aggregate['risk_distribution']['LOW']}?

??? ??:
{volume_text}

?? ?? ?? ??:
{own_negative_text}

?? ?? ??:
{top_text}

?? ??:
## ?? ???
3??. ?? ???? ???? ??? ?? ??? ? ??? ?? ? ?? ?? ??? ???.

## ?? ??
4??. ?? ???? ?? ?? ? ?? ?? ?? ?? ??, ?? ?? ??, ??/?? ??, ?? ?? ??? ?????.

## ??? ??
4? bullet. ?? ?? ??, ?? ?? ??, ??/??, GA/??? ??? ?? ?????. ?? ??? ??? ???? ?? ??? ?????.

## ?? ???
3? bullet. ?? ???? ???? ? ?? ??? ???.

?? ??:
- ?? 1,150? ??.
- ???? ?? ??(**)? ?? ???.
- ###, #### ??? ?? ???.
- ?? ?? ??? ?? ???.
- ? ???? ?? ??? ??? ??? ?????.
- "??", "??", "??", "?????", "?????"?? ?? ???? ??? ??? ????.
"""

    failures: list[dict] = []
    for model_name in gemini_helper.model_candidates():
        try:
            with console.status(f"[cyan]Gemini AI {model_name} {period_label} ??? ?? ?...[/]", spinner="dots"):
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config={"max_output_tokens": config.MAX_TOKENS, "temperature": 0.45},
                    request_options=gemini_helper.request_options(),
                )
            text = getattr(response, "text", "") or ""
            if text.strip():
                if failures:
                    console.print(f"[yellow]Gemini ?? ?? ?? ? {model_name}? ???? ??????.[/]")
                gemini_helper.record_response(response, model=model_name, purpose=f"period_report:{period_label}")
                gemini_helper.reset_circuit()
                return text
            failures.append({"model": model_name, "error": "empty_response", "quota": False})
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            quota = gemini_helper.is_quota_error(exc)
            failures.append(
                {
                    "model": model_name,
                    "error": gemini_helper.error_summary(exc),
                    "quota": quota,
                }
            )
            console.print(f"[yellow]Gemini {model_name} {period_label} ??? ?? ??: {exc}[/]")
            if quota:
                state = gemini_helper.trip_circuit(exc, model=model_name)
                console.print(f"[yellow]{gemini_helper.circuit_message(state)}[/]")
                break
    console.print("[yellow]Gemini ?? ??: ?? ???? Groq/?? ?? ???? ?????.[/]")
    return groq_or_rules_period_report(aggregate, top_articles, period_label, baseline, reason="gemini_failed")


def groq_or_rules_period_report(aggregate: dict, top_articles: list[dict], period_label: str, baseline: str, *, reason: str) -> str:
    if groq_helper.is_enabled():
        rows = [
            {
                "_score": article.get("_score", article.get("score", 0)),
                "title": article.get("title", ""),
                "source": article.get("source", ""),
                "_category": article.get("_category", article.get("category", "")),
                "_tone": article.get("_tone", article.get("tone", "")),
                "_summary": article.get("_summary", "") or article.get("summary", "") or article.get("description", ""),
            }
            for article in top_articles[:8]
        ]
        metrics = {
            "total_collected": aggregate.get("total_collected", 0),
            "total_after_cluster": aggregate.get("total_after_cluster", 0),
            "risk_level": "PERIOD",
            "fallback_reason": reason,
        }
        report = groq_helper.generate_period_report(rows, metrics, baseline, period_label)
        if report:
            return report
    return baseline


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
    risk_date_text = ", ".join(risk_dates) if risk_dates else "??"
    return f"""## ?? ???
{period_label} ?? ?? ??? {total_collected}?, ?? ?? ? ?? ??? {total_after_cluster}????. ?? ??? {own}???, ?? ?? ??? {own_negative_total}??? ?? ?? ?????. ?? ??? {top_keyword} ???? GA/??? ??? ????, ?? ?? ??? {risk_days}?? ??????.

## ?? ??
?? ?? ??? ??? ???? ??? ???, ?? ??? ?? ??? ?? ??? ??? ?? ?? ?????. ?? ???? {conversion}%?, ?? ??? ?? ??? ?? ???? ?? ??? ??? ?? ?????. ?? ?? ???? GA/??? ? ??? ??? ??? ? ? ??? ??????. ????? {peak_day.get('date', '-')}? {peak_day.get('total', 0)}??? ??? ?? ??, ?? ??? {latest_day.get('date', '-')}? {latest_day.get('total', 0)}??? ??????.

## ??? ??
- ?? ?? ??: {own_negative_total}???, ?? ?? ?? ??? ??? ???? ?? ?? ?????.
- ?? ?? ??: {negative}???, ??? ?? ?? ???? ???????? ??? ?? ???? ????.
- ??/??: {regulation}???, ?? ??? ?? ???? ?????? ???? ????.
- GA/??? ??: {market}???, ?? ?? ???? ?? ?? ??? ?? ?????.

## ?? ???
- {top_keyword}: {top_keyword_count}? ???? ?? ???? ?? ?? ??? ???? ???.
- {top_source}: {top_source_count}??? ?? ?? ??? ?? ??/??? ?? ??? ?? ?? ???.
- ?? ???: {risk_date_text} ??? ??? ?????, ?? ??? ????? ?? ???? ??? ?? ???."""


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

    def article_category(article: dict) -> str:
        return article.get("_category") or article.get("category") or ""

    def article_tone(article: dict) -> str:
        return article.get("_tone") or article.get("tone") or "neutral"

    def clean_article_title(title: str) -> str:
        title = re.sub(r"\s+", " ", title or "").strip()
        return title

    def article_meta(article: dict) -> str:
        parts = [
            article.get("_date") or article.get("date") or "-",
            article.get("source") or article.get("press") or "-",
            article.get("keyword") or "-",
        ]
        return " ? ".join(str(part) for part in parts if part)

    def article_brief(article: dict) -> dict:
        return {
            "title": clean_article_title(article.get("title", "")),
            "link": article.get("link", "#"),
            "meta": article_meta(article),
            "score": article.get("_score", article.get("score", 0)),
        }

    def pick_articles(predicate, limit: int = 3) -> list[dict]:
        selected: list[dict] = []
        seen: set[str] = set()
        for article in sorted(top_articles, key=lambda item: item.get("_score", item.get("score", 0)), reverse=True):
            if not predicate(article):
                continue
            key = article.get("link") or article.get("title", "")
            if key in seen:
                continue
            seen.add(key)
            selected.append(article_brief(article))
            if len(selected) >= limit:
                break
        return selected

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
        headline = f"?? ?? ?? {own_negative}?? ?? ?? {watch_days}?? ??? ??? ?? ?????."
    elif own_negative:
        headline = f"?? ?? ?? {own_negative}?? ???? ?? ??? ?? ??? ?? ???? ?????."
    elif own:
        headline = f"?? ?? {own}?? ????, ?? ?? ???? ?? ???? ??????."
    elif regulation >= max(3, market):
        headline = "????? ?? ??? ?? ?? ??? ?? ??? ?? ?? ??? ??????."
    else:
        headline = f"GA/?? ?? {market}?? ???? ?? ?? ??? ???? ?????."

    tracking_points = [
        {
            "title": "?? ??",
            "value": f"{own_negative}?",
            "body": "?? ?? ?? ??? ?? ?? ?? ??? ??? ?????." if own_negative else "?? ?? ?? ??? ?? ?? ?? ??? ?????.",
        },
        {
            "title": "?? ??",
            "value": f"{watch_days}?",
            "body": "HIGH/MEDIUM?? ??? ?? ????. ?? ? ??? ??? ???? ?????.",
        },
        {
            "title": "?? ?",
            "value": top_keyword,
            "body": "?? ??? ???? ?? ?? ?? ??? ?? ?? ?????.",
        },
    ]

    category_items = [
        ("own", "??", own, pct(own, total_collected), "??????? ?? ?? ?????. ??????????? ?? ??? ??? ???."),
        ("regulation", "??", regulation, pct(regulation, total_collected), "????????? ?????. ?? ???? ?? ??? ?????."),
        ("market", "GA/??", market, pct(market, total_collected), "GA????????? ?? ?????. ?? ?? ??? ?? ?? ????."),
        ("other", "??", cats.get("other", 0), pct(cats.get("other", 0), total_collected), "?? ??? ?? ???? ?? ?? ?????."),
    ]
    categories = [
        {"key": key, "label": label, "value": f"{value:,}?", "share": share, "bar_share": bar_share(share), "note": note}
        for key, label, value, share, note in category_items
    ]
    risk_items = [
        ("negative", "?? ??", tones.get("negative", 0), pct(tones.get("negative", 0), tone_total), "?? ?? ?? ? ?? ??? ??? ?????."),
        ("own-negative", "?? ??", own_negative, pct(own_negative, tone_total), "??? ?? ??? ?? ?????. ?? ?? ??? ??? ???."),
        ("watch-days", "?? ???", watch_days, pct(watch_days, period_days), "HIGH ?? MEDIUM?? ??? ?? ????. ?? ??? ??? ?? ?????."),
        ("neutral", "?? ??", tones.get("neutral", 0), pct(tones.get("neutral", 0), tone_total), "?? ??? ?? ?????. ?? ???? ?? ?????."),
    ]
    risk_mix = [
        {
            "key": key,
            "label": label,
            "value": f"{value:,}?" if key == "watch-days" else f"{value:,}?",
            "share": share,
            "bar_share": bar_share(share),
            "note": note,
        }
        for key, label, value, share, note in risk_items
    ]
    density_rows = [
        {"label": "??/??", "value": f"{aggregate.get('total_collected', 0):,} / {aggregate.get('total_after_cluster', 0):,}", "note": f"?? ?? ? {round(aggregate.get('total_after_cluster', 0) / total_collected * 100)}%"},
        {"label": "???? ??", "value": f"{aggregate.get('period_days', 0)}? ? {aggregate.get('period_windows', 0)}?", "note": f"??? {aggregate.get('avg_daily_collected', 0)}?"},
        {"label": "?? ???", "value": f"{aggregate.get('max_daily_total', 0):,}?", "note": "? ?? ?? ???"},
        {"label": "?? ???", "value": top_keyword, "note": "?? ?? ?? ???"},
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
    risk_date_text = ", ".join(risk_dates) if risk_dates else "??"
    top_source = top_sources[0].get("source", "-") if top_sources else "-"
    top_source_count = top_sources[0].get("count", 0) if top_sources else 0
    negative_count = tones.get("negative", 0)
    interpretation_notes = [
        {
            "title": "?? ??",
            "body": f"{top_keyword} ???? ?? ?? ???, GA/?? ?? {market:,}?? ?? ??? ?????. ?? ??? {own:,}??? ?? ????? ??? ?? ?? ?????.",
        },
        {
            "title": "??? ??",
            "body": f"?? ?? {negative_count:,}? ? ?? ?? ??? {own_negative:,}????. ???? ???????? ?? ???? ??? ?? ??? ?? ? ????.",
        },
        {
            "title": "?? ??",
            "body": f"?? ???? {peak_day.get('date', '-')} {peak_day.get('total', 0):,}?, ?? ???? {latest_day.get('date', '-')} {latest_day.get('total', 0):,}????. ?? ???? {risk_date_text}???.",
        },
        {
            "title": "?? ??",
            "body": f"?? ??? {top_source} {top_source_count:,}????. ?? ?? ??? ????? ??? ?? ?? ??? ????? ??? ?? ??? ?? ?? ???.",
        },
    ]
    evidence_groups = [
        {
            "title": "?? ?? ??",
            "count": own,
            "judgment": (
                f"?? ?? {own:,}? ? ?? ??? {own_negative:,}????. "
                "????? ??? ?? ??? ??? ??? ?? ??? ?? ???? ?? ???."
            ),
            "articles": pick_articles(lambda article: article_category(article) == "own", 3),
        },
        {
            "title": "??/?? ??",
            "count": regulation,
            "judgment": (
                f"??/?? ??? {regulation:,}????. "
                "?? ?? ??? ????? GA??? ?? ??? ??? ? ? ?? ?? ?? ?????."
            ),
            "articles": pick_articles(lambda article: article_category(article) == "regulation", 3),
        },
        {
            "title": "?? ?? ??",
            "count": negative_count,
            "judgment": (
                f"?? ?? {negative_count:,}? ? ?? ?? ??? {own_negative:,}????. "
                "???? ????????? ?? ??? ??? ?? ??? ??? ???? ???."
            ),
            "articles": pick_articles(lambda article: article_tone(article) == "negative", 3),
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
        "evidence_groups": evidence_groups,
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


def month_bounds(month_value: str) -> tuple[date, date]:
    match = re.fullmatch(r"(20\d{2})-(0[1-9]|1[0-2])", str(month_value or "").strip())
    if not match:
        raise ValueError("?? ??? ?? YYYY-MM ???? ???? ???.")
    year = int(match.group(1))
    month = int(match.group(2))
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    return start, end


def month_slug(start: date) -> str:
    return f"monthly_{start.year}_{start.month:02d}"


def get_period(period: str, custom_arg: str | int | None = None) -> tuple[date, date, str, str, str]:
    today = today_kst()
    if period == "weekly":
        start = today - timedelta(days=today.weekday())
        return start, today, "??", "WEEKLY REPORT", "weekly"
    if period == "weekly_previous":
        start = today - timedelta(days=today.weekday() + 7)
        return start, start + timedelta(days=6), "?? ??", "WEEKLY REPORT", "weekly"
    if period == "monthly":
        if custom_arg and re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", str(custom_arg).strip()):
            start, end = month_bounds(str(custom_arg).strip())
            return start, end, f"{start.year}? {start.month}? ??", "MONTHLY REPORT", month_slug(start)
        return today.replace(day=1), today, "??", "MONTHLY REPORT", "monthly"
    if period == "monthly_previous":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end, "?? ??", "MONTHLY REPORT", "monthly"

    days = int(custom_arg) if custom_arg else 7
    start = today - timedelta(days=days - 1)
    return start, today, f"?? {days}?", f"{days}-DAY REPORT", "custom"


def run(period: str, custom_arg: str | int | None = None) -> Path | None:
    start, end, label, badge, output_slug = get_period(period, custom_arg)

    console.print(Panel.fit(
        f"[bold cyan]{label} ???? ??? ??[/]\n{start.isoformat()} ~ {end.isoformat()}",
        border_style="cyan",
    ))

    daily_data = archiver.load_between(start, end)
    if not daily_data:
        console.print("[red]??? ?? ???? ????.[/]")
        console.print("[dim]?? run_once.py? ??? ?? ???? ?????.[/]")
        return None

    aggregate = archiver.aggregate_metrics(daily_data)
    top_articles = archiver.collect_top_articles(daily_data, limit=800)
    trend_days = aggregate.get("daily_volume", [])[-12:]
    risk_trend_days = aggregate.get("daily_own_negative", [])[-12:]
    max_trend_total = max((d["total"] for d in trend_days), default=0)
    max_own_trend_total = max((d.get("own", 0) for d in trend_days), default=0)

    console.print(
        f"[green]OK[/] {aggregate['period_days']}?/{aggregate.get('period_windows', len(daily_data))}?? ??? ?? | "
        f"?? {_fmt_count(aggregate['total_collected'])}? | "
        f"?? {_fmt_count(aggregate['total_after_cluster'])}? | "
        f"?? {aggregate['by_category']['own']}? | "
        f"?? {aggregate['by_tone']['negative']}?"
    )

    ai_report = generate_ai_report(aggregate, top_articles, label)
    report_context = build_report_context(aggregate, top_articles)
    console.print(Panel(
        Markdown(ai_report),
        title=f"[bold cyan]{label} ?? ??[/]",
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
        max_own_trend_total=max_own_trend_total,
        max_neg=max_neg,
        ai_report_html=markdown_to_html(ai_report),
        top_articles=top_articles[:10],
        dashboard_url=public_urls.dashboard_url(),
    )

    out_path = LOG_DIR / f"{output_slug}_report_{now_kst().strftime('%Y%m%d_%H%M')}.html"
    out_path.write_text(html, encoding="utf-8")
    console.print(f"[green]HTML ?? ??:[/] {out_path}")

    latest_path = LOG_DIR / f"{output_slug}_report.html"
    latest_path.write_text(html, encoding="utf-8")

    if not os.getenv("CI"):
        os.startfile(out_path)

    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        console.print("???: python period_report.py weekly|weekly_previous|monthly|monthly_previous|custom [days|YYYY-MM]")
        sys.exit(1)

    arg = sys.argv[1]
    extra_arg = sys.argv[2] if len(sys.argv) > 2 else None
    if arg == "custom" and extra_arg and extra_arg.isdigit():
        extra_arg = int(extra_arg)
    run(arg, extra_arg)
