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
DETAIL_URL = f"{BASE_URL}/gongsimain/mainDrgDetail.do"
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
    parser.add_argument("--dry-run", action="store_true", help="Print payload without saving to Supabase.")
    args = parser.parse_args()

    stand_mm = normalize_stand_mm(args.stand_mm)
    period_label = period_label_from_stand_mm(stand_mm)
    started_at = datetime.now(timezone.utc).isoformat()
    run_key = f"ga_competitor_collect:{stand_mm}"

    try:
        payload = collect_ga_competitor_intel(stand_mm=stand_mm, top=args.top)
        payload["collect_run"] = {
            "run_key": run_key,
            "job_type": "ga_competitor_collect",
            "stand_mm": stand_mm,
            "status": "success",
            "message": f"{period_label} 통합공시 {len(payload['companies'])}개사 수집",
            "rows_collected": len(payload["companies"]),
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


def collect_ga_competitor_intel(*, stand_mm: str, top: int) -> dict[str, list[dict]]:
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
        try:
            revenue = collect_revenue_row(session, row, company_name, stand_mm, period_label)
        except requests.RequestException:
            revenue = None
        if revenue:
            revenue_metrics.append(revenue)

    return {
        "companies": companies,
        "disclosure_metrics": disclosure_metrics,
        "revenue_metrics": revenue_metrics,
        "market_metrics": [market_row(rows, stand_mm, period_label)],
    }


def collect_revenue_row(session: requests.Session, row: dict[str, Any], company_name: str, stand_mm: str, period_label: str) -> dict | None:
    year = stand_mm[:4]
    half = "1" if stand_mm.endswith("06") else "2"
    response = session.post(
        DETAIL_URL,
        data={"drgno": row.get("drgno"), "standMm": year, "gongsiHc": half},
        timeout=30,
    )
    response.raise_for_status()
    table = extract_income_table(response.text)
    if not table:
        return None

    sales = parse_income_metric(table, "매출액")
    operating_profit = parse_income_metric(table, "영업이익")
    net_income = parse_income_metric(table, "당기순손익")
    if sales is None:
        return None

    period_key = year if stand_mm.endswith("12") else f"{year}H1"
    label = f"{year} 연간" if stand_mm.endswith("12") else f"{year} 상반기"
    return {
        "company_name": company_name,
        "period_key": period_key,
        "period_label": label,
        "amount_krw_100m": thousand_krw_to_100m(sales),
        "operating_profit_krw_100m": thousand_krw_to_100m(operating_profit),
        "net_income_krw_100m": thousand_krw_to_100m(net_income),
        "status": "통합공시 확인",
        "source_label": f"법인보험대리점 통합공시 {period_label} 손익현황",
        "source_url": SOURCE_URL,
        "note": "통합공시 상세화면 손익현황의 매출액을 자동 수집했습니다.",
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


def extract_income_table(text: str) -> str:
    match = re.search(r"(?s)<h4>\s*2\.\s*손익현황.*?</table>", text)
    return match.group(0) if match else ""


def parse_income_metric(table: str, label: str) -> int | None:
    pattern = rf'(?s)<th[^>]*class="sub"[^>]*>\s*{re.escape(label)}\s*</th>\s*<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]+)</td>'
    match = re.search(pattern, table)
    if not match:
        return None
    return int_or_none(clean_cell(match.group(3)))


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
