"""Versioned admission checks for narrow repairs, not population accuracy."""

import copy
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from tools import validate_classification_gold as gold

VERSION = "scoped-v2"
CASE_PATH = Path(__file__).resolve().parents[1] / "tests/fixtures/classification_maintenance_v2.json"


def load_cases():
    data = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    cases = data["cases"]
    if len({case["case"] for case in cases}) != len(cases):
        raise RuntimeError("duplicate maintenance validation case")
    for case in cases:
        if (not isinstance(case.get("expected_own_mentioned"), bool)
                or not isinstance(case.get("expected_alert_eligible"), bool)
                or not case.get("article", {}).get("title")):
            raise RuntimeError("unreviewed maintenance validation label")
    return cases


def case_row(case, index):
    article = copy.deepcopy(case["article"])
    row = {
        "id": index + 1, "article_hash": hashlib.sha256(case["case"].encode()).hexdigest(),
        "title": article.pop("title"), "link": f"https://example.com/validation/{index}",
        "updated_at": "2026-09-15T00:00:00+00:00", "raw": article,
        "category": case.get("stored_category", "industry"), "tone": "neutral",
        "own_mentioned": False, "alert_eligible": False, "negative_target": "none",
    }
    stored = copy.deepcopy(case.get("stored", {}))
    if stored.pop("manual", False):
        row["classification_provider"] = "manual:review"
    row.update(stored)
    return row


def validate(build_plan):
    cases = load_cases()
    tp = fp = fn = own_ok = 0
    common_mismatches = []
    for case in cases:
        context = gold.classify(case["article"])
        expected, predicted = case["expected_alert_eligible"], bool(context.get("alert_eligible"))
        tp += int(expected and predicted)
        fp += int(not expected and predicted)
        fn += int(expected and not predicted)
        own_match = bool(context.get("own_mentioned")) == case["expected_own_mentioned"]
        own_ok += int(own_match)
        if not own_match or expected != predicted:
            common_mismatches.append({"case": case["case"], "expected_own": case["expected_own_mentioned"],
                                      "own": bool(context.get("own_mentioned")),
                                      "expected_alert": expected, "alert": predicted})
    common = {
        "case_count": len(cases), "own_mention_accuracy": gold.safe_ratio(own_ok, len(cases)),
        "alert_precision": gold.safe_ratio(tp, tp + fp), "alert_recall": gold.safe_ratio(tp, tp + fn),
        "alert_confusion": {"true_positive": tp, "false_positive": fp, "false_negative": fn,
                            "true_negative": len(cases) - tp - fp - fn},
        "thresholds": {"own_mention_accuracy": 1.0, "alert_precision": .99, "alert_recall": .90},
        "mismatches": common_mismatches,
    }
    common["failures"] = [key for key, minimum in common["thresholds"].items()
                          if common[key] is None or common[key] < minimum]
    if len(cases) < 30 or tp + fn < 5 or len(cases) - tp - fn < 20:
        common["failures"].append("insufficient_cases")
    common["passed"] = not common["failures"]
    families = {}
    for family in ("source_role", "insurance_subject"):
        selected = [case for case in cases if case.get("family") == family]
        mismatches, positive, negative = [], 0, 0
        for index, case in enumerate(selected):
            row = case_row(case, index)
            repairs = build_plan([row], {})["repairs"]
            repair = next((item for item in repairs if item["family"] == family), None)
            actual = repair["patch"]["category"] if repair else None
            expected = case["expected_repair_category"]
            positive += int(expected is not None)
            negative += int(expected is None)
            if actual != expected:
                mismatches.append({"case": case["case"], "expected": expected, "actual": actual})
        passed = len(selected) >= 20 and positive >= 5 and negative >= 5 and not mismatches
        families[family] = {"passed": passed, "case_count": len(selected),
                            "repair_cases": positive, "protected_cases": negative,
                            "exact_accuracy": gold.safe_ratio(len(selected) - len(mismatches), len(selected)),
                            "failures": [] if passed else ["family_regression_failed"], "mismatches": mismatches}
    delivery = validate_delivery()
    return {"version": VERSION, "purpose": "authored_regression_not_population_accuracy",
            "corpus_hash": hashlib.sha256(CASE_PATH.read_bytes()).hexdigest(),
            "passed": common["passed"] and delivery["passed"] and any(f["passed"] for f in families.values()),
            "delivery": delivery,
            "common": common, "families": families, "failures": common["failures"],
            "case_count": len(cases)}


def validate_delivery():
    # Use the actual watcher's freshness gate with frozen source dates. This
    # never fetches a page, queries notification history, or sends a message.
    from negative_watch import filter_stale_negative_reexposures
    now = datetime(2026, 9, 15, 0, 0, tzinfo=timezone.utc)
    cases = [("new", -1, -1, True), ("old_original", -48, -1, False),
             ("old_discovery", -1, -48, False), ("future", 5, -1, False)]
    mismatches = []
    for name, original_age, discovered_age, expected in cases:
        article = {"title": "인카금융서비스 모집질서 위반 제재", "link": "https://example.com/article",
                   "_original_pub_date": (now + timedelta(hours=original_age)).isoformat(),
                   "pub_date": (now - timedelta(hours=1)).isoformat(),
                   "discovered_at": (now + timedelta(hours=discovered_age)).isoformat()}
        actual = bool(filter_stale_negative_reexposures([article], now=now))
        if actual != expected:
            mismatches.append(name)
    return {"passed": not mismatches, "case_count": len(cases),
            "exact_accuracy": (len(cases) - len(mismatches)) / len(cases), "mismatches": mismatches}
