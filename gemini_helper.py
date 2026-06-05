"""Shared Gemini failover and quota diagnostics."""

from __future__ import annotations

import config


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


def set_ai_failure_metrics(metrics: dict, failures: list[dict], *, used_model: str) -> None:
    quota_exhausted = any(item.get("quota") for item in failures)
    metrics["ai_model_used"] = used_model
    metrics["ai_primary_failed"] = bool(failures)
    metrics["ai_fallback_used"] = used_model != config.GEMINI_MODEL
    metrics["ai_quota_exhausted"] = quota_exhausted
    if failures:
        metrics["ai_errors"] = failures[:3]
