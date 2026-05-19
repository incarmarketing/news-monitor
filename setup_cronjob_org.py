"""Create or update cron-job.org jobs for the monitoring workflows.

Required environment variables:
  CRONJOB_API_KEY          cron-job.org API key
  GITHUB_DISPATCH_TOKEN    GitHub token with Actions read/write permission

Optional:
  CRONJOB_ENABLED          true/false, default true
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

import requests
from dotenv import load_dotenv

OWNER = "incarmarketing"
REPO = "news-monitor"
CRON_ENDPOINT = "https://api.cron-job.org"
GITHUB_API_VERSION = "2022-11-28"
TIMEZONE = "Asia/Seoul"


@dataclass(frozen=True)
class CronSpec:
    title: str
    workflow: str
    body: dict
    minutes: list[int]
    hours: list[int]
    wdays: list[int]
    mdays: list[int]
    months: list[int]


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} 환경변수가 필요합니다.")
    return value


def github_dispatch_url(workflow: str) -> str:
    return f"https://api.github.com/repos/{OWNER}/{REPO}/actions/workflows/{workflow}/dispatches"


def job_payload(spec: CronSpec, github_token: str, enabled: bool) -> dict:
    return {
        "job": {
            "enabled": enabled,
            "title": spec.title,
            "url": github_dispatch_url(spec.workflow),
            "saveResponses": True,
            "requestMethod": 1,  # POST
            "requestTimeout": 60,
            "redirectSuccess": False,
            "schedule": {
                "timezone": TIMEZONE,
                "expiresAt": 0,
                "hours": spec.hours,
                "mdays": spec.mdays,
                "minutes": spec.minutes,
                "months": spec.months,
                "wdays": spec.wdays,
            },
            "notification": {
                "onFailure": True,
                "onFailureCount": 1,
                "onSuccess": True,
                "onDisable": True,
            },
            "extendedData": {
                "headers": {
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {github_token}",
                    "X-GitHub-Api-Version": GITHUB_API_VERSION,
                    "Content-Type": "application/json",
                },
                "body": json.dumps(spec.body, ensure_ascii=False),
            },
        }
    }


def specs() -> list[CronSpec]:
    weekdays = [1, 2, 3, 4, 5]
    all_months = [-1]
    every_day = [-1]
    return [
        CronSpec(
            title="news-monitor negative watch",
            workflow="negative-watch.yml",
            body={"ref": "main"},
            minutes=[0, 10, 20, 30, 40, 50],
            hours=list(range(7, 19)),
            wdays=weekdays,
            mdays=every_day,
            months=all_months,
        ),
        CronSpec(
            title="news-monitor daily 08",
            workflow="news-briefing.yml",
            body={
                "ref": "main",
                "inputs": {"period_reports": "none", "send_kakao": "true", "report_slot": "08"},
            },
            minutes=[0],
            hours=[8],
            wdays=weekdays,
            mdays=every_day,
            months=all_months,
        ),
        CronSpec(
            title="news-monitor daily 13",
            workflow="news-briefing.yml",
            body={
                "ref": "main",
                "inputs": {"period_reports": "none", "send_kakao": "true", "report_slot": "13"},
            },
            minutes=[0],
            hours=[13],
            wdays=weekdays,
            mdays=every_day,
            months=all_months,
        ),
        CronSpec(
            title="news-monitor daily 18",
            workflow="news-briefing.yml",
            body={
                "ref": "main",
                "inputs": {"period_reports": "none", "send_kakao": "true", "report_slot": "18"},
            },
            minutes=[0],
            hours=[18],
            wdays=weekdays,
            mdays=every_day,
            months=all_months,
        ),
        CronSpec(
            title="news-monitor weekly report",
            workflow="news-briefing.yml",
            body={
                "ref": "main",
                "inputs": {"period_reports": "weekly", "send_kakao": "true", "report_slot": "auto"},
            },
            minutes=[0],
            hours=[7],
            wdays=[1],
            mdays=every_day,
            months=all_months,
        ),
        CronSpec(
            title="news-monitor monthly report",
            workflow="news-briefing.yml",
            body={
                "ref": "main",
                "inputs": {"period_reports": "monthly", "send_kakao": "true", "report_slot": "auto"},
            },
            minutes=[0],
            hours=[7],
            wdays=[-1],
            mdays=[1],
            months=all_months,
        ),
    ]


def cron_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def list_jobs(api_key: str) -> list[dict]:
    response = requests.get(f"{CRON_ENDPOINT}/jobs", headers=cron_headers(api_key), timeout=20)
    response.raise_for_status()
    return response.json().get("jobs", [])


def upsert_job(api_key: str, spec: CronSpec, github_token: str, enabled: bool, existing: dict[str, int]) -> int:
    payload = job_payload(spec, github_token, enabled)
    if spec.title in existing:
        job_id = existing[spec.title]
        response = requests.patch(
            f"{CRON_ENDPOINT}/jobs/{job_id}",
            headers=cron_headers(api_key),
            data=json.dumps(payload),
            timeout=20,
        )
        response.raise_for_status()
        print(f"updated: {spec.title} ({job_id})")
        return job_id

    response = requests.put(
        f"{CRON_ENDPOINT}/jobs",
        headers=cron_headers(api_key),
        data=json.dumps(payload),
        timeout=20,
    )
    response.raise_for_status()
    job_id = int(response.json()["jobId"])
    print(f"created: {spec.title} ({job_id})")
    time.sleep(1.1)  # cron-job.org create API limit: 1 request/sec
    return job_id


def main() -> None:
    load_dotenv()
    cron_api_key = require_env("CRONJOB_API_KEY")
    github_token = require_env("GITHUB_DISPATCH_TOKEN")
    enabled = os.getenv("CRONJOB_ENABLED", "true").lower() in {"1", "true", "yes", "y"}

    existing = {job.get("title", ""): int(job["jobId"]) for job in list_jobs(cron_api_key)}
    created_or_updated = [
        upsert_job(cron_api_key, spec, github_token, enabled, existing)
        for spec in specs()
    ]
    print("done:", created_or_updated)


if __name__ == "__main__":
    main()
