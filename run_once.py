"""
1회 실행 스크립트
- 수집 → AI 브리핑 → HTML 저장 (이메일은 .env에 설정 있을 때만)
- scheduler.py와 달리 무한루프 없이 종료
"""

import sys
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from news_collector import collect_news
from ai_briefing import run_briefing

if __name__ == "__main__":
    articles = collect_news()
    run_briefing(articles)
