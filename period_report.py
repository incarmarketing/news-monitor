"""
주간/월간 모니터링 리포트 생성
사용법:
    python period_report.py weekly        # 최근 7일
    python period_report.py monthly       # 최근 30일
    python period_report.py custom 14     # 최근 N일

- archiver에 저장된 일일 데이터를 누적
- 트렌드/카테고리/리스크 일수 집계
- Gemini로 종합 분석 리포트 생성
- HTML로 저장 + 자동 열기
"""

import sys
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import os
import re
from pathlib import Path
from datetime import date, timedelta, datetime
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
import google.generativeai as genai

import config
import archiver

load_dotenv()
console = Console()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)


# ── AI 종합 리포트 ─────────────────────────────────────────
def generate_ai_report(aggregate: dict, top_articles: list[dict], period_label: str) -> str:
    if not GEMINI_API_KEY:
        return "[GEMINI_API_KEY가 없어 AI 종합 리포트를 생성할 수 없습니다.]"

    top_text = "\n".join(
        f"- [{a.get('_date', '')}|{a.get('_tone', 'neutral').upper()}|점수{a.get('_score', 0)}] "
        f"{a.get('title', '')[:80]}"
        for a in top_articles[:25]
    )

    trend_text = "\n".join(
        f"- {d['date']}: 자사 부정 {d['value']}건"
        for d in aggregate.get("daily_own_negative", [])
    )

    prompt = f"""당신은 {config.COMPANY_NAME} {config.TEAM_NAME}의 시니어 언론 모니터링 분석가입니다.
{period_label} 기간 동안의 누적 모니터링 데이터를 바탕으로 {period_label} 종합 리포트를 작성해주세요.

# 분석 기간
{aggregate['period_days']}일

# 누적 지표
- 총 수집 (클러스터 후): {aggregate['total_after_cluster']}건
- 자사 언급: {aggregate['by_category']['own']}건
- 규제·제도: {aggregate['by_category']['regulation']}건
- 경쟁사: {aggregate['by_category']['competitor']}건
- 업계 일반: {aggregate['by_category']['industry']}건
- 부정 톤 누적: {aggregate['by_tone']['negative']}건
- 긍정 톤 누적: {aggregate['by_tone']['positive']}건
- 리스크 HIGH 일수: {aggregate['risk_distribution']['HIGH']}일 / MEDIUM: {aggregate['risk_distribution']['MEDIUM']}일

# 자사 부정 이슈 일별 추이
{trend_text}

# 기간 내 주요 기사 TOP 25 (점수 순)
{top_text}

---

# 리포트 형식

## {period_label} 핵심 결론
3~4줄로 기간 동안의 가장 중요한 흐름. 단순 사실 나열 금지, 의미 해석 중심.

## 트렌드 분석
- 자사 부정 이슈가 어떤 패턴으로 발생했는지 (집중/산발/특정 시점 급증 등)
- 카테고리별 비중이 시사하는 바
- 리스크 HIGH 일수가 의미하는 것

## 기간 내 핵심 이슈 TOP 3
각 이슈마다:
- 이슈명
- 노출 정도 / 확산 양상
- 누적 영향 평가
- 후속 대응 권고

## 카테고리별 인사이트
### 자사 동향
### 규제·제도
### 경쟁사
### 업계
각 1~2 문단. "그래서 우리에게 무슨 의미인가" 중심.

## 다음 기간 전략 제언
| 우선순위 | 액션 | 기대효과 |
|---------|------|---------|
표 형식. 3~5개 항목. 구체적이고 실행 가능하게.

## 지속 추적 필요 키워드
bullet 5~7개

---

작성 원칙:
- 단순 카운트 나열 금지. 추이와 의미 중심
- 데이터에 근거하지 않은 추측 금지
- 굵게 표시용 ** 문법 사용 금지
- 분량: A4 2장 분량으로 충분히 분석
"""

    with console.status(f"[cyan]Gemini AI {period_label} 리포트 작성 중...[/]", spinner="dots"):
        model = genai.GenerativeModel(config.GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config={"max_output_tokens": config.MAX_TOKENS, "temperature": 0.5},
        )
    return response.text


# ── 마크다운 → HTML (간이) ──────────────────────────────────
def markdown_to_html(md: str) -> str:
    html = md
    html = html.replace("**", "")
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)

    def _table(match):
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


# ── 메인 실행 ───────────────────────────────────────────────
def run(period: str, custom_days: int | None = None):
    if period == "weekly":
        today = date.today()
        start = today - timedelta(days=today.weekday())
        end = today
        label = "주간"
        badge = "WEEKLY REPORT"
    elif period == "monthly":
        today = date.today()
        start = today.replace(day=1)
        end = today
        label = "월간"
        badge = "MONTHLY REPORT"
    else:
        days = custom_days or 7
        end = date.today()
        start = end - timedelta(days=days - 1)
        label = f"최근 {days}일"
        badge = f"{days}-DAY REPORT"

    console.print(Panel.fit(
        f"[bold cyan]{label} 모니터링 리포트 생성[/]",
        border_style="cyan",
    ))

    # 1. 데이터 로드
    daily_data = archiver.load_between(start, end)
    if not daily_data:
        console.print("[red]✗ 누적된 일일 데이터가 없습니다.[/]")
        console.print("[dim]먼저 run_once.py를 며칠간 실행해서 데이터를 쌓으세요.[/]")
        return

    console.print(f"[green]✓[/] {len(daily_data)}일치 데이터 로드 완료")

    # 2. 집계
    aggregate = archiver.aggregate_metrics(daily_data)
    top = archiver.collect_top_articles(daily_data, limit=20)

    console.print(
        f"  [dim]자사 {aggregate['by_category']['own']}건 · "
        f"부정 {aggregate['by_tone']['negative']}건 · "
        f"HIGH 리스크 {aggregate['risk_distribution']['HIGH']}일[/]"
    )

    # 3. AI 종합 리포트
    ai_report = generate_ai_report(aggregate, top, label)

    console.print(Panel(
        Markdown(ai_report),
        title=f"[bold cyan]{label} 종합 리포트[/]",
        border_style="cyan",
        padding=(1, 2),
    ))

    # 4. HTML 빌드
    env = Environment(loader=FileSystemLoader(BASE_DIR / "templates"))
    template = env.get_template("period_report.html")
    max_neg = max((d["value"] for d in aggregate.get("daily_own_negative", [])), default=0)

    html = template.render(
        period_label=label,
        period_badge=badge,
        period_range=f"{start.isoformat()} ~ {end.isoformat()}",
        company=config.COMPANY_NAME,
        team=config.TEAM_NAME,
        aggregate=aggregate,
        max_neg=max_neg,
        ai_report_html=markdown_to_html(ai_report),
        top_articles=top,
    )

    # 5. 저장 + 열기
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    out_path = LOG_DIR / f"{period}_report_{ts}.html"
    out_path.write_text(html, encoding="utf-8")
    console.print(f"\n[green]✓[/] 리포트 저장: [bold cyan]{out_path.name}[/]")

    if os.getenv("CI"):
        return out_path

    try:
        os.startfile(str(out_path))
        console.print("[dim]→ 기본 브라우저에서 자동으로 열림[/]")
    except Exception:
        console.print(f"[dim]브라우저에서 직접 열기: {out_path}[/]")

    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        console.print("[yellow]사용법:[/]")
        console.print("  python period_report.py weekly")
        console.print("  python period_report.py monthly")
        console.print("  python period_report.py custom 14")
        sys.exit(0)

    period = sys.argv[1]
    custom = int(sys.argv[2]) if len(sys.argv) > 2 else None
    run(period, custom)
