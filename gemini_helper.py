"""Shared Gemini failover, quota diagnostics, and circuit breaker."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import config

UTC = timezone.utc
DEFAULT_CIRCUIT_PATH = Path(".run-state") / "gemini_circuit.json"


def model_candidates() -> list[str]:
    models: list[str] = []

    def add(model: str) -> None:
        model = (model or "").strip()
        if model and model not in models:
            models.append(model)

    add(config.GEMINI_MODEL)
    for model in getattr(config, "GEMINI_FALLBACK_MODELS", []):
        add(model)
    return models


def error_summary(error: Exception) -> str:
    return " ".join(str(error).split())[:500]


def is_quota_error(error: Exception) -> bool:
    text = error_summary(error).lower()
    quota_terms = (
        "resource_exhausted",
        "429",
        "quota",
        "rate limit",
        "rate_limit",
        "no available credits",
        "credits are depleted",
        "prepay",
        "billing",
        "exceeded your current quota",
    )
    return any(term in text for term in quota_terms)


def is_credit_error(error: Exception) -> bool:
    text = error_summary(error).lower()
    return any(
        term in text
        for term in (
            "prepayment credits are depleted",
            "credits are depleted",
            "no available credits",
            "prepay",
            "billing",
        )
    )


def request_options() -> dict:
    return {"timeout": config.GEMINI_TIMEOUT_SECONDS, "retry": None}


def circuit_path() -> Path:
    return Path(os.getenv("GEMINI_CIRCUIT_PATH", "") or DEFAULT_CIRCUIT_PATH)


def now_utc() -> datetime:
    return datetime.now(UTC)


def parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None


def read_circuit() -> dict:
    path = circuit_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_circuit(state: dict) -> None:
    path = circuit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def circuit_open() -> tuple[bool, dict]:
    if config.GEMINI_CIRCUIT_DISABLED:
        return False, {}
    state = read_circuit()
    until = parse_datetime(state.get("blocked_until"))
    if until and until > now_utc():
        return True, state
    return False, state


def circuit_message(state: dict) -> str:
    reason = state.get("reason", "unknown")
    until = parse_datetime(state.get("blocked_until"))
    until_text = until.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST") if until else "-"
    return f"Gemini circuit open: {reason} until {until_text}"


def trip_circuit(error: Exception, *, model: str = "") -> dict:
    reason = "credit_depleted" if is_credit_error(error) else "quota_or_rate_limit"
    hours = config.GEMINI_CIRCUIT_CREDIT_HOURS if reason == "credit_depleted" else config.GEMINI_CIRCUIT_HOURS
    current = now_utc()
    state = {
        "status": "open",
        "reason": reason,
        "model": model,
        "blocked_at": current.isoformat(),
        "blocked_until": (current + timedelta(hours=hours)).isoformat(),
        "error": error_summary(error),
    }
    write_circuit(state)
    return state


def reset_circuit() -> None:
    path = circuit_path()
    if path.exists():
        path.unlink()


def set_ai_failure_metrics(metrics: dict, failures: list[dict], *, used_model: str) -> None:
    quota_exhausted = any(item.get("quota") for item in failures)
    metrics["ai_model_used"] = used_model
    metrics["ai_primary_failed"] = bool(failures)
    metrics["ai_fallback_used"] = used_model != config.GEMINI_MODEL
    metrics["ai_quota_exhausted"] = quota_exhausted
    if failures:
        metrics["ai_errors"] = failures[:3]
