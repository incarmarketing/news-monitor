"""Build a static news database dashboard for GitHub Pages."""

from __future__ import annotations

import json
import os
import re
import shutil
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape

import supabase_store
import config
import archiver
import ai_fallback
import analyzer
import gemini_helper
import groq_helper

BASE_DIR = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DATA_DIR = PUBLIC_DIR / "data"
TEMPLATE_DIR = BASE_DIR / "templates"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
DEFAULT_SUPABASE_PROJECT_REF = "moszekksbhprhevxdynb"
KST = timezone(timedelta(hours=9))

CATEGORY_LABELS = {
    "own": "당사 보도",
    "regulation": "규제/정책",
    "competitor": "경쟁사",
    "industry": "업계 동향",
    "other": "기타",
}

TONE_LABELS = {
    "positive": "긍정",
    "caution": "주의",
    "neutral": "중립",
    "negative": "부정",
    "exclude": "제외",
}

EXPECTED_DAILY_WINDOWS = {
    "08": "전일 18:00~당일 08:00",
    "13": "당일 08:00~13:00",
    "18": "당일 13:00~18:00",
}

STOCK_LISTING_NOISE_TITLE_RE = re.compile(
    r"(?:\[?52주\]?\s*)?(?:최저가|최고가)|장중\s*(?:신저가|신고가)|강세\s*토픽|약세\s*토픽|특징주|"
    r"오전\s*이슈\s*\[보험\]|\[리스트\]|MVP\s*상위|상위\s*\d+\s*선"
)
INVESTMENT_REPORT_RE = re.compile(r"투자의견|목표주가|목표가|증권가|리포트|애널리스트")
OWN_NAME_RE = re.compile(r"인카금융서비스|인카금융")


def load_daily_archives() -> list[dict]:
    return archiver.load_all_archives()


def build_articles(archives: list[dict]) -> list[dict]:
    supabase_articles = load_supabase_articles()
    if supabase_articles:
        return enrich_issue_summaries(supabase_articles)

    rows: list[dict] = []
    seen: set[str] = set()
    feedback_index = supabase_store.load_classification_feedback_index()

    for archive in archives:
        date = archive.get("date", "")
        window = archive.get("window", {})
        metrics = archive.get("metrics", {})
        archive_articles = archive.get("articles", [])
        supabase_store.apply_classification_feedback_to_articles(archive_articles, feedback_index)
        for index, article in enumerate(archive_articles, 1):
            if analyzer.is_external_insurance_noise_article(article):
                continue
            if is_stock_listing_noise(article):
                continue
            link = article.get("link", "")
            title = article.get("title", "")
            dedupe_key = link or f"{date}:{title}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            category = article.get("_category", "other")
            tone = article.get("_tone", "caution")
            rows.append(
                {
                    "id": f"{date}-{index}",
                    "date": date,
                    "window": window.get("label", ""),
                    "slot": window.get("slot", ""),
                    "risk": supabase_store.article_risk_level(article, metrics),
                    "title": title,
                    "link": link,
                    "source": article.get("source", ""),
                    "keyword": article.get("keyword", ""),
                    "summary": article_summary(article, category, tone),
                    "pub_date": article.get("pub_date", ""),
                    "score": article.get("_score", 0),
                    "category": category,
                    "category_label": CATEGORY_LABELS.get(category, "기타"),
                    "tone": tone,
                    "tone_label": TONE_LABELS.get(tone, "주의"),
                    "cluster_size": article.get("_cluster_size", 1),
                }
            )

    rows.sort(key=lambda row: (row["date"], row["score"]), reverse=True)
    return enrich_issue_summaries(rows)


def article_summary(article: dict, category: str, tone: str) -> str:
    title = clean_summary_text(article.get("title", ""))
    existing = "" if analyzer.is_external_insurance_noise_article(article) else clean_summary_text(article.get("description", "") or article.get("summary", ""))
    lines = []
    if existing:
        lines.extend(split_summary_sentences(existing)[:3])
    lines.extend(contextual_summary_lines(article, category, tone))
    if not lines:
        lines.append(headline_fallback_summary(article, category, tone))
    usable = [
        line
        for line in unique_lines(lines)
        if is_usable_summary_line(line, title)
    ]
    if not usable:
        fallback = headline_fallback_summary(article, category, tone)
        usable = [fallback] if fallback else []
    return " ".join(unique_lines(usable)[:3])


def clean_summary_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("&nbsp;", " ").replace("&amp;nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    text = " ".join(text.split())
    return text.rstrip(".… ")


def split_summary_sentences(value: object) -> list[str]:
    text = clean_summary_text(value)
    if not text:
        return []
    chunks = re.split(r"(?:[.!?。]\s+|(?:다|요|임|함)\.\s+)", text)
    return [chunk.strip() for chunk in chunks if len(chunk.strip()) >= 8]


def unique_lines(lines: list[str]) -> list[str]:
    seen = set()
    result = []
    for line in lines:
        clean = clean_summary_text(line)
        if not clean or is_generic_summary_line(clean) or clean in seen:
            continue
        seen.add(clean)
        result.append(clean)
    return result


def is_generic_summary_line(value: object) -> bool:
    text = clean_summary_text(value)
    return any(
        phrase in text
        for phrase in (
            "키워드 기준으로 수집된 기사입니다",
            "키워드로 수집됐습니다",
            "기준 핵심만 요약했습니다",
            "당사 직접 언급 기사로 보고서와 리스크 점검 근거",
            "직접 부정과 분리해 시장 평가",
            "홍보 활용 가능성을 검토",
            "정책·규제 변화가 영업 환경",
            "보험사·GA 시장 흐름",
            "이슈가 핵심입니다",
            "제목과 본문 근거를 기준으로",
            "핵심 내용을 확인합니다",
        )
    )


def is_sales_conduct_text(text: str) -> bool:
    has_sales_risk = bool(re.search(r"불완전판매|소비자 피해|소비자보호|생보협회|손보협회|설계사 쟁탈전|쟁탈전|판매채널|보험업계 긴장|해소가 관건", text, re.I))
    has_product_sales_risk = bool(re.search(r"종신보험", text, re.I) and re.search(r"불완전판매|판매\s*관행|판매채널|해소가 관건|소비자\s*피해", text, re.I))
    return (has_sales_risk or has_product_sales_risk) and bool(
        re.search(r"GA|보험|설계사|생보|손보|협회|대리점", text, re.I)
    )


def is_stock_volatility_text(text: str) -> bool:
    return bool(re.search(r"VI 발동|변동성완화장치|주가 급등|주가 급락|\+\d+(?:\.\d+)?%|-\d+(?:\.\d+)?%", text, re.I)) and bool(
        re.search(r"인카금융|주가|조선비즈|Chosunbiz|증시|코스닥", text, re.I)
    )


def is_own_consulting_profile_text(text: str) -> bool:
    return bool(re.search(r"Having사업단|이화정|맞춤형 온라인 금융 컨설팅|온라인 금융 컨설팅|노후", text, re.I)) and bool(
        re.search(r"인카금융|금융 컨설팅|사업단", text, re.I)
    )


def is_stock_disclosure_text(text: str) -> bool:
    return bool(re.search(r"주식시장 주요공시|주요공시|자사주|현금배당|중간배당|공시", text, re.I)) and bool(
        re.search(r"인카금융|주식시장|공시|자사주|배당", text, re.I)
    )


def is_competitor_product_performance_text(text: str) -> bool:
    return bool(re.search(r"누적 가입|가입\s*\d|돌파|특약|출시|판매", text, re.I)) and bool(
        re.search(r"DB손해보험|KB손해보험|삼성화재|현대해상|한화생명|교보생명|보험", text, re.I)
    )


def is_brand_reputation_text(text: str) -> bool:
    return bool(re.search(r"브랜드평판|평판 판도|소비자 평판|브랜드 경쟁", text, re.I)) and bool(
        re.search(r"보험|손해보험|생명보험|금융", text, re.I)
    )


def contextual_summary_lines(article: dict, category: str, tone: str) -> list[str]:
    text = dashboard_original_article_text(article)
    lines: list[str] = []
    if analyzer.is_external_insurance_noise_article(article):
        return []
    if is_stock_volatility_text(text):
        lines.append("인카금융서비스 주가가 장중 급등해 변동성완화장치가 발동된 단기 시장 신호입니다.")
        lines.append("직접 경영 이슈보다 거래량과 주가 변동성 관찰이 필요한 주가성 기사입니다.")
    if is_sales_conduct_text(text):
        lines.append("1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다.")
        lines.append("소비자 피해, 불완전판매, 종신보험 판매 관행처럼 판매채널 관리 리스크를 확인해야 하는 기사입니다.")
    if is_own_consulting_profile_text(text):
        lines.append("인카금융서비스 Having사업단의 맞춤형 온라인 금융 컨설팅 사례를 소개한 인터뷰성 보도입니다.")
        lines.append("보장성 보험을 노후 준비와 연결한 영업·컨설팅 메시지가 중심입니다.")
    if is_stock_disclosure_text(text):
        lines.append("인카금융서비스의 자사주, 배당 등 공시성 항목이 주식시장 주요공시 목록에 포함됐습니다.")
        lines.append("주가 판단용으로는 공시 내용과 기준일, 규모를 별도 확인해야 하는 기사입니다.")
    if is_competitor_product_performance_text(text):
        lines.append("경쟁 보험사의 특약이 출시 이후 누적 가입 성과를 기록한 상품 반응 기사입니다.")
        lines.append("상품 경쟁력과 보장 수요 흐름을 확인할 수 있는 경쟁사 동향으로 봅니다.")
    if is_brand_reputation_text(text):
        lines.append("손해보험사 브랜드평판 순위 변화와 소비자 인식 흐름을 다룬 기사입니다.")
        lines.append("직접 리스크보다 경쟁사 브랜드 노출과 평판 추이를 관찰하는 자료로 봅니다.")
    if re.search(r"한눈에보는GA리포트|GA리포트", text, re.I):
        if category == "own" or OWN_NAME_RE.search(text):
            lines.append("인카금융서비스의 GA 리포트성 보도로 조직 현황과 운영 지표를 확인하는 자료성 기사입니다.")
        else:
            lines.append("GA 리포트성 보도로 해당 대리점의 조직 현황과 운영 지표를 확인하는 자료성 기사입니다.")
    if re.search(r"보험사기|진단서|데이터\s*전쟁|AI로\s*진단서", text, re.I):
        lines.append("AI를 활용한 보험사기 수법 확산과 보험업계 데이터 대응 필요성을 다룬 기사입니다.")
    if re.search(r"실손24|팩스\s*청구|종이\s*서류|전산화", text, re.I):
        lines.append("실손24 전산화 이후에도 팩스 청구가 병행되는 현장 불편과 제도 안착 과제를 다룬 기사입니다.")
    if re.search(r"금융취약계층|사회공헌|포용금융|금융안심지원", text, re.I):
        lines.append("금융취약계층 보호와 사회공헌 활동을 다룬 소비자보호·ESG 보도입니다.")
    if re.search(r"정착지원금|수수료|1200%|조직력", text, re.I) and not is_sales_conduct_text(text):
        lines.append("GA 정착지원금과 설계사 조직 경쟁 흐름을 다룬 판매채널 관찰 기사입니다.")
    if re.search(r"투자의견|목표가|목표주가|증권가|애널리스트", text, re.I):
        lines.append("증권가 투자의견이나 목표가 조정 등 시장 평가 변화가 기사 핵심입니다.")
    if re.search(r"금융보안원|해킹|보안|개인정보", text, re.I):
        lines.append("금융보안과 개인정보 보호 체계 강화 흐름을 확인할 수 있는 보도입니다.")
    if not lines and tone == "negative":
        lines.append("소비자 피해, 제재, 사칭, 법적 분쟁처럼 직접 리스크 문맥이 있는지 확인해야 하는 기사입니다.")
    return lines


def headline_fallback_summary(article: dict, category: str, tone: str) -> str:
    text = dashboard_original_article_text(article)
    if re.search(r"한눈에보는GA리포트|GA리포트", text, re.I):
        return contextual_summary_lines(article, category, tone)[0]
    if re.search(r"VI 발동|변동성완화장치|1200%|불완전판매|소비자 피해|생보협회|종신보험|Having사업단|맞춤형 온라인 금융 컨설팅|주식시장 주요공시|자사주|누적 가입|브랜드평판|보험사기|실손24|금융취약계층|사회공헌|정착지원금|투자의견|금융보안원", text, re.I):
        lines = contextual_summary_lines(article, category, tone)
        if lines:
            return lines[0]
    title = clean_summary_text(article.get("title", ""))
    source = clean_summary_text(article.get("source", ""))
    title = re.sub(r"\s*-\s*[^-]{2,24}(?:\.com|\.co\.kr|\.kr)?$", "", title, flags=re.I)
    title = re.sub(r"\[[^\]]+\]", "", title).strip()
    if not title:
        return ""
    if re.match(r"^(포토|영상|인사|부고)\b", title):
        return f"{source or '해당 매체'}의 단신성 기사로, 원문 근거 확인 후 모니터링 우선순위를 낮춰 봅니다."
    compact = re.split(r"[.!?。]", title.replace("…", " "))[0].strip()[:72]
    headline_line = f"{compact} 내용을 다룬 기사입니다."
    if is_usable_summary_line(headline_line, title):
        return headline_line
    return category_fallback_summary(article, category, tone)


def dashboard_original_article_text(article: dict) -> str:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    return " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("keyword"),
        )
    )


def category_fallback_summary(article: dict, category: str, tone: str) -> str:
    keyword = clean_summary_text(article.get("keyword", ""))
    keyword_text = f"{keyword} 관련 " if keyword else ""
    if category == "own":
        return f"{keyword_text}당사 언급 기사로, 원문에서 성과·리스크·단순 언급 여부를 구분해 확인합니다."
    if category == "regulation":
        return f"{keyword_text}정책·규제 흐름 기사로, 적용 대상과 영업 영향 여부를 확인합니다."
    if category == "competitor":
        return f"{keyword_text}경쟁사 동향 기사로, 상품·채널·평판 변화 중 무엇이 쟁점인지 확인합니다."
    if category == "industry":
        return f"{keyword_text}업계 동향 기사로, 보험·GA 시장 흐름과 당사 관련성을 분리해 봅니다."
    if tone == "negative":
        return "부정 신호 후보 기사로, 직접 피해·제재·사칭 등 핵심 근거를 원문에서 확인합니다."
    if tone == "caution":
        return "주의 관찰 기사로, 시장성 이슈와 직접 리스크 여부를 분리해 확인합니다."
    return "모니터링 후보 기사로, 원문 근거와 키워드 문맥을 함께 확인합니다."


def is_usable_summary_line(line: object, title: object = "") -> bool:
    clean = clean_summary_text(line)
    if not clean or is_generic_summary_line(clean):
        return False
    if len(clean) < 12 or len(clean) > 220:
        return False
    if re.search(r"(?:\.\.\.|…)$", clean):
        return False
    if re.search(r"(으로|로|및|또한|이어|하며|밝혀|전했|강조)$", clean):
        return False
    title_key = summary_compare_key(title)
    line_key = summary_compare_key(clean)
    if title_key and line_key:
        if line_key == title_key:
            return False
        if len(line_key) >= 16 and len(title_key) >= 16 and (line_key in title_key or title_key in line_key):
            return False
    return True


def summary_compare_key(value: object) -> str:
    return re.sub(r"[^0-9a-zA-Z가-힣]+", "", clean_summary_text(value).lower())[:130]


def load_supabase_articles() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_articles()
    except Exception as exc:
        print(f"Supabase dashboard source skipped: {exc}")
        return []

    supabase_store.apply_classification_feedback_to_articles(rows)
    articles = []
    for row in rows:
        if analyzer.is_external_insurance_noise_article(row):
            continue
        if is_stock_listing_noise(row):
            continue
        category = row.get("category", "other")
        tone = row.get("tone", "caution")
        articles.append(
            {
                "id": row.get("article_hash", ""),
                "date": row.get("report_date", ""),
                "window": row.get("window_label", ""),
                "slot": row.get("report_slot", ""),
                "risk": supabase_store.article_risk_level(row),
                "title": row.get("title", ""),
                "link": row.get("link", ""),
                "source": row.get("source", ""),
                "keyword": row.get("keyword", ""),
                "summary": article_summary(row, category, tone),
                "pub_date": row.get("pub_date") or row.get("pub_date_raw", ""),
                "score": row.get("score", 0),
                "category": category,
                "category_label": CATEGORY_LABELS.get(category, "기타"),
                "tone": tone,
                "tone_label": TONE_LABELS.get(tone, "주의"),
                "cluster_size": row.get("cluster_size", 1),
                "status": row.get("status", "new"),
            }
        )
    return articles


def is_stock_listing_noise(row: dict) -> bool:
    title = str(row.get("title") or "")
    source = str(row.get("source") or "")
    link = str(row.get("link") or "")
    text = f"{title} {source} {link} {row.get('summary') or ''} {row.get('description') or ''} {row.get('keyword') or ''}"
    is_itooza_listing = "itooza" in f"{source} {link}".lower() and re.search(r"52주|최고가|최저가|MVP|리스트|상위\s*\d+\s*선", title)
    if not STOCK_LISTING_NOISE_TITLE_RE.search(title) and not is_itooza_listing:
        return False
    if OWN_NAME_RE.search(title) and INVESTMENT_REPORT_RE.search(text):
        return False
    return True


def enrich_issue_summaries(rows: list[dict]) -> list[dict]:
    limit = getattr(config, "AI_MAX_ISSUE_SUMMARIES", getattr(config, "GROQ_MAX_ISSUE_SUMMARIES", 8))
    if not rows or limit <= 0:
        return rows

    groups = build_related_article_groups(rows)
    selected = sorted(groups, key=issue_group_score, reverse=True)[:limit]
    generated = 0
    providers: Counter[str] = Counter()
    summaries = ai_fallback.summarize_issue_groups_with_provider(selected)
    for group, result in zip(selected, summaries):
        members = group.get("members", [])
        if not members:
            continue
        summary, provider = result
        summary = clean_issue_summary(summary, group)
        if not summary:
            continue
        generated += 1
        providers[provider] += 1
        for article in members:
            article["issue_summary"] = summary
    if generated:
        provider_text = ", ".join(f"{name} {count}" for name, count in providers.items())
        print(f"Issue summaries generated: {generated} ({provider_text})")
    return rows


def clean_issue_summary(summary: object, group: dict) -> str:
    text = clean_summary_text(summary)
    members = group.get("members", []) if isinstance(group, dict) else []
    representative = choose_current_issue_representative(members)
    title = representative.get("title", "") if representative else ""
    if not is_usable_summary_line(text, title):
        return ""
    return text.rstrip(".") + "."


def build_related_article_groups(rows: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for row in rows:
        seed = article_group_seed(row)
        target = next((group for group in groups if are_related_article_seeds(seed, group["seed"])), None)
        if target:
            target["members"].append(row)
            target["seed"] = merge_group_seed(target["seed"], seed)
        else:
            groups.append({"seed": seed, "members": [row]})
    for group in groups:
        group["members"].sort(key=article_importance_score, reverse=True)
    return groups


def article_group_seed(row: dict) -> dict:
    canonical = normalize_group_title(row.get("title", ""))
    topic = article_topic_signature(row)
    summary_tokens = article_tokens(row.get("summary", "") or row.get("description", ""))[:16]
    tokens = article_tokens(f"{canonical} {' '.join(summary_tokens)} {row.get('keyword', '')}")
    return {"canonical": canonical, "topic": topic, "tokens": tokens, "token_set": set(tokens)}


def merge_group_seed(current: dict, next_seed: dict) -> dict:
    return {
        "canonical": current.get("canonical", ""),
        "topic": current.get("topic") or "",
        "tokens": current.get("tokens") or [],
        "token_set": set(current.get("tokens") or []),
    }


def are_related_article_seeds(a: dict, b: dict) -> bool:
    if not a.get("canonical") or not b.get("canonical"):
        return False
    shared_count = shared_meaningful_token_count(a.get("tokens", []), b.get("tokens", []))
    shorter, longer = sorted([a["canonical"], b["canonical"]], key=len)
    if len(shorter) >= 24 and shorter in longer and shared_count >= 2:
        return True
    if (
        len(a["canonical"]) >= 32
        and len(b["canonical"]) >= 32
        and a["canonical"][:32] == b["canonical"][:32]
        and shared_count >= 2
    ):
        return True
    if a.get("topic") and b.get("topic") and a["topic"] == b["topic"]:
        return shared_count >= 2
    if min(len(a.get("token_set", set())), len(b.get("token_set", set()))) < 3:
        return False
    overlap = token_overlap_ratio(a.get("token_set", set()), b.get("token_set", set()))
    return overlap >= 0.72 and shared_count >= 2 and shared_long_token(a.get("tokens", []), b.get("tokens", []))


def article_topic_signature(row: dict) -> str:
    text = normalize_group_title(
        f"{row.get('title', '')} {row.get('summary', '') or row.get('description', '')} {row.get('keyword', '')}"
    )

    def includes_all(terms: list[str]) -> bool:
        return all(normalize_group_title(term) in text for term in terms)

    if (
        ("금감원" in text or "금융감독원" in text)
        and ("8대 금융지주" in text or "8대 지주" in text or "금융지주" in text)
        and ("소비자보호" in text or "소비자 중심" in text or "금융문화" in text)
    ):
        return "금감원-금융지주-소비자보호"
    if includes_all(["홍콩els", "제재"]):
        return "홍콩els-제재"
    if includes_all(["신협", "특혜대출"]):
        return "신협-특혜대출"
    if includes_all(["신협", "부실채권"]):
        return "신협-부실채권"
    if includes_all(["소비자보호", "금융현장"]) and ("금감원" in text or "금융감독원" in text):
        return "금감원-소비자보호-현장"
    if includes_all(["롯데손해보험", "경영개선계획"]):
        return "롯데손해보험-경영개선계획"
    if includes_all(["인카금융서비스", "우수인증설계사"]):
        return "인카금융서비스-우수인증설계사"
    if includes_all(["정착지원금", "인카금융서비스"]):
        return "ga-정착지원금-인카"
    if "투자의견" in text and ("하향" in text or "낮아" in text) and ("인카" in text or ("코스피" in text and "증권가" in text)):
        return "인카금융서비스-투자의견-하향"
    return ""


def normalize_group_title(value: object) -> str:
    text = str(value or "").lower()
    text = re.sub(r"\[[^\]]+\]|\([^)]*\)|<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[^\w\s가-힣]", " ", text)
    text = re.sub(r"\b(?:단독|종합|속보|영상|포토|인터뷰|기획|칼럼|사설)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def article_tokens(value: object) -> list[str]:
    stop = {
        "기자",
        "뉴스",
        "보도",
        "관련",
        "통해",
        "대한",
        "위해",
        "올해",
        "이번",
        "추진",
        "강화",
        "본격",
        "금융",
        "보험",
        "보험사",
        "금융위",
        "금감원",
        "금융감독원",
        "금융위원회",
        "손해보험",
        "생명보험",
        "서비스",
        "업계",
        "시장",
        "관리",
        "확대",
        "개최",
        "결정",
        "출시",
        "nbsp",
    }
    return [
        token
        for token in normalize_group_title(value).split()
        if len(token) > 1 and token not in stop and not token.isdigit() and not token.endswith("기자")
    ]


def token_overlap_ratio(a_set: set[str], b_set: set[str]) -> float:
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / min(len(a_set), len(b_set))


def shared_long_token(a_tokens: list[str], b_tokens: list[str]) -> bool:
    b_set = set(b_tokens)
    return any(len(token) >= 5 and token in b_set for token in a_tokens)


def shared_meaningful_tokens(a_tokens: list[str], b_tokens: list[str], *, minimum: int) -> bool:
    return shared_meaningful_token_count(a_tokens, b_tokens) >= minimum


def shared_meaningful_token_count(a_tokens: list[str], b_tokens: list[str]) -> int:
    b_set = set(b_tokens)
    shared = {token for token in a_tokens if len(token) >= 3 and token in b_set}
    return len(shared)


def issue_group_score(group: dict) -> int:
    members = group.get("members", [])
    if not members:
        return 0
    best = max(article_importance_score(row) for row in members)
    related = min(len(members), 8) * 25
    own = 520 if any(row.get("category") == "own" for row in members) else 0
    return best + related + own


def article_importance_score(row: dict) -> int:
    tone_score = {"negative": 420, "caution": 280, "positive": 170, "neutral": 90}.get(str(row.get("tone", "")), 0)
    category_score = 130 if row.get("category") == "regulation" else 80 if row.get("category") in {"competitor", "industry"} else 0
    own_score = 520 if row.get("category") == "own" else 0
    return own_score + tone_score + category_score + int(float(row.get("score") or 0))


def build_summary(archives: list[dict], articles: list[dict]) -> dict:
    category_counts = Counter(row["category"] for row in articles)
    tone_counts = Counter(row["tone"] for row in articles)
    risk_counts = Counter(archive.get("metrics", {}).get("risk_level", "LOW") for archive in archives)

    dates = [archive.get("date") for archive in archives if archive.get("date")]
    if not dates:
        dates = [article.get("date") for article in articles if article.get("date")]
    latest_archive = archives[-1] if archives else {}
    latest_window = latest_archive.get("window", {})

    return {
        "generated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "days": len(dates),
        "first_date": min(dates) if dates else "",
        "last_date": max(dates) if dates else "",
        "latest_window": latest_window.get("label", ""),
        "latest_risk": latest_archive.get("metrics", {}).get("risk_level", "LOW"),
        "total_articles": len(articles),
        "own_articles": category_counts.get("own", 0),
        "negative_articles": tone_counts.get("negative", 0),
        "regulation_articles": category_counts.get("regulation", 0),
        "category_counts": dict(category_counts),
        "tone_counts": dict(tone_counts),
        "risk_counts": dict(risk_counts),
    }


def build_report_runs(archives: list[dict]) -> list[dict]:
    supabase_runs = load_supabase_report_runs()
    if supabase_runs:
        return supabase_runs

    rows = []
    for archive in archives:
        window = archive.get("window", {})
        metrics = archive.get("metrics", {})
        rows.append(
            {
                "run_key": f"{archive.get('date', '')}-{window.get('slot', '')}",
                "report_date": archive.get("date", ""),
                "report_slot": window.get("slot", ""),
                "timestamp": archive.get("timestamp", ""),
                "window_label": window.get("label", ""),
                "window_start": window.get("start", ""),
                "window_end": window.get("end", ""),
                "risk_level": metrics.get("risk_level", "LOW"),
                "metrics": metrics,
            }
        )
    rows.sort(key=report_run_sort_key, reverse=True)
    return rows


def load_supabase_report_runs() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_report_runs()
    except Exception as exc:
        print(f"Supabase report run source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def require_dashboard_history() -> bool:
    return os.getenv("REQUIRE_DASHBOARD_HISTORY", "").strip().lower() in {"1", "true", "yes", "on"}


def load_supabase_notifications() -> list[dict]:
    required = require_dashboard_history()
    if required and not supabase_store.is_enabled():
        raise RuntimeError("Dashboard notification history is required but Supabase write access is not configured.")
    try:
        rows = supabase_store.load_dashboard_notifications()
    except Exception as exc:
        if required:
            raise RuntimeError(f"Dashboard notification history source failed: {exc}") from exc
        print(f"Supabase notification source skipped: {exc}")
        return []
    if not isinstance(rows, list):
        if required:
            raise RuntimeError("Dashboard notification history source returned an invalid payload.")
        return []
    if required and not rows:
        raise RuntimeError("Dashboard notification history is required but notification_sends returned no rows.")
    return rows


def load_supabase_watch_runs() -> list[dict]:
    required = require_dashboard_history()
    if required and not supabase_store.is_enabled():
        raise RuntimeError("Dashboard watch history is required but Supabase write access is not configured.")
    try:
        rows = supabase_store.load_dashboard_watch_runs()
    except Exception as exc:
        if required:
            raise RuntimeError(f"Dashboard watch history source failed: {exc}") from exc
        print(f"Supabase watch source skipped: {exc}")
        return []
    if not isinstance(rows, list):
        if required:
            raise RuntimeError("Dashboard watch history source returned an invalid payload.")
        return []
    if required and not rows:
        raise RuntimeError("Dashboard watch history is required but negative_watch_runs returned no rows.")
    return rows


def load_supabase_scraps() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_scraps()
    except Exception as exc:
        print(f"Supabase scrap source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def report_run_sort_key(row: dict) -> tuple[str, int, str]:
    slot_order = {"08": 1, "13": 2, "18": 3}
    slot = str(row.get("report_slot", ""))
    return (
        str(row.get("report_date", "")),
        slot_order.get(slot, 0),
        str(row.get("timestamp", "")),
    )


def load_dashboard_keywords() -> list[dict]:
    try:
        rows = supabase_store.load_monitor_keyword_rows()
        if rows:
            return rows
    except Exception as exc:
        print(f"Supabase keyword source skipped: {exc}")
    return [{"keyword": keyword, "category": "other", "enabled": True} for keyword in config.KEYWORDS]


def load_dashboard_aliases() -> list[dict]:
    try:
        rows = supabase_store.load_press_alias_rows()
        if rows:
            return rows
    except Exception as exc:
        print(f"Supabase press alias source skipped: {exc}")
    return []


def load_dashboard_classification_feedback() -> list[dict]:
    try:
        return supabase_store.load_classification_feedback_rows()
    except Exception as exc:
        print(f"Supabase classification feedback ledger skipped: {exc}")
    return []


def publish_dashboard() -> Path:
    archives = load_daily_archives()
    articles = build_articles(archives)
    summary = build_summary(archives, articles)
    report_runs = build_report_runs(archives)
    keywords = load_dashboard_keywords()
    aliases = load_dashboard_aliases()
    notifications = load_supabase_notifications()
    watch_runs = load_supabase_watch_runs()
    scraps = load_supabase_scraps()
    classification_feedback = load_dashboard_classification_feedback()
    ai_status = build_ai_status(report_runs)
    quality_checks = build_quality_checks(articles, report_runs, notifications)

    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA_DIR / "articles.json").write_text(
        json.dumps(
            {
                "summary": summary,
                "articles": articles,
                "category_labels": CATEGORY_LABELS,
                "tone_labels": TONE_LABELS,
                "keywords": keywords,
                "aliases": aliases,
                "report_runs": report_runs,
                "notifications": notifications,
                "watch_runs": watch_runs,
                "scraps": scraps,
                "classification_feedback": classification_feedback,
                "classification_feedback_generated_at": datetime.now(KST).isoformat(),
                "ai_status": ai_status,
                "quality_checks": quality_checks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    publish_supabase_public_config()
    rebuilt_target = publish_rebuilt_dashboard()
    if rebuilt_target:
        print(f"Published dashboard: {rebuilt_target}")
        print(f"Dashboard articles: {len(articles)}")
        print(f"Dashboard quality: {quality_checks['status']} - {quality_checks['summary']}")
        if os.getenv("REQUIRE_DASHBOARD_QUALITY", "").lower() == "true" and quality_checks["status"] == "fail":
            raise RuntimeError(quality_checks["summary"])
        return rebuilt_target

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template("dashboard.html")
    target = PUBLIC_DIR / "dashboard.html"
    target.write_text(template.render(summary=summary), encoding="utf-8")
    print(f"Published dashboard: {target}")
    print(f"Dashboard articles: {len(articles)}")
    print(f"Dashboard quality: {quality_checks['status']} - {quality_checks['summary']}")
    if os.getenv("REQUIRE_DASHBOARD_QUALITY", "").lower() == "true" and quality_checks["status"] == "fail":
        raise RuntimeError(quality_checks["summary"])
    return target


def build_quality_checks(articles: list[dict], report_runs: list[dict], notifications: list[dict]) -> dict:
    current_rows = current_day_rows(articles)
    summary_failures = [
        {
            "title": row.get("title", ""),
            "source": row.get("source", ""),
            "reason": "summary_missing_or_title_duplicate",
        }
        for row in current_rows
        if row.get("tone") != "exclude" and not is_usable_summary_line(row.get("summary", ""), row.get("title", ""))
    ]
    report_window_failures = invalid_report_windows(report_runs)
    notification_link_failures = invalid_notification_report_links(notifications)
    notification_action_failures = invalid_notification_action_links(notifications)
    notification_history_failures = invalid_notification_report_history(notifications, report_runs)
    duplicate_notification_failures = invalid_duplicate_success_notifications(notifications)
    checks = [
        {
            "name": "current_day_summaries",
            "status": "ok" if not summary_failures else "fail",
            "total": len(current_rows),
            "failures": summary_failures[:10],
        },
        {
            "name": "daily_report_windows",
            "status": "ok" if not report_window_failures else "fail",
            "total": len(report_runs),
            "failures": report_window_failures[:10],
        },
        {
            "name": "notification_report_links",
            "status": "ok" if not notification_link_failures else "fail",
            "total": len(notifications),
            "failures": notification_link_failures[:10],
        },
        {
            "name": "notification_action_links",
            "status": "ok" if not notification_action_failures else "fail",
            "total": len(notifications),
            "failures": notification_action_failures[:10],
        },
        {
            "name": "notification_report_history",
            "status": "ok" if not notification_history_failures else "fail",
            "total": len(report_runs),
            "failures": notification_history_failures[:10],
        },
        {
            "name": "notification_duplicate_success",
            "status": "ok" if not duplicate_notification_failures else "fail",
            "total": len(notifications),
            "failures": duplicate_notification_failures[:10],
        },
    ]
    failed = [check for check in checks if check["status"] != "ok"]
    status = "fail" if failed else "ok"
    summary = "품질 검증 통과" if status == "ok" else f"{len(failed)}개 품질 검증 항목 확인 필요"
    return {
        "generated_at": datetime.now(KST).isoformat(),
        "status": status,
        "summary": summary,
        "checks": checks,
    }


def invalid_report_windows(report_runs: list[dict]) -> list[dict]:
    failures = []
    scoped = latest_report_date_rows(report_runs)
    for row in scoped:
        slot = str(row.get("report_slot", "")).zfill(2)
        expected = EXPECTED_DAILY_WINDOWS.get(slot)
        if not expected:
            continue
        label = normalize_window_label(row.get("window_label", ""))
        if label and label != normalize_window_label(expected):
            failures.append({
                "run_key": row.get("run_key", ""),
                "slot": slot,
                "expected": expected,
                "actual": row.get("window_label", ""),
            })
    return failures


def latest_report_date_rows(rows: list[dict]) -> list[dict]:
    dates = sorted({str(row.get("report_date") or "")[:10] for row in rows if row.get("report_date")})
    if not dates:
        return rows
    latest = dates[-1]
    return [row for row in rows if str(row.get("report_date") or "")[:10] == latest]


def normalize_window_label(value: object) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def invalid_notification_report_links(notifications: list[dict]) -> list[dict]:
    failures = []
    daily_rows = latest_daily_notification_rows(notifications)
    for row in daily_rows:
        message_type = str(row.get("message_type") or row.get("type") or "")
        title = str(row.get("title") or "")
        if "daily" not in message_type and "일일 언론 동향" not in title:
            continue
        match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", title)
        if not match:
            failures.append({"id": row.get("id", ""), "title": title, "reason": "daily_title_missing_date_slot"})
            continue
        date, slot = match.group(1), match.group(2)
        link = str(row.get("link_url") or row.get("link") or "")
        expected_path = f"/reports/daily/{date}-{slot}.html"
        if expected_path not in link:
            failures.append({
                "id": row.get("id", ""),
                "title": title,
                "reason": "daily_link_mismatch",
                "expected": expected_path,
                "actual": link,
            })
    return failures


def invalid_notification_action_links(notifications: list[dict]) -> list[dict]:
    failures = []
    for row in recent_notification_rows(notifications):
        status = str(row.get("status") or "").lower()
        if status and status != "success":
            continue

        message_type = str(row.get("message_type") or row.get("type") or "")
        title = str(row.get("title") or "")
        link = str(row.get("link_url") or row.get("link") or "").strip()
        if not link:
            failures.append(notification_link_failure(row, "link_missing"))
            continue

        parsed = urlparse(link)
        host = parsed.netloc.lower()
        path = parsed.path or ""
        if parsed.scheme not in {"http", "https"} or is_dashboard_local_link(link):
            failures.append(notification_link_failure(row, "link_not_public_http", actual=link))
            continue

        if "daily" in message_type:
            match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", title)
            if not match:
                failures.append(notification_link_failure(row, "daily_title_missing_date_slot", actual=link))
                continue
            date, slot = match.group(1), match.group(2)
            expected_path = f"/news-monitor/reports/daily/{date}-{slot}.html"
            if host != "incarmarketing.github.io" or path != expected_path:
                failures.append(notification_link_failure(row, "daily_action_link_mismatch", expected=expected_path, actual=link))
            continue

        if "negative" in message_type:
            query = parse_qs(parsed.query)
            if host != "incarmarketing.github.io" or path != "/news-monitor/dashboard.html":
                failures.append(notification_link_failure(row, "negative_action_link_must_open_dashboard", actual=link))
            elif query.get("section", [""])[0] != "monitoring":
                failures.append(notification_link_failure(row, "negative_action_link_missing_monitoring_section", actual=link))
            continue

        if "ai_usage" in message_type:
            allowed_hosts = {"aistudio.google.com", "console.groq.com"}
            if host not in allowed_hosts:
                failures.append(notification_link_failure(row, "ai_usage_link_unexpected_host", actual=link))
            continue

        if host == "incarmarketing.github.io":
            if not path.startswith("/news-monitor/"):
                failures.append(notification_link_failure(row, "internal_link_outside_project", actual=link))
            if "/reports/daily/dashboard.html" in path or path.endswith("/reports/dashboard.html"):
                failures.append(notification_link_failure(row, "internal_link_uses_bad_relative_dashboard_path", actual=link))
    return failures


def invalid_notification_report_history(notifications: list[dict], report_runs: list[dict]) -> list[dict]:
    failures = []
    daily_success_keys = {
        daily_notification_key(row)
        for row in notifications
        if str(row.get("status") or "").lower() == "success" and valid_daily_notification_key(row)
    }
    scoped_runs = latest_report_date_rows(report_runs)
    for row in scoped_runs:
        slot = str(row.get("report_slot") or "").zfill(2)
        if slot not in EXPECTED_DAILY_WINDOWS:
            continue
        date = str(row.get("report_date") or "")[:10]
        if not date:
            continue
        key = f"{date}-{slot}"
        if key not in daily_success_keys:
            failures.append(
                {
                    "run_key": row.get("run_key", key),
                    "report_date": date,
                    "slot": slot,
                    "reason": "report_run_missing_success_notification",
                }
            )
    return failures


def invalid_duplicate_success_notifications(notifications: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    daily_dates = [
        key[:10]
        for key in (daily_notification_key(row) for row in notifications)
        if re.fullmatch(r"20\d{2}-\d{2}-\d{2}-\d{2}", key or "")
    ]
    latest_daily_date = max(daily_dates) if daily_dates else ""
    for row in notifications:
        if str(row.get("status") or "").lower() != "success":
            continue
        message_type = str(row.get("message_type") or row.get("type") or "").strip()
        title = str(row.get("title") or "").strip()
        dedupe_key = str(row.get("dedupe_key") or "").strip()
        if not message_type or not title:
            continue
        if ":resend:" in dedupe_key or "재발송" in title:
            continue
        if "daily" in message_type:
            date_slot = daily_notification_key(row)
            if not date_slot:
                continue
            if latest_daily_date and date_slot[:10] != latest_daily_date:
                continue
            bucket_key = f"{message_type}:{date_slot}"
        else:
            bucket_key = dedupe_key or f"{message_type}:{title}"
        buckets.setdefault(bucket_key, []).append(row)

    failures = []
    for key, rows in buckets.items():
        if len(rows) <= 1:
            continue
        failures.append(
            {
                "key": key,
                "count": len(rows),
                "titles": [row.get("title", "") for row in rows[:3]],
                "sent_at": [row.get("sent_at") or row.get("created_at") for row in rows[:3]],
                "reason": "duplicate_success_notification",
            }
        )
    return failures


def recent_notification_rows(rows: list[dict], limit: int = 50) -> list[dict]:
    def sort_key(row: dict) -> str:
        return str(row.get("sent_at") or row.get("created_at") or row.get("id") or "")

    return sorted(rows, key=sort_key, reverse=True)[:limit]


def notification_link_failure(row: dict, reason: str, *, expected: str = "", actual: str = "") -> dict:
    result = {
        "id": row.get("id", ""),
        "message_type": row.get("message_type") or row.get("type") or "",
        "title": row.get("title", ""),
        "reason": reason,
    }
    if expected:
        result["expected"] = expected
    if actual:
        result["actual"] = actual
    return result


def is_dashboard_local_link(link: str) -> bool:
    lowered = link.lower()
    return (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or "::1" in lowered
        or lowered.startswith("file:")
    )


def daily_notification_key(row: dict) -> str:
    title = str(row.get("title") or "")
    link = str(row.get("link_url") or row.get("link") or "")
    match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", title)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    match = re.search(r"/reports/daily/(20\d{2}-\d{2}-\d{2})-(\d{2})\.html", link)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return ""


def valid_daily_notification_key(row: dict) -> str:
    title_key = ""
    title_match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", str(row.get("title") or ""))
    if title_match:
        title_key = f"{title_match.group(1)}-{title_match.group(2)}"

    link = str(row.get("link_url") or row.get("link") or "")
    link_match = re.search(r"/reports/daily/(20\d{2}-\d{2}-\d{2})-(\d{2})\.html", link)
    link_key = f"{link_match.group(1)}-{link_match.group(2)}" if link_match else ""
    if title_key and link_key and title_key == link_key:
        return title_key
    return ""


def latest_daily_notification_rows(rows: list[dict]) -> list[dict]:
    daily_rows = []
    for row in rows:
        message_type = str(row.get("message_type") or row.get("type") or "")
        title = str(row.get("title") or "")
        if "daily" not in message_type and "일일 언론 동향" not in title:
            continue
        match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", title)
        if match:
            row = {**row, "_daily_report_date": match.group(1), "_daily_report_slot": match.group(2)}
        daily_rows.append(row)
    dates = sorted({row.get("_daily_report_date", "") for row in daily_rows if row.get("_daily_report_date")})
    if not dates:
        return daily_rows
    latest = dates[-1]
    return [row for row in daily_rows if row.get("_daily_report_date") == latest]


def build_ai_status(report_runs: list[dict] | None = None) -> dict:
    circuit_open, circuit_state = gemini_helper.circuit_open()
    groq_status = groq_helper.rate_limit_status()
    latest_gemini_report = latest_gemini_report_status(report_runs or [])
    gemini_usage_state = gemini_helper.read_usage_state()
    return {
        "generated_at": datetime.now(KST).isoformat(),
        "gemini": {
            "model": config.GEMINI_MODEL,
            "fallback_models": getattr(config, "GEMINI_FALLBACK_MODELS", []),
            "has_key": bool(os.getenv("GEMINI_API_KEY", "").strip()),
            "circuit_open": circuit_open,
            "circuit_reason": circuit_state.get("reason", ""),
            "blocked_until": circuit_state.get("blocked_until", ""),
            "usage_url": getattr(config, "GEMINI_USAGE_URL", "https://aistudio.google.com/usage"),
            "latest_report": latest_gemini_report,
            "last_response": gemini_usage_state,
        },
        "groq": {
            "model": os.getenv("GROQ_ISSUE_MODEL", config.GROQ_MODEL),
            "report_model": config.GROQ_MODEL,
            "has_key": bool(os.getenv("GROQ_API_KEY", "").strip()),
            "rate_limit": groq_status,
            "limits_url": "https://console.groq.com/settings/limits",
        },
    }


def latest_gemini_report_status(report_runs: list[dict]) -> dict:
    for row in report_runs:
        metrics = row.get("metrics") if isinstance(row, dict) else {}
        if not isinstance(metrics, dict):
            continue
        if not any(key in metrics for key in ("ai_model_used", "ai_primary_failed", "ai_quota_exhausted", "ai_errors")):
            continue
        errors = metrics.get("ai_errors") if isinstance(metrics.get("ai_errors"), list) else []
        first_error = errors[0] if errors and isinstance(errors[0], dict) else {}
        error_text = str(first_error.get("error", ""))
        credit_depleted = "prepayment credits are depleted" in error_text.lower() or "credits are depleted" in error_text.lower()
        return {
            "run_key": row.get("run_key", ""),
            "report_date": row.get("report_date", ""),
            "report_slot": row.get("report_slot", ""),
            "ai_model_used": metrics.get("ai_model_used", ""),
            "primary_failed": bool(metrics.get("ai_primary_failed")),
            "fallback_used": bool(metrics.get("ai_fallback_used")),
            "quota_exhausted": bool(metrics.get("ai_quota_exhausted")),
            "credit_depleted": credit_depleted,
            "error": error_text[:220],
            "error_model": first_error.get("model", ""),
            "usage": metrics.get("ai_usage_metadata") if isinstance(metrics.get("ai_usage_metadata"), dict) else {},
            "model_version": metrics.get("ai_response_model_version", ""),
        }
    return {}


def publish_rebuilt_dashboard() -> Path | None:
    index_source = FRONTEND_DIST_DIR / "index.html"
    if not index_source.exists():
        print("Rebuilt frontend dist not found. Falling back to templates/dashboard.html.")
        return None

    assets_source = FRONTEND_DIST_DIR / "assets"
    assets_target = PUBLIC_DIR / "assets"
    if assets_source.exists():
        assets_target.mkdir(parents=True, exist_ok=True)
        for source in assets_source.iterdir():
            if source.is_file():
                shutil.copy2(source, assets_target / source.name)

    target = PUBLIC_DIR / "dashboard.html"
    target.write_text(index_source.read_text(encoding="utf-8"), encoding="utf-8")
    print("Published rebuilt React dashboard.")
    return target


def publish_supabase_public_config() -> None:
    url = (os.getenv("PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").rstrip("/")
    project_ref = os.getenv("SUPABASE_PROJECT_REF", "").strip() or DEFAULT_SUPABASE_PROJECT_REF
    if not url and project_ref:
        url = f"https://{project_ref}.supabase.co"
    anon_key = (
        os.getenv("PUBLIC_SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or ""
    )
    config_path = PUBLIC_DATA_DIR / "supabase.json"
    if not url or not anon_key:
        if config_path.exists():
            config_path.unlink()
        print("Supabase public config skipped: PUBLIC_SUPABASE_URL/SUPABASE_URL and public anon or publishable key are required.")
        return
    config_path.write_text(
        json.dumps({"url": url, "anon_key": anon_key}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def enrich_issue_summaries(rows: list[dict]) -> list[dict]:
    limit = getattr(config, "AI_MAX_ISSUE_SUMMARIES", getattr(config, "GROQ_MAX_ISSUE_SUMMARIES", 8))
    if not rows or limit <= 0:
        return rows

    selected = select_current_issue_summary_groups(rows, limit)
    generated = 0
    providers: Counter[str] = Counter()
    summaries = ai_fallback.summarize_issue_groups_with_provider(selected)
    for group, result in zip(selected, summaries):
        members = group.get("members", [])
        if not members:
            continue
        summary, provider = result
        summary = clean_issue_summary(summary, group)
        if not summary:
            continue
        generated += 1
        providers[provider] += 1
        for article in members:
            article["issue_summary"] = summary
    if generated:
        provider_text = ", ".join(f"{name} {count}" for name, count in providers.items())
        print(f"Current-day issue summaries generated: {generated} ({provider_text})")
    return rows


def select_current_issue_summary_groups(rows: list[dict], limit: int) -> list[dict]:
    current_rows = current_day_rows(rows)
    groups = build_related_article_groups(current_rows)
    selected: list[dict] = []
    seen: set[str] = set()

    def add_bucket(predicate, quota: int) -> None:
        candidates = [group for group in groups if predicate(group)]
        for group in sorted(candidates, key=current_issue_group_score, reverse=True):
            if len([item for item in selected if predicate(item)]) >= quota:
                break
            add_group_if_new(selected, seen, group, limit)

    add_bucket(lambda group: group_has_category(group, "own") and group_has_tone(group, "positive"), 3)
    add_bucket(lambda group: group_has_category(group, "own") and group_has_tone(group, {"negative", "caution"}), 4)
    add_bucket(lambda group: group_has_category(group, "regulation"), 4)
    add_bucket(lambda group: group_has_category(group, {"competitor", "industry"}), 4)

    for group in sorted(groups, key=current_issue_group_score, reverse=True):
        add_group_if_new(selected, seen, group, limit)
        if len(selected) >= limit:
            break
    return selected[:limit]


def current_day_rows(rows: list[dict]) -> list[dict]:
    dates = sorted({str(row.get("date") or "")[:10] for row in rows if row.get("date")})
    if not dates:
        return rows
    latest = dates[-1]
    return [row for row in rows if str(row.get("date") or "")[:10] == latest]


def add_group_if_new(selected: list[dict], seen: set[str], group: dict, limit: int) -> None:
    if len(selected) >= limit:
        return
    members = group.get("members", [])
    if not members:
        return
    representative = choose_current_issue_representative(members)
    key = group_identity_key(group, representative)
    if not key or key in seen:
        return
    seen.add(key)
    selected.append(group)


def group_identity_key(group: dict, representative: dict) -> str:
    topic = str(group.get("seed", {}).get("topic") or "")
    if topic:
        return f"topic:{topic}"
    link = str(representative.get("link") or "")
    if link:
        return f"link:{link}"
    return f"title:{normalize_group_title(representative.get('title', ''))[:90]}"


def choose_current_issue_representative(members: list[dict]) -> dict:
    return sorted(members, key=article_importance_score, reverse=True)[0] if members else {}


def current_issue_group_score(group: dict) -> int:
    members = group.get("members", [])
    if not members:
        return 0
    representative = choose_current_issue_representative(members)
    diversity = min(len({row.get("source") for row in members if row.get("source")}), 5) * 24
    related = min(len(members), 8) * 18
    return article_importance_score(representative) + diversity + related


def group_has_category(group: dict, categories) -> bool:
    if isinstance(categories, str):
        categories = {categories}
    return any(row.get("category") in categories for row in group.get("members", []))


def group_has_tone(group: dict, tones) -> bool:
    if isinstance(tones, str):
        tones = {tones}
    return any(row.get("tone") in tones for row in group.get("members", []))


if __name__ == "__main__":
    publish_dashboard()
