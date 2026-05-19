"""Print cron-job.org job status and recent execution history."""

from __future__ import annotations

import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

CRON_ENDPOINT = "https://api.cron-job.org"
TARGET_TITLES = {
    "news-monitor negative watch",
    "news-monitor daily 08",
    "news-monitor daily 13",
    "news-monitor daily 18",
    "news-monitor weekly report",
    "news-monitor monthly report",
}


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} 환경변수가 필요합니다.")
    return value


def headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def fmt_ts(value: int | None) -> str:
    if not value:
        return "-"
    return datetime.fromtimestamp(value, tz=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def get_json(api_key: str, path: str) -> dict:
    response = requests.get(f"{CRON_ENDPOINT}{path}", headers=headers(api_key), timeout=20)
    response.raise_for_status()
    return response.json()


def main() -> None:
    load_dotenv()
    api_key = require_env("CRONJOB_API_KEY")
    jobs = get_json(api_key, "/jobs").get("jobs", [])
    jobs = [job for job in jobs if job.get("title") in TARGET_TITLES]

    if not jobs:
        print("news-monitor cron jobs를 찾지 못했습니다.")
        return

    for job in sorted(jobs, key=lambda item: item.get("title", "")):
        job_id = job["jobId"]
        print("=" * 72)
        print(f"{job.get('title')} ({job_id})")
        print(f"enabled={job.get('enabled')} lastStatus={job.get('lastStatus')} lastExecution={fmt_ts(job.get('lastExecution'))}")
        print(f"nextExecution={fmt_ts(job.get('nextExecution'))}")
        print(f"schedule={job.get('schedule')}")

        history = get_json(api_key, f"/jobs/{job_id}/history")
        predictions = history.get("predictions", [])
        if predictions:
            print("predictions:", ", ".join(fmt_ts(value) for value in predictions[:3]))
        items = history.get("history", [])[:3]
        if not items:
            print("history: none")
            continue
        for item in items:
            print(
                f"history: planned={fmt_ts(item.get('datePlanned'))} "
                f"actual={fmt_ts(item.get('date'))} "
                f"status={item.get('status')} {item.get('statusText')} "
                f"http={item.get('httpStatus')}"
            )


if __name__ == "__main__":
    main()
