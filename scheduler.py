"""
언론 모니터링 자동 스케줄러
- 지정된 시간에 수집 → AI 브리핑 → 이메일 자동 실행
- 에러 발생 시에도 다음 스케줄까지 살아있도록 보호
"""

import sys
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import schedule
import time
import traceback
from datetime import datetime
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

import config
from news_collector import collect_news
from ai_briefing import run_briefing

console = Console()


def run_pipeline():
    try:
        articles = collect_news()
        run_briefing(articles)
        console.print(Panel.fit(
            f"[bold green]✓ 파이프라인 완료[/]  [dim]{datetime.now().strftime('%H:%M:%S')}[/]",
            border_style="green",
        ))
    except Exception as e:
        console.print(Panel(
            f"[bold red]파이프라인 오류[/]\n\n{e}\n\n[dim]{traceback.format_exc()}[/]",
            border_style="red",
        ))


def show_banner():
    banner = Text()
    banner.append("AI 언론 모니터링 시스템\n", style="bold cyan")
    banner.append(f"실행 시간: ", style="dim")
    banner.append(", ".join(config.SCHEDULE_TIMES), style="bold yellow")
    banner.append(f"\n키워드: ", style="dim")
    banner.append(f"{len(config.KEYWORDS)}개", style="bold")
    banner.append(f"\n중지: ", style="dim")
    banner.append("Ctrl+C", style="bold red")
    console.print(Panel(banner, title="[bold]🚀 Scheduler[/]", border_style="cyan", padding=(1, 2)))


if __name__ == "__main__":
    show_banner()

    for t in config.SCHEDULE_TIMES:
        schedule.every().day.at(t).do(run_pipeline)

    # 시작 즉시 1회 실행
    console.print("\n[dim]→ 시작 시 1회 즉시 실행합니다...[/]\n")
    run_pipeline()

    console.print(f"\n[dim]다음 예약: {schedule.next_run().strftime('%Y-%m-%d %H:%M')}[/]")

    try:
        while True:
            schedule.run_pending()
            time.sleep(30)
    except KeyboardInterrupt:
        console.print("\n[yellow]스케줄러 종료[/]")
