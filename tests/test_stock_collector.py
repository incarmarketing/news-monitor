from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import stock_collector


class StockCollectorStabilityTests(unittest.TestCase):
    def test_transient_dart_failure_preserves_last_verified_items(self) -> None:
        previous = {
            "status": "ok",
            "source": "OpenDART",
            "updated_at": "2026-08-23T00:00:00+00:00",
            "items": [{"title": "분기보고서", "link": "https://dart.example/report"}],
        }
        current = {
            "status": "not_configured",
            "source": "OpenDART",
            "items": [],
            "message": "missing credentials",
        }

        result = stock_collector.preserve_dart_disclosures(current, previous)

        self.assertEqual(result["status"], "preserved")
        self.assertEqual(result["refresh_status"], "not_configured")
        self.assertEqual(result["items"], previous["items"])

    def test_verified_empty_dart_response_replaces_previous_items(self) -> None:
        previous = {"status": "ok", "items": [{"title": "old"}]}
        current = {"status": "ok", "items": []}
        self.assertEqual(stock_collector.preserve_dart_disclosures(current, previous), current)

    def test_local_market_payload_is_used_before_remote_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "stock-market.json"
            expected = {"dart_disclosures": {"status": "ok", "items": [{"title": "local"}]}}
            target.write_text(json.dumps(expected), encoding="utf-8")
            with patch.object(stock_collector.requests, "get") as get:
                actual = stock_collector.load_previous_market_payload(target)

        self.assertEqual(actual, expected)
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
