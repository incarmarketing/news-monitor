"""Collect Korean market data for the dashboard using public Naver chart and realtime data."""

from __future__ import annotations

import json
import math
import os
import re
import statistics
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree

import requests


BASE_DIR = Path(__file__).parent
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"
NAVER_CHART_URL = "https://fchart.stock.naver.com/sise.nhn"
NAVER_REALTIME_URL = "https://polling.finance.naver.com/api/realtime/domestic"
OPENDART_LIST_URL = "https://opendart.fss.or.kr/api/list.json"
OPENDART_TIMEOUT = (8, 30)
OPENDART_RETRIES = 3
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json,text/plain,*/*",
}
DART_DISCLOSURE_KEYWORDS = (
    "기업설명회",
    "IR",
    "실적",
    "잠정",
    "분기보고서",
    "반기보고서",
    "사업보고서",
    "주주총회",
    "배당",
    "합병",
    "자기주식",
    "주식소각",
    "주요사항보고서",
)

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


def fetch_chart(symbol: str, count: int = 180) -> list[dict]:
    response = requests.get(
        NAVER_CHART_URL,
        params={"symbol": symbol, "timeframe": "day", "count": count, "requestType": 0},
        headers=REQUEST_HEADERS,
        timeout=20,
    )
    response.raise_for_status()
    xml_text = response.content.decode(response.encoding or "euc-kr", errors="replace")
    xml_text = re.sub(r"^\s*<\?xml[^>]*\?>", "", xml_text).strip()
    root = ElementTree.fromstring(xml_text)
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


def fetch_realtime_quote(symbol: str, kind: str = "stock") -> dict:
    endpoint = "index" if kind == "index" else "stock"
    response = requests.get(
        f"{NAVER_REALTIME_URL}/{endpoint}/{symbol}",
        headers=REQUEST_HEADERS,
        timeout=12,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("datas") or []
    if not rows:
        return {}
    return rows[0] or {}


def number(value: object) -> float:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def optional_number(value: object) -> float | None:
    parsed = number(value)
    return parsed if parsed else None


def parse_won_amount(value: object) -> float | None:
    text = str(value or "").replace(",", "").strip()
    if not text:
        return None
    multiplier = 1
    if text.endswith("백만"):
        multiplier = 1_000_000
        text = text[:-2]
    elif text.endswith("천주"):
        multiplier = 1_000
        text = text[:-2]
    try:
        return float(text) * multiplier
    except ValueError:
        return None


def parse_market_cap_amount(value: object) -> float | None:
    text = str(value or "").replace(",", "").replace("원", "").strip()
    if not text or text == "-":
        return None
    if text.isdigit():
        return float(text)
    total = 0.0
    matched = False
    for pattern, multiplier in (
        (r"([0-9.]+)\s*조", 1_000_000_000_000),
        (r"([0-9.]+)\s*억", 100_000_000),
        (r"([0-9.]+)\s*만", 10_000),
    ):
        for match in re.finditer(pattern, text):
            total += float(match.group(1)) * multiplier
            matched = True
    if matched:
        return total
    try:
        return float(text)
    except ValueError:
        return None


def format_market_cap_label(value: float | None) -> str:
    if not value:
        return ""
    if value >= 1_000_000_000_000:
        return f"{value / 1_000_000_000_000:.2f}조원"
    if value >= 100_000_000:
        return f"{round(value / 100_000_000):,}억원"
    return f"{round(value):,}원"


def percent(current: float, previous: float | None) -> float | None:
    if previous in (None, 0):
        return None
    return round(((current - previous) / previous) * 100, 2)


def value_at(history: list[dict], offset: int) -> float | None:
    if not history or len(history) <= offset:
        return None
    return float(history[-1 - offset].get("close") or 0)


def build_range_window(history: list[dict], analysis_price: float, quote_date: str, days: int) -> dict:
    rows = history[-days:] if days else history
    rows = [row for row in rows if row.get("date")]
    if not rows:
        return {}

    high_row = max(rows, key=lambda row: float(row.get("high") or 0))
    low_row = min(rows, key=lambda row: float(row.get("low") or float("inf")))
    high_price = float(high_row.get("high") or 0)
    low_price = float(low_row.get("low") or 0)
    high_date = high_row.get("date") or ""
    low_date = low_row.get("date") or ""

    if analysis_price and analysis_price > high_price:
        high_price = analysis_price
        high_date = quote_date or rows[-1].get("date") or high_date
    if analysis_price and (not low_price or analysis_price < low_price):
        low_price = analysis_price
        low_date = quote_date or rows[-1].get("date") or low_date

    start_close = float(rows[0].get("close") or 0)
    return {
        "days": days,
        "label": f"{days}거래일",
        "start_date": rows[0].get("date") or "",
        "end_date": quote_date or rows[-1].get("date") or "",
        "start_price": start_close,
        "current_price": analysis_price,
        "return": percent(analysis_price, start_close),
        "high": high_price,
        "high_date": high_date,
        "low": low_price,
        "low_date": low_date,
        "drawdown_from_high": percent(analysis_price, high_price),
        "rebound_from_low": percent(analysis_price, low_price),
    }


def build_security(meta: dict) -> dict:
    quote_error = ""
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
    try:
        quote = fetch_realtime_quote(meta["code"], "index" if meta.get("kind") == "index" else "stock")
    except Exception as exc:
        quote = {}
        quote_error = str(exc)
    if not history:
        return {
            **meta,
            "status": "empty",
            "history": [],
            "latest": {},
            "returns": {},
        }

    latest = history[-1]
    current = optional_number(quote.get("closePriceRaw") or quote.get("closePrice")) or float(latest["close"])
    high_60 = max(float(row["high"]) for row in history[-60:])
    low_60 = min(float(row["low"]) for row in history[-60:])
    average_volume = statistics.mean(float(row["volume"]) for row in history[-20:]) if history[-20:] else 0
    previous = value_at(history, 1)
    change = optional_number(quote.get("compareToPreviousClosePriceRaw") or quote.get("compareToPreviousClosePrice"))
    if change is None:
        change = round(current - previous, 2) if previous is not None else 0
    change_rate = optional_number(quote.get("fluctuationsRatioRaw") or quote.get("fluctuationsRatio"))
    if change_rate is None:
        change_rate = percent(current, previous)
    traded_at = str(quote.get("localTradedAt") or "")
    quote_date = traded_at[:10] if traded_at else latest["date"]
    market_status = str(quote.get("marketStatus") or "")
    regular_market = build_regular_market(quote, current, change, change_rate, latest, market_status)
    nxt_market = build_nxt_market(quote)
    integrated_market = build_integrated_market(quote, regular_market, nxt_market)
    active_market = choose_active_market(regular_market, nxt_market)
    analysis_price = float(active_market.get("price") or current)
    active_change = active_market.get("change") if active_market.get("change") is not None else change
    active_change_rate = active_market.get("change_rate") if active_market.get("change_rate") is not None else change_rate
    gap = build_price_gap(regular_market, nxt_market)
    market_cap = build_market_cap(quote, analysis_price)

    return {
        **meta,
        "status": "ok",
        "quote_status": "ok" if quote else ("error" if quote_error else "empty"),
        "quote_error": quote_error,
        "latest": {
            "date": quote_date,
            "traded_at": traded_at,
            "market_status": market_status,
            "price": analysis_price,
            "change": active_change,
            "change_rate": active_change_rate,
            "volume": integrated_market.get("volume") or regular_market.get("volume") or latest["volume"],
            "average_volume_20d": round(average_volume),
            "source_market": active_market.get("id") or "regular",
            "market_cap": market_cap.get("value"),
        },
        "regular_market": regular_market,
        "nxt_market": nxt_market,
        "integrated_market": integrated_market,
        "price_gap": gap,
        "market_cap": market_cap,
        "returns": {
            "1d": active_change_rate,
            "5d": percent(analysis_price, value_at(history, 5)),
            "20d": percent(analysis_price, value_at(history, 20)),
            "60d": percent(analysis_price, value_at(history, 60)),
            "120d": percent(analysis_price, value_at(history, 120)),
        },
        "range": {
            "high_60d": high_60,
            "low_60d": low_60,
            "drawdown_from_60d_high": percent(analysis_price, high_60),
            "rebound_from_60d_low": percent(analysis_price, low_60),
        },
        "range_windows": {
            "20d": build_range_window(history, analysis_price, quote_date, 20),
            "60d": build_range_window(history, analysis_price, quote_date, 60),
            "120d": build_range_window(history, analysis_price, quote_date, min(120, len(history))),
        },
        "history": history[-120:],
    }


def build_regular_market(quote: dict, current: float, change: float | None, change_rate: float | None, latest: dict, market_status: str) -> dict:
    return {
        "id": "regular",
        "label": (quote.get("stockExchangeType") or {}).get("nameKor") or quote.get("stockExchangeName") or "KRX 정규장",
        "price": current,
        "change": change,
        "change_rate": change_rate,
        "open": optional_number(quote.get("openPriceRaw") or quote.get("openPrice")) or latest.get("open"),
        "high": optional_number(quote.get("highPriceRaw") or quote.get("highPrice")) or latest.get("high"),
        "low": optional_number(quote.get("lowPriceRaw") or quote.get("lowPrice")) or latest.get("low"),
        "volume": optional_number(quote.get("accumulatedTradingVolumeRaw") or quote.get("accumulatedTradingVolume")) or latest.get("volume"),
        "trading_value": optional_number(quote.get("accumulatedTradingValueRaw")) or parse_won_amount(quote.get("accumulatedTradingValue")),
        "trading_value_label": quote.get("accumulatedTradingValue") or "",
        "status": market_status,
        "traded_at": quote.get("localTradedAt") or "",
    }


def build_nxt_market(quote: dict) -> dict:
    over = quote.get("overMarketPriceInfo") or {}
    price = optional_number(over.get("overPriceRaw") or over.get("overPrice"))
    change = optional_number(over.get("compareToPreviousClosePriceRaw") or over.get("compareToPreviousClosePrice"))
    change_rate = optional_number(over.get("fluctuationsRatioRaw") or over.get("fluctuationsRatio"))
    return {
        "id": "nxt",
        "label": "NXT",
        "session": over.get("tradingSessionType") or "",
        "status": over.get("overMarketStatus") or "",
        "price": price,
        "change": change,
        "change_rate": change_rate,
        "open": optional_number(over.get("openPriceRaw") or over.get("openPrice")),
        "high": optional_number(over.get("highPriceRaw") or over.get("highPrice")),
        "low": optional_number(over.get("lowPriceRaw") or over.get("lowPrice")),
        "volume": optional_number(over.get("accumulatedTradingVolumeRaw") or over.get("accumulatedTradingVolume")),
        "trading_value": optional_number(over.get("accumulatedTradingValueRaw")) or parse_won_amount(over.get("accumulatedTradingValue")),
        "trading_value_label": over.get("accumulatedTradingValue") or "",
        "traded_at": over.get("localTradedAt") or "",
        "available": bool(price),
    }


def build_integrated_market(quote: dict, regular: dict, nxt: dict) -> dict:
    integrated = quote.get("integratedPriceInfo") or {}
    volume = optional_number(integrated.get("accumulatedTradingVolumeRaw") or integrated.get("accumulatedTradingVolume"))
    if volume is None:
        volume = sum(value for value in [regular.get("volume"), nxt.get("volume")] if value)
    trading_value = optional_number(integrated.get("accumulatedTradingValueRaw")) or parse_won_amount(integrated.get("accumulatedTradingValue"))
    if trading_value is None:
        trading_value = sum(value for value in [regular.get("trading_value"), nxt.get("trading_value")] if value)
    return {
        "open": optional_number(integrated.get("openPriceRaw") or integrated.get("openPrice")),
        "high": optional_number(integrated.get("highPriceRaw") or integrated.get("highPrice")),
        "low": optional_number(integrated.get("lowPriceRaw") or integrated.get("lowPrice")),
        "volume": volume,
        "trading_value": trading_value,
        "trading_value_label": integrated.get("accumulatedTradingValue") or "",
    }


def choose_active_market(regular: dict, nxt: dict) -> dict:
    if nxt.get("available") and str(nxt.get("status") or "").upper() == "OPEN":
        return nxt
    return regular


def build_price_gap(regular: dict, nxt: dict) -> dict:
    regular_price = regular.get("price")
    nxt_price = nxt.get("price")
    if not regular_price or not nxt_price:
        return {"available": False, "price": None, "rate": None, "label": "NXT 미수집"}
    gap = round(float(nxt_price) - float(regular_price), 2)
    return {
        "available": True,
        "price": gap,
        "rate": round((gap / float(regular_price)) * 100, 2) if regular_price else None,
        "label": "NXT 높음" if gap > 0 else "NXT 낮음" if gap < 0 else "동일",
    }


def build_market_cap(quote: dict, price: float | None = None) -> dict:
    raw_value = optional_number(
        quote.get("marketValueFullRaw")
        or quote.get("marketValueRaw")
        or quote.get("marketSumRaw")
        or quote.get("marketCapitalizationRaw")
    )
    display_value = (
        quote.get("marketValueFull")
        or quote.get("marketValue")
        or quote.get("marketSum")
        or quote.get("marketCapitalization")
    )
    value = raw_value or parse_market_cap_amount(display_value)
    implied_shares = None
    if value and price:
        implied_shares = round(value / float(price))
    return {
        "value": value,
        "label": format_market_cap_label(value),
        "raw_label": str(display_value or ""),
        "implied_shares": implied_shares,
        "source": "Naver Finance realtime",
        "available": bool(value),
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
        "source": "Naver Finance realtime/chart data",
        "as_of": company.get("latest", {}).get("date", ""),
        "company": company,
        "indices": indices,
        "peer_groups": group_securities(peer_rows),
        "summary": build_summary(company, peer_rows, kospi, kosdaq),
        "relative_trend": build_relative_trend(company, peer_rows, kospi),
        "dart_disclosures": fetch_dart_disclosures(),
    }
    return payload


def fetch_dart_disclosures(days: int = 365, limit: int = 8) -> dict:
    """Fetch recent OpenDART disclosures when API credentials are configured."""
    api_key = clean_secret_value(os.getenv("DART_API_KEY") or os.getenv("OPENDART_API_KEY"))
    corp_code = clean_secret_value(os.getenv("DART_CORP_CODE") or os.getenv("INCAR_DART_CORP_CODE"))
    now = datetime.now(timezone.utc)
    if not api_key or not corp_code:
        return {
            "status": "not_configured",
            "source": "OpenDART",
            "updated_at": now.isoformat(),
            "items": [],
            "message": "DART_API_KEY and DART_CORP_CODE are required for automatic disclosure collection.",
        }

    end_date = now.date()
    begin_date = end_date - timedelta(days=days)
    params = {
        "crtfc_key": api_key,
        "corp_code": corp_code,
        "bgn_de": begin_date.strftime("%Y%m%d"),
        "end_de": end_date.strftime("%Y%m%d"),
        "page_no": 1,
        "page_count": 100,
        "sort": "date",
        "sort_mth": "desc",
    }
    payload = None
    for attempt in range(1, OPENDART_RETRIES + 1):
        try:
            response = requests.get(
                OPENDART_LIST_URL,
                params=params,
                headers=REQUEST_HEADERS,
                timeout=OPENDART_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            break
        except requests.Timeout:
            if attempt < OPENDART_RETRIES:
                time.sleep(attempt * 2)
                continue
            return {
                "status": "timeout",
                "source": "OpenDART",
                "updated_at": now.isoformat(),
                "items": [],
                "message": "OpenDART 서버 응답이 지연되어 이번 갱신에서 공시를 가져오지 못했습니다. 다음 자동 갱신에서 재시도합니다.",
            }
        except requests.RequestException:
            return {
                "status": "network_error",
                "source": "OpenDART",
                "updated_at": now.isoformat(),
                "items": [],
                "message": "OpenDART 연결 중 네트워크 오류가 발생했습니다. API 키는 화면에 노출하지 않고 다음 갱신에서 재시도합니다.",
            }
        except ValueError:
            return {
                "status": "error",
                "source": "OpenDART",
                "updated_at": now.isoformat(),
                "items": [],
                "message": "OpenDART 응답 형식을 해석하지 못했습니다. 다음 갱신에서 재시도합니다.",
            }

    if not isinstance(payload, dict):
        return {
            "status": "error",
            "source": "OpenDART",
            "updated_at": now.isoformat(),
            "items": [],
            "message": "OpenDART 응답이 비어 있습니다. 다음 갱신에서 재시도합니다.",
        }

    if str(payload.get("status")) != "000":
        code = str(payload.get("status") or "")
        status = "auth_error" if code in {"010", "011", "020", "100", "800"} else "error"
        return {
            "status": status,
            "source": "OpenDART",
            "updated_at": now.isoformat(),
            "items": [],
            "message": safe_dart_api_message(payload.get("message"), code),
        }

    rows = payload.get("list") or []
    filtered = [row for row in rows if is_relevant_dart_disclosure(row.get("report_nm"))]
    if not filtered:
        filtered = rows[:limit]

    return {
        "status": "ok",
        "source": "OpenDART",
        "updated_at": now.isoformat(),
        "items": [normalize_dart_disclosure(row) for row in filtered[:limit]],
    }


def safe_dart_api_message(message: object, code: str = "") -> str:
    """Return a UI-safe OpenDART message without request URLs or API keys."""
    text = re.sub(r"\s+", " ", str(message or "")).strip()
    text = re.sub(r"crtfc_key=[^&\s)]+", "crtfc_key=***", text)
    text = re.sub(r"https?://opendart\.fss\.or\.kr/\S+", "OpenDART API", text)
    if not text:
        text = "OpenDART에서 오류 응답을 반환했습니다."
    if code:
        return f"{text} (응답 코드 {code})"
    return text


def clean_secret_value(value: object) -> str:
    text = str(value or "").strip().strip("\"'")
    if "=" in text and text.split("=", 1)[0].strip().upper() in {
        "DART",
        "DART_API_KEY",
        "OPENDART_API_KEY",
        "DART_CORP_CODE",
        "INCAR_DART_CORP_CODE",
    }:
        text = text.split("=", 1)[1]
    return re.sub(r"\s+", "", text.strip().strip("\"'"))


def is_relevant_dart_disclosure(title: object) -> bool:
    text = str(title or "")
    return any(keyword.lower() in text.lower() for keyword in DART_DISCLOSURE_KEYWORDS)


def normalize_dart_disclosure(row: dict) -> dict:
    title = str(row.get("report_nm") or "공시 제목 확인 필요").strip()
    receipt_no = str(row.get("rcept_no") or "").strip()
    report_date = str(row.get("rcept_dt") or "").strip()
    return {
        "date": format_dart_date(report_date),
        "raw_date": report_date,
        "title": title,
        "type": classify_dart_disclosure(title),
        "summary": build_dart_disclosure_summary(title),
        "receipt_no": receipt_no,
        "link": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={receipt_no}" if receipt_no else "https://dart.fss.or.kr/dsab007/main.do",
        "source": "DART",
    }


def format_dart_date(value: str) -> str:
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}"
    return value


def classify_dart_disclosure(title: str) -> str:
    if "기업설명회" in title or "IR" in title.upper():
        return "IR"
    if "실적" in title or "잠정" in title:
        return "실적"
    if "분기보고서" in title or "반기보고서" in title or "사업보고서" in title:
        return "정기공시"
    if "배당" in title:
        return "주주환원"
    if "합병" in title:
        return "구조변화"
    if "주주총회" in title:
        return "주총"
    return "공시"


def build_dart_disclosure_summary(title: str) -> str:
    if "분기보고서" in title or "반기보고서" in title or "사업보고서" in title:
        return "매출, 이익, 비용 구조, 주요 위험 요인을 주가 흐름과 함께 확인합니다."
    if "실적" in title or "잠정" in title:
        return "실적 발표 내용이 시장 기대와 언론 보도 톤에 미치는 영향을 확인합니다."
    if "기업설명회" in title or "IR" in title.upper():
        return "투자자 커뮤니케이션 메시지와 주가성 기사 연결 가능성을 점검합니다."
    if "배당" in title:
        return "배당, 주주환원, 투자자 기대 변화와 연결해 확인합니다."
    if "합병" in title:
        return "사업 구조 변화와 재무 영향, 언론 노출 가능성을 함께 점검합니다."
    return "주가 판단에 영향을 줄 수 있는 공시성 이벤트로 별도 확인합니다."


def group_securities(securities: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for item in securities:
        groups.setdefault(str(item.get("group") or "기타"), []).append(item)
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
        "price_gap": company.get("price_gap", {}),
        "market_cap": company.get("market_cap", {}),
        "market_session": company.get("latest", {}).get("source_market", "regular"),
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
    gap = company.get("price_gap", {})
    lines = [
        f"당사 20거래일 수익률은 {format_pct(returns.get('20d'))}입니다.",
        f"60거래일 고점 대비 {format_pct(range_data.get('drawdown_from_60d_high'))} 구간에 있습니다.",
    ]
    if gap.get("available"):
        lines.append(f"NXT와 정규장 가격 차이는 {format_price_gap(gap.get('price'))}({format_pct(gap.get('rate'))})입니다.")
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


def format_price_gap(value: float | None) -> str:
    if value is None:
        return "확인 불가"
    return f"{value:+,.0f}원"


def publish_stock_market_data(target: Path | None = None) -> Path:
    target = target or (PUBLIC_DATA_DIR / "stock-market.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = build_market_payload()
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Published stock market data: {target}")
    return target


if __name__ == "__main__":
    publish_stock_market_data()
