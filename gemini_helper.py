"""Shared Gemini failover, quota diagnostics, and circuit breaker."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import config

UTC = timezone.utc
DEFAULT_CIRCUIT_PATH = Path(".run-state") / "gemini_circuit.json"
DEFAULT_USAGE_PATH = Path(".run-state") / "gemini_usage.json"


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


def unique_models(models: list[str]) -> list[str]:
    result: list[str] = []
    for model in models:
        model = (model or "").strip()
        if model and model not in result:
            result.append(model)
    return result


def pro_model_candidates() -> list[str]:
    return unique_models([getattr(config, "GEMINI_PRO_MODEL", ""), config.GEMINI_MODEL])


def flash_model_candidates() -> list[str]:
    return unique_models([
        getattr(config, "GEMINI_FLASH_MODEL", ""),
        getattr(config, "GEMINI_FLASH_LITE_MODEL", ""),
    ])


def model_candidates_for_purpose(purpose: str, preferred: list[str] | None = None) -> list[str]:
    if preferred:
        return unique_models(preferred)

    purpose_key = (purpose or "").lower()
    if purpose_key in {"article_context_classification", "issue_summary", "issue_summary_batch"}:
        configured = (
            getattr(config, "GEMINI_ISSUE_MODEL", "")
            if purpose_key.startswith("issue_summary")
            else getattr(config, "GEMINI_CONTEXT_MODEL", "")
        )
        return unique_models([configured, *flash_model_candidates()])

    if purpose_key.startswith("daily_report") or purpose_key.startswith("period_report"):
        return unique_models([
            getattr(config, "GEMINI_REPORT_MODEL", ""),
            *pro_model_candidates(),
            *getattr(config, "GEMINI_FALLBACK_MODELS", []),
        ])

    if purpose_key in {"article_context_pro_review", "press_release", "risk_response", "scrap_analysis"}:
        return pro_model_candidates()

    return model_candidates()


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


def usage_path() -> Path:
    return Path(os.getenv("GEMINI_USAGE_PATH", "") or DEFAULT_USAGE_PATH)


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
    write_usage_state(
        {
            "status": "quota_error" if reason == "quota_or_rate_limit" else "credit_depleted",
            "model": model,
            "captured_at": current.isoformat(),
            "error": error_summary(error),
        }
    )
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


def extract_usage_metadata(response: object) -> dict:
    raw = getattr(response, "usage_metadata", None) or getattr(response, "usageMetadata", None)
    if raw is None and isinstance(response, dict):
        raw = response.get("usageMetadata") or response.get("usage_metadata")
    if raw is None:
        return {}

    def get_value(*names: str) -> int | None:
        for name in names:
            value = raw.get(name) if isinstance(raw, dict) else getattr(raw, name, None)
            if value is not None:
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None
        return None

    fields = {
        "prompt_token_count": get_value("prompt_token_count", "promptTokenCount"),
        "candidates_token_count": get_value("candidates_token_count", "candidatesTokenCount"),
        "thoughts_token_count": get_value("thoughts_token_count", "thoughtsTokenCount"),
        "total_token_count": get_value("total_token_count", "totalTokenCount"),
    }
    return {key: value for key, value in fields.items() if value is not None}


def record_response(response: object, *, model: str, purpose: str) -> dict:
    usage = extract_usage_metadata(response)
    state = {
        "status": "success",
        "model": model,
        "purpose": purpose,
        "captured_at": now_utc().isoformat(),
        "model_version": getattr(response, "model_version", "") or getattr(response, "modelVersion", ""),
        "response_id": getattr(response, "response_id", "") or getattr(response, "responseId", ""),
        "usage": usage,
    }
    write_usage_state(state)
    return state


def read_usage_state() -> dict:
    path = usage_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_usage_state(state: dict) -> None:
    path = usage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
