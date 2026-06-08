"""Public URL helpers for GitHub Pages hosted reports."""

from __future__ import annotations

import os

DEFAULT_PUBLIC_BASE_URL = "https://your-github-id.github.io/your-repo/"


def public_base_url() -> str:
    configured = (
        os.getenv("DASHBOARD_PUBLIC_URL", "").strip()
        or os.getenv("REPORT_PUBLIC_URL", "").strip()
    )
    if configured and not is_local_url(configured):
        return configured
    return DEFAULT_PUBLIC_BASE_URL


def dashboard_url() -> str:
    return join_public_url(site_root_url(public_base_url()), "dashboard.html")


def join_public_url(base_url: str, path: str) -> str:
    clean = base_url.split("?", 1)[0].strip()
    if clean.endswith("index.html"):
        clean = clean[: -len("index.html")]
    elif clean.endswith(".html"):
        clean = clean.rsplit("/", 1)[0] + "/"
    if not clean.endswith("/"):
        clean += "/"
    return clean + path.lstrip("/")


def site_root_url(url: str) -> str:
    clean = url.split("?", 1)[0].strip()
    for marker in ("/reports/", "/daily/", "/weekly/", "/monthly/", "/period_reports/"):
        index = clean.find(marker)
        if index >= 0:
            return clean[:index] + "/"
    return clean


def is_local_url(url: str) -> bool:
    lowered = url.lower()
    return (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or "::1" in lowered
        or lowered.startswith("file:")
    )
