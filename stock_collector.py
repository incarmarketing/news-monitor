"""Collect Korean market data for the dashboard using public Naver chart data."""

from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

import requests


BASE_DIR = Path(__file__).parent
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
NAVER_CHART_URL = "https://fchart.stock.naver.com/sise.nhn"

MARKET_INDICES = [
    {"code": "KOSPI", "name": "KOSPI", "kind": "index"},
    {"code": "KOSDAQ", "name": "KOSDAQ", "kind": "index"},
]

STOCK_UNIVERSE = [
    {"code": "211050", "name": "인카금융서비스", "group": "당사", "kind": "company"},
    {"code": "244920", "name": "에이플러스에셋", "group": "GA 비교군", "kind": "peer"},
    {"code": "032830", "name": "삼성생명", "group": "생명보험", "kind": "peer"},
    {"code": "088350", "name": "한화생명", "group": "생명보험", "kind": "peer"},
    {"code": "082640", "name": "동양생명", "group": "생명보험", "kind": "peer"},
    {"code": "085620", "name": "미래에셋생명", "group": "생명보험", "kind": "peer"},
    {"code": "000810", "name": "삼성화재", "group": "손해보험", "kind": "peer"},
    {"code": "005830", "name": "DB손해보험", "group": "손해보험", "kind": "peer"},
    {"code": "001450", "name": "현대해상", "group": "손해보험", "kind": "peer"},
    {"code": "000370", "name": "한화손해보험", "group": "손해보험", "kind": "peer"},
    {"code": "000400", "name": "롯데손해보험", "group": "손해보험", "kind": "peer"},
    {"code": "138040", "name": "메리츠금융지주", "group": "금융지주", "kind": "peer"},
    {"code": "105560", "name": "KB금융", "group": "금융지주", "kind": "peer"},
    {"code": "055550", "name": "신한지주", "group": "금융지주", "kind": "peer"},
    {"code": "086790", "name": "하나금융지주", "group": "금융지주", "kind": "peer"},
]


def fetch_chart(symbol: str, count: int = 90) -> list[dict]:
    response = requests.get(
        NAVER_CHART_URL,
        params={"symbol": symbol, "timeframe": "day", "count": count, "requestType": 0},
        timeout=20,
    )
    response.raise_for_status()
    root = ElementTree.fromstring(response.content)
    rows: list[dict] = []
    for node in root.findall(".//item"):
        raw = str(node.attrib.get("data", ""))
        parts = raw.split("|")
        if len(parts) < 6:
            continue
        rows.append(
            {
                "date": f"{parts[0][:4]}-{parts[0][4:6]}-{parts[0][6:8]}",
                "open": number(parts[1]),
                "high": number(parts[2]),
                "low": number(parts[3]),
                "close": number(parts[4]),
                "volume": number(parts[5]),
            }
        )
    return rows


def number(value: object) -> float:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def percent(current: float, previous: float | None) -> float | None:
    if previous in (None, 0):
        return None
    return round(((current - previous) / previous) * 100, 2)


def value_at(history: list[dict], offset: int) -> float | None:
    if not history or len(history) <= offset:
        return None
    return float(history[-1 - offset].get("close") or 0)


def build_security(meta: dict) -> dict:
    try:
        history = fetch_chart(meta["code"], 90)
    except Exception as exc:
        return {
            **meta,
            "status": "error",
            "error": str(exc),
            "history": [],
            "latest": {},
            "returns": {},
        }
    if not history:
        return {
            **meta,
            "status": "empty",
            "history": [],
            "latest": {},
            "returns": {},
        }

    latest = history[-1]
    current = float(latest["close"])
    high_60 = max(float(row["high"]) for row in history[-60:])
    low_60 = min(float(row["low"]) for row in history[-60:])
    average_volume = statistics.mean(float(row["volume"]) for row in history[-20:]) if history[-20:] else 0
    previous = value_at(history, 1)
    change = round(current - previous, 2) if previous is not None else 0
    change_rate = percent(current, previous)

    return {
        **meta,
        "status": "ok",
        "latest": {
            "date": latest["date"],
            "price": current,
            "change": change,
            "change_rate": change_rate,
            "volume": latest["volume"],
            "average_volume_20d": round(average_volume),
        },
        "returns": {
            "1d": change_rate,
            "5d": percent(current, value_at(history, 5)),
            "20d": percent(current, value_at(history, 20)),
            "60d": percent(current, value_at(history, 60)),
        },
        "range": {
            "high_60d": high_60,
            "low_60d": low_60,
            "drawdown_from_60d_high": percent(current, high_60),
            "rebound_from_60d_low": percent(current, low_60),
        },
        "history": history[-60:],
    }


def build_market_payload() -> dict:
    securities = [build_security(meta) for meta in STOCK_UNIVERSE]
    indices = [build_security(meta) for meta in MARKET_INDICES]
    company = next((item for item in securities if item.get("kind") == "company"), securities[0])
    peer_rows = [item for item in securities if item.get("kind") == "peer" and item.get("status") == "ok"]
    kospi = next((item for item in indices if item.get("code") == "KOSPI"), {})
    kosdaq = next((item for item in indices if item.get("code") == "KOSDAQ"), {})

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Naver Finance chart data",
        "as_of": company.get("latest", {}).get("date", ""),
        "company": company,
        "indices": indices,
        "peer_groups": group_securities(peer_rows),
        "summary": build_summary(company, peer_rows, kospi, kosdaq),
        "relative_trend": build_relative_trend(company, peer_rows, kospi),
    }
    return payload


def group_securities(securities: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for item in securities:
        groups.setdefault(str(item.get("group") or "기타"), []).append(strip_history(item))
    return [
        {
            "name": name,
            "average_20d_return": round(
                statistics.mean(
                    value
                    for value in (row.get("returns", {}).get("20d") for row in rows)
                    if value is not None
                ),
                2,
            )
            if any(row.get("returns", {}).get("20d") is not None for row in rows)
            else None,
            "stocks": sorted(rows, key=lambda row: row.get("name", "")),
        }
        for name, rows in groups.items()
    ]


def strip_history(item: dict) -> dict:
    return {key: value for key, value in item.items() if key != "history"}


def build_relative_trend(company: dict, peers: list[dict], index: dict) -> list[dict]:
    company_history = company.get("history") or []
    index_history = {row["date"]: row for row in index.get("history") or []}
    peer_histories = [
        {row["date"]: row for row in peer.get("history") or []}
        for peer in peers
        if peer.get("history")
    ]
    if not company_history:
        return []

    company_base = next((row["close"] for row in company_history if row.get("close")), None)
    index_base = next((row["close"] for row in index.get("history") or [] if row.get("close")), None)
    peer_bases = [
        next((row["close"] for row in history.values() if row.get("close")), None)
        for history in peer_histories
    ]
    rows = []
    for point in company_history:
        date = point["date"]
        peer_values = []
        for peer_index, history in enumerate(peer_histories):
            base = peer_bases[peer_index] if peer_index < len(peer_bases) else None
            close = history.get(date, {}).get("close")
            if base and close:
                peer_values.append((close / base) * 100)
        rows.append(
            {
                "date": date[5:],
                "company": normalized(point.get("close"), company_base),
                "kospi": normalized(index_history.get(date, {}).get("close"), index_base),
                "peer": round(statistics.mean(peer_values), 2) if peer_values else None,
            }
        )
    return rows


def normalized(value: object, base: object) -> float | None:
    value_num = number(value)
    base_num = number(base)
    if not value_num or not base_num:
        return None
    return round((value_num / base_num) * 100, 2)


def build_summary(company: dict, peers: list[dict], kospi: dict, kosdaq: dict) -> dict:
    company_return_20d = company.get("returns", {}).get("20d")
    peer_return_20d = average_return(peers, "20d")
    kospi_return_20d = kospi.get("returns", {}).get("20d")
    drawdown = company.get("range", {}).get("drawdown_from_60d_high")
    relative_to_peers = safe_subtract(company_return_20d, peer_return_20d)
    relative_to_kospi = safe_subtract(company_return_20d, kospi_return_20d)

    headline = build_headline(company_return_20d, peer_return_20d, kospi_return_20d, drawdown)
    return {
        "headline": headline,
        "company_20d_return": company_return_20d,
        "peer_20d_return": peer_return_20d,
        "kospi_20d_return": kospi_return_20d,
        "kosdaq_20d_return": kosdaq.get("returns", {}).get("20d"),
        "relative_to_peers": relative_to_peers,
        "relative_to_kospi": relative_to_kospi,
        "drawdown_from_60d_high": drawdown,
        "commentary": build_commentary(company, peer_return_20d, kospi_return_20d, relative_to_peers, relative_to_kospi),
    }


def average_return(securities: list[dict], key: str) -> float | None:
    values = [item.get("returns", {}).get(key) for item in securities]
    values = [float(value) for value in values if value is not None and not math.isnan(float(value))]
    return round(statistics.mean(values), 2) if values else None


def safe_subtract(left: float | None, right: float | None) -> float | None:
    if left is None or right is None:
        return None
    return round(left - right, 2)


def build_headline(company_return: float | None, peer_return: float | None, kospi_return: float | None, drawdown: float | None) -> str:
    if company_return is None:
        return "당사 주가 데이터 수집 대기 중입니다."
    if company_return <= -10:
        return "최근 20거래일 기준 당사 주가 약세가 두드러집니다."
    if peer_return is not None and company_return < peer_return - 5:
        return "동종업계 대비 당사 주가 흐름이 약합니다."
    if kospi_return is not None and company_return < kospi_return - 5:
        return "시장지수 대비 당사 주가 회복력이 낮습니다."
    if drawdown is not None and drawdown <= -20:
        return "60거래일 고점 대비 낙폭이 커 주가 커뮤니케이션 점검이 필요합니다."
    if company_return >= 5:
        return "당사 주가는 최근 반등 흐름을 보이고 있습니다."
    return "당사 주가는 시장 및 업종 흐름과 함께 관찰이 필요합니다."


def build_commentary(
    company: dict,
    peer_return: float | None,
    kospi_return: float | None,
    relative_to_peers: float | None,
    relative_to_kospi: float | None,
) -> list[str]:
    returns = company.get("returns", {})
    range_data = company.get("range", {})
    lines = [
        f"당사 20거래일 수익률은 {format_pct(returns.get('20d'))}입니다.",
        f"60거래일 고점 대비 {format_pct(range_data.get('drawdown_from_60d_high'))} 구간에 있습니다.",
    ]
    if peer_return is not None and relative_to_peers is not None:
        lines.append(f"동종 비교군 평균 20거래일 수익률 {format_pct(peer_return)} 대비 {format_pct(relative_to_peers)} 차이입니다.")
    if kospi_return is not None and relative_to_kospi is not None:
        lines.append(f"KOSPI 20거래일 수익률 {format_pct(kospi_return)} 대비 {format_pct(relative_to_kospi)} 차이입니다.")
    lines.append("주가 하락 기사가 발생하면 실제 가격 흐름과 언론 노출을 함께 확인합니다.")
    return lines


def format_pct(value: float | None) -> str:
    if value is None:
        return "확인 불가"
    return f"{value:+.2f}%"


def publish_stock_market_data(target: Path | None = None) -> Path:
    target = target or (PUBLIC_DATA_DIR / "stock-market.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = build_market_payload()
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Published stock market data: {target}")
    return target


if __name__ == "__main__":
    publish_stock_market_data()
