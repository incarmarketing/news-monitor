"""Collect GA competitor disclosure and revenue metrics from public disclosure pages."""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from typing import Any

import requests

import supabase_store

BASE_URL = "https://gapub.insure.or.kr"
MAIN_URL = f"{BASE_URL}/gongsimain/mainSearch.do"
COMPARE_URL = f"{BASE_URL}/gongsimain/mainDrgCompareSort.do"
SUMMARY_URL = f"{BASE_URL}/gongsimain/mainDrgSummary.do"
SOURCE_URL = "https://gapub.insure.or.kr/gongsimain/mainSearch.do"

KNOWN_COMPANIES = {
    "한화생명금융서비스": ("한화생명금융서비스", "한화생명금융서비스"),
    "인카금융서비스": ("인카금융서비스", "인카금융서비스"),
    "지에이코리아": ("지에이코리아주식회사", "지에이코리아"),
    "글로벌금융판매": ("글로벌금융판매", "글로벌금융판매"),
    "프라임에셋": ("프라임에셋", "프라임에셋"),
    "케이지에이에셋": ("케이지에이에셋 주식회사", "KGA에셋"),
    "에이플러스에셋어드바이저": ("에이플러스에셋어드바이저", "에이플러스에셋"),
    "한국보험금융": ("한국보험금융", "한국보험금융"),
    "메가": ("메가", "메가"),
    "엠금융서비스": ("엠금융서비스", "엠금융서비스"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh GA competitor metrics from public disclosure.")
    parser.add_argument("--stand-mm", default="", help="Disclosure month in YYYYMM. Default: latest year-end from current date.")
    parser.add_argument("--top", type=int, default=10, help="Number of ranked GA companies to persist.")
    parser.add_argument("--revenue-start-year", type=int, default=0, help="First annual income year to collect. Default: latest 5 years.")
    parser.add_argument("--revenue-end-year", type=int, default=0, help="Last annual income year to collect. Default: stand-mm year.")
    parser.add_argument("--dry-run", action="store_true", help="Print payload without saving to Supabase.")
    args = parser.parse_args()

    stand_mm = normalize_stand_mm(args.stand_mm)
    revenue_years = annual_revenue_years(
        stand_mm,
        start_year=args.revenue_start_year,
        end_year=args.revenue_end_year,
    )
    period_label = period_label_from_stand_mm(stand_mm)
    started_at = datetime.now(timezone.utc).isoformat()
    run_key = f"ga_competitor_collect:{stand_mm}"

    try:
        payload = collect_ga_competitor_intel(stand_mm=stand_mm, top=args.top, revenue_years=revenue_years)
        payload["collect_run"] = {
            "run_key": run_key,
            "job_type": "ga_competitor_collect",
            "stand_mm": stand_mm,
            "status": "success",
            "message": f"{period_label} 통합공시 {len(payload['companies'])}개사, 매출 {len(payload['revenue_metrics'])}건 수집",
            "rows_collected": len(payload["companies"]) + len(payload["revenue_metrics"]),
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        payload = {
            "companies": [],
            "disclosure_metrics": [],
            "revenue_metrics": [],
            "market_metrics": [],
            "collect_run": {
                "run_key": run_key,
                "job_type": "ga_competitor_collect",
                "stand_mm": stand_mm,
                "status": "failed",
                "message": str(exc)[:500],
                "rows_collected": 0,
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        }
        if not args.dry_run and supabase_store.is_enabled():
            supabase_store.save_ga_competitor_intel(collect_run=payload["collect_run"])
        raise

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    supabase_store.save_ga_competitor_intel(**payload)
    print(f"GA competitor intel refreshed: {period_label}, companies={len(payload['companies'])}")


def collect_ga_competitor_intel(*, stand_mm: str, top: int, revenue_years: list[int]) -> dict[str, list[dict]]:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 news-monitor GA disclosure collector",
        "Referer": MAIN_URL,
    })
    session.get(MAIN_URL, timeout=20).raise_for_status()

    compare = session.post(COMPARE_URL, data={"standMm": stand_mm}, timeout=30)
    compare.raise_for_status()
    rows = compare.json().get("compDrgInfoList", [])
    rows = [row for row in rows if row.get("drgno") and row.get("drgnm")]
    rows.sort(key=lambda row: int_or_none(row.get("gongsiSum")) or 0, reverse=True)
    if not rows:
        raise RuntimeError(f"No GA disclosure rows returned for {stand_mm}")

    ranked = rows[:max(1, top)]
    companies = []
    disclosure_metrics = []
    revenue_metrics = []
    seen_companies = set()
    period_label = period_label_from_stand_mm(stand_mm)

    for index, row in enumerate(ranked, start=1):
        company_name, short_name = canonical_company(row.get("drgnm", ""))
        if company_name not in seen_companies:
            companies.append({
                "name": company_name,
                "short_name": short_name,
                "display_order": index,
                "active": True,
                "source_note": f"{period_label} 법인보험대리점 통합공시 상위 {top}개사",
            })
            seen_companies.add(company_name)

        disclosure_metrics.append(disclosure_row(row, company_name, stand_mm, period_label))
        revenue_metrics.extend(collect_revenue_rows(session, row, company_name, revenue_years))

    return {
        "companies": companies,
        "disclosure_metrics": disclosure_metrics,
        "revenue_metrics": revenue_metrics,
        "market_metrics": [market_row(rows, stand_mm, period_label)],
    }


def collect_revenue_rows(
    session: requests.Session,
    row: dict[str, Any],
    company_name: str,
    revenue_years: list[int],
) -> list[dict]:
    rows = []
    for year in revenue_years:
        try:
            revenue = collect_annual_revenue_row(session, row, company_name, year)
        except requests.RequestException:
            revenue = None
        if revenue:
            rows.append(revenue)
    return rows


def collect_annual_revenue_row(
    session: requests.Session,
    row: dict[str, Any],
    company_name: str,
    year: int,
) -> dict | None:
    response = session.post(
        SUMMARY_URL,
        data={"drgno": row.get("drgno"), "standMm": str(year), "gongsiHc": "2"},
        timeout=30,
    )
    response.raise_for_status()
    table = extract_financial_income_table(response.text)
    if not table:
        return None

    revenue = parse_summary_income_metric(table, "수익")
    expense = parse_summary_income_metric(table, "비용")
    profit = parse_summary_income_metric(table, "이익")
    if revenue is None:
        return None

    period_key = str(year)
    label = f"{year} 연간"
    note_parts = [
        "통합공시 상세화면 '재무 • 손익현황'의 수익 값을 자동 수집했습니다."
    ]
    expense_100m = thousand_krw_to_100m(expense)
    profit_100m = thousand_krw_to_100m(profit)
    if expense_100m is not None:
        note_parts.append(f"비용 {expense_100m}억원")
    if profit_100m is not None:
        note_parts.append(f"이익 {profit_100m}억원")

    return {
        "company_name": company_name,
        "period_key": period_key,
        "period_label": label,
        "amount_krw_100m": thousand_krw_to_100m(revenue),
        "operating_profit_krw_100m": None,
        "net_income_krw_100m": profit_100m,
        "status": "통합공시 확인",
        "source_label": f"법인보험대리점 통합공시 {year} 손익현황",
        "source_url": SOURCE_URL,
        "note": " · ".join(note_parts),
        "confirmed_at": datetime.now(timezone.utc).date().isoformat(),
    }


def disclosure_row(row: dict[str, Any], company_name: str, stand_mm: str, period_label: str) -> dict:
    return {
        "company_name": company_name,
        "stand_mm": stand_mm,
        "period_label": period_label,
        "planners": int_or_none(row.get("gongsiSum")),
        "stay_rate": number_or_none(row.get("stayRateL")),
        "retention_13_life": number_or_none(row.get("th13RateL")),
        "retention_13_nonlife": number_or_none(row.get("th13RateN")),
        "retention_25_life": number_or_none(row.get("th25RateL")),
        "retention_25_nonlife": number_or_none(row.get("th25RateN")),
        "poor_sales_life": number_or_none(row.get("hapQaRateL")),
        "poor_sales_nonlife": number_or_none(row.get("hapQaRateN")),
        "withdrawal_life": int_or_none(row.get("chungL")),
        "withdrawal_nonlife": int_or_none(row.get("chungN")),
        "source_url": SOURCE_URL,
        "source_payload": row,
    }


def market_row(rows: list[dict], stand_mm: str, period_label: str) -> dict:
    total_planners = sum(int_or_none(row.get("gongsiSum")) or 0 for row in rows)
    return {
        "stand_mm": stand_mm,
        "period_label": period_label,
        "companies_count": len(rows),
        "total_planners": total_planners,
        "stay_rate": weighted_average(rows, "stayRateL"),
        "retention_13_life": weighted_average(rows, "th13RateL"),
        "retention_13_nonlife": weighted_average(rows, "th13RateN"),
        "retention_25_life": weighted_average(rows, "th25RateL"),
        "retention_25_nonlife": weighted_average(rows, "th25RateN"),
        "poor_sales_life": weighted_average(rows, "hapQaRateL"),
        "poor_sales_nonlife": weighted_average(rows, "hapQaRateN"),
    }


def extract_financial_income_table(text: str) -> str:
    match = re.search(r"(?s)<h3>\s*재무\s*(?:•|&bull;|·|\.)\s*손익현황.*?</table>", text)
    return match.group(0) if match else ""


def parse_summary_income_metric(table: str, label: str) -> int | None:
    pattern = rf"(?s)<td[^>]*>\s*{re.escape(label)}\s*</td>\s*<td[^>]*class=[\"']right[\"'][^>]*>([^<]+)</td>"
    match = re.search(pattern, table)
    if not match:
        return None
    return int_or_none(clean_cell(match.group(1)))


def clean_cell(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", str(value or ""))).strip()


def canonical_company(value: str) -> tuple[str, str]:
    normalized = normalize_company_name(value)
    for key, company in KNOWN_COMPANIES.items():
        if normalized == normalize_company_name(key) or normalize_company_name(key) in normalized:
            return company
    return normalized, normalized


def normalize_company_name(value: str) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"㈜|\(주\)|주식회사|보험대리점|법인보험대리점", "", text)
    return text.strip()


def normalize_stand_mm(value: str) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"20\d{4}", text):
        return text
    if re.fullmatch(r"20\d{2}", text):
        return f"{text}12"
    # The latest complete public GA year-end disclosure available in this project.
    return "202512"


def annual_revenue_years(stand_mm: str, *, start_year: int = 0, end_year: int = 0) -> list[int]:
    latest = end_year or int(stand_mm[:4])
    first = start_year or latest - 4
    if first > latest:
        raise ValueError("revenue-start-year cannot be later than revenue-end-year")
    return list(range(first, latest + 1))


def period_label_from_stand_mm(value: str) -> str:
    year = value[:4]
    return f"{year}.6" if value.endswith("06") else year


def int_or_none(value: Any) -> int | None:
    text = str(value or "").replace(",", "").strip()
    if not text or text.lower() == "none":
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def number_or_none(value: Any) -> float | None:
    text = str(value or "").replace(",", "").strip()
    if not text or text.lower() == "none":
        return None
    try:
        return round(float(text), 3)
    except ValueError:
        return None


def weighted_average(rows: list[dict], key: str) -> float | None:
    numerator = 0.0
    denominator = 0.0
    for row in rows:
        value = number_or_none(row.get(key))
        weight = int_or_none(row.get("gongsiSum")) or 0
        if value is None or weight <= 0:
            continue
        numerator += value * weight
        denominator += weight
    if denominator <= 0:
        return None
    return round(numerator / denominator, 3)


def thousand_krw_to_100m(value: int | None) -> float | None:
    if value is None:
        return None
    return round(value / 100000, 2)


if __name__ == "__main__":
    main()
