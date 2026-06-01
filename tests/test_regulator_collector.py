from __future__ import annotations

import unittest

import regulator_collector


class RegulatorCollectorTests(unittest.TestCase):
    def test_keeps_insurance_related_regulator_release(self) -> None:
        self.assertTrue(
            regulator_collector.is_relevant_release(
                "보험 GA 판매수수료 제도 개선",
                "보험과",
            )
        )

    def test_generic_fee_release_without_insurance_context_is_ignored(self) -> None:
        self.assertFalse(
            regulator_collector.is_relevant_release(
                "청년미래적금 취급기관별 금리와 수수료 안내",
                "청년정책과",
            )
        )


if __name__ == "__main__":
    unittest.main()
