"""Score, classify, cluster, and summarize news articles before AI analysis."""

from __future__ import annotations

import difflib
import re
from collections import Counter


OWN_NAMES = ["인카금융", "인카금융서비스"]

REGULATION_WORDS = [
    "금감원", "금융위", "금융감독원", "금융소비자보호", "규제", "법안", "1200%",
    "정착률", "공시", "보험업법", "감독", "제재", "처분", "GA 내부통제",
    "근로자성", "특수고용", "설계사 고용", "수수료", "불완전판매",
]

COMPETITOR_WORDS = [
    "굿리치", "에이플러스에셋", "리치앤코", "한화생명금융서비스", "마이금융파트너",
    "DB금융서비스", "메가", "메가금융서비스", "글로벌금융판매", "지에이코리아", "GA코리아",
    "한국보험금융", "프라임에셋", "리더스금융판매", "유퍼스트",
    "피플라이프", "메트라이프금융서비스", "삼성생명금융서비스", "메트리치",
    "더블유에셋", "라이프원", "더비전에셋", "DB MnS", "유금융서비스",
    "글로벌금융판매AGENCY", "인블룸에셋", "더베스트금융서비스",
    "동양생명금융서비스", "더비금융서비스", "에즈금융서비스", "맘스",
    "베라금융서비스", "서울법인재무설계센터", "시에프에셋", "에이비엘라이프",
    "우리인슈맨라이프", "인슈코아", "인스밸리", "인포유금융서비스",
    "삼성생명", "한화생명", "교보생명", "신한라이프", "미래에셋생명",
    "KB라이프생명", "NH농협생명", "농협생명", "흥국생명", "동양생명",
    "ABL생명", "AIA생명", "라이나생명", "메트라이프생명", "DB생명",
    "KDB생명", "하나생명", "IBK연금",
    "삼성화재", "현대해상", "DB손해보험", "DB손보", "KB손해보험", "KB손보",
    "메리츠화재", "한화손해보험", "한화손보", "흥국화재", "롯데손해보험",
    "롯데손보", "NH농협손해보험", "농협손보", "MG손해보험", "AXA손해보험",
    "악사손보", "AIG손해보험", "캐롯손해보험", "카카오페이손해보험",
]

AMBIGUOUS_COMPETITOR_WORDS = {"메가"}

DOMAIN_CONTEXT_WORDS = [
    "보험", "보험사", "생명보험", "손해보험", "보험대리점", "법인보험대리점",
    "GA", "보험GA", "보험설계사", "설계사", "전속설계사", "전속 설계사",
    "GA설계사", "GA 설계사", "보험모집인", "보험 모집인", "모집인",
    "영업가족", "금융서비스",
    "금감원", "금융감독원", "금융위", "금융위원회", "보험업법", "1200%",
    "수수료", "정착지원금", "불완전판매", "내부통제",
]

INDUSTRY_WORDS = [
    "보험", "보험사", "GA", "보험설계사", "설계사", "전속설계사",
    "전속 설계사", "GA설계사", "GA 설계사", "보험모집인", "보험 모집인",
    "생명보험", "손해보험", "보험대리점", "프로모션", "보험 영업",
    "보험금", "보험료",
]

MAJOR_PRESS = [
    "조선", "중앙", "동아", "한국경제", "매일경제", "서울경제", "서울신문",
    "연합뉴스", "이데일리", "뉴스1", "머니투데이", "디지털투데이",
    "한국금융신문", "더벨", "비즈워치", "아주경제", "경향신문",
]

NEGATIVE_WORDS = [
    "불법", "갑질", "사기", "횡령", "과징금", "고발", "논란", "압수수색",
    "제재", "하락", "최하위", "악화", "감소", "부진", "위반", "리스크",
    "급락", "추락", "관리부실", "관리 부실", "무단", "징계", "소송",
    "오류", "먹통", "기관주의", "경고", "조사", "검사", "점검", "전격",
    "보따리", "과열", "영업 관행", "정착지원금", "이직", "턴다",
]

SEVERE_NEGATIVE_WORDS = [
    "불법", "갑질", "사기", "사칭", "횡령", "배임", "고발", "압수수색",
    "제재", "처분", "과징금", "과태료", "기관주의", "위반", "징계",
    "소송", "논란", "스캔들", "피해", "민원", "고객 DB", "고객DB",
    "고객정보", "개인정보", "불완전판매", "관리부실", "관리 부실",
    "무단", "먹통", "오류",
]

CAUTION_WORDS = [
    "하락", "급락", "약세", "추락", "낙폭", "신저가", "최하위", "악화",
    "감소", "부진", "리스크", "경고", "조사", "검사", "점검", "전격",
    "보따리", "과열", "영업 관행", "정착지원금", "정착률", "이직", "수수료",
    "환수", "부담", "둔화", "후퇴", "우려", "경계감",
]

POSITIVE_WORDS = [
    "성장", "증가", "수상", "최고", "1위", "흑자", "강세", "신기록",
    "상승", "혁신", "급증", "호조", "개선", "안정", "개척", "돌파",
    "사회공헌", "기부", "후원", "지원", "협약",
]

CSR_CONTEXT_WORDS = ["사회공헌", "기부", "후원", "봉사", "지원", "캠페인", "협약"]

REPUTATION_WORDS = ["브랜드평판", "평판", "1위", "순위", "수성"]

RISK_CONTEXT_WORDS = [
    "금감원", "금융감독원", "금융위", "제재", "과태료", "기관주의", "검사",
    "점검", "조사", "논란", "고발", "소송", "불완전판매", "내부통제",
    "정착지원금", "이직", "보따리", "전격 점검", "영업 관행", "관리 부실",
]

SETTLEMENT_SUPPORT_CONTEXT_WORDS = [
    "정착지원금", "1200% 룰", "1200%룰", "판매수수료 상한", "수수료 상한",
    "보험GA협회", "정보공시", "GA들", "초대형 GA", "설계사 유치",
    "스카우트 경쟁",
]

SETTLEMENT_SUPPORT_SEVERE_WORDS = [
    "불법", "사기", "횡령", "제재", "처분", "과징금", "과태료", "기관주의",
    "검사", "조사", "고발", "소송", "불완전판매", "내부통제", "관리 부실",
    "약탈", "스캔들", "위반",
]

INVESTMENT_DOWNGRADE_CONTEXT_WORDS = [
    "투자의견", "목표주가", "목표가", "증권가", "리포트", "애널리스트",
    "매수", "보유", "홀드", "중립", "매도", "밸류에이션", "주가",
]

INVESTMENT_DOWNGRADE_WORDS = [
    "하향", "하향 조정", "낮아졌다", "낮췄다", "낮추", "후퇴", "매수 접",
    "매수 의견 후퇴", "상승 여력 제한", "추가 상승 여력은 제한", "밸류에이션 부담",
    "성장 모멘텀 둔화", "보수적인 시각", "경계감", "고평가", "과열",
]

STOCK_DECLINE_CONTEXT_WORDS = [
    "주가", "증시", "코스피", "코스닥", "상장", "시총", "시가총액", "거래",
]

STOCK_DECLINE_WORDS = [
    "하락", "급락", "약세", "낙폭", "신저가", "부진", "조정", "매도",
]

POSITIVE_RANKING_WORDS = ["브랜드평판", "1위", "수상", "선정", "최고", "선두"]

PHOTO_SPORTS_NOISE_WORDS = [
    "포토", "화보", "갤러리", "골프", "여자오픈", "오픈", "라운드", "최종라운드",
    "1번홀", "홀에서", "리조트", "파72", "우승상금", "순위를 올린다",
]

MATERIAL_CAUTION_CONTEXT_WORDS = [
    "투자의견", "목표주가", "목표가", "주가", "하향", "급락", "자본성증권",
    "발행 뚝", "자본 확충", "경영개선", "매각", "불완전판매", "보험사기",
    "금감원", "금융감독원", "금융위", "제재", "과태료", "소송", "민원",
    "손해율", "수수료", "규제", "1200% 룰", "정착지원금", "공시",
]

MATERIAL_BUSINESS_CONTEXT_WORDS = DOMAIN_CONTEXT_WORDS + MATERIAL_CAUTION_CONTEXT_WORDS + [
    "보험료", "보험금", "계약", "상품", "실손", "생명보험", "손해보험", "GA",
    "설계사", "대리점", "금융서비스", "실적", "영업", "채권", "증권",
]

CATEGORIES = {
    "own": OWN_NAMES,
    "regulation": REGULATION_WORDS,
    "competitor": COMPETITOR_WORDS,
    "industry": INDUSTRY_WORDS,
}
KEYWORD_CATEGORIES = {"own", "regulation", "competitor", "industry", "other"}


def analyze(articles: list[dict], top_n: int = 60) -> tuple[list[dict], dict]:
    for article in articles:
        article["_category"] = categorize(article)
        article["_tone"] = analyze_tone(article)
        article["_score"] = score_article(article)

    articles.sort(key=lambda x: x.get("_score", 0), reverse=True)
    clustered = cluster_articles(articles[:top_n])
    clustered.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return clustered, build_metrics(articles, clustered)


def score_article(article: dict) -> int:
    title = article.get("title", "")
    desc = article.get("description", "")
    text = f"{title} {desc}"
    score = 0

    if is_own_article(article):
        score += 14
    elif article.get("_category") in {"regulation", "competitor"}:
        score += 8
    elif article.get("_category") == "industry":
        score += 4

    if article.get("keyword") and article["keyword"] in title:
        score += 4
    if any(press in text for press in MAJOR_PRESS):
        score += 3
    if is_own_article(article) and any(word in title for word in NEGATIVE_WORDS):
        score += 6
    if is_investment_downgrade_article(article):
        score += 8
    if any(word in title for word in REGULATION_WORDS):
        score += 4
    if any(word in text for word in REPUTATION_WORDS):
        score += 7
    if is_own_article(article) and any(word in text for word in REPUTATION_WORDS):
        score += 5
    if len(title) < 15:
        score -= 2
    if is_non_business_noise(article):
        score -= 20
    return score


def categorize(article: dict) -> str:
    text = article.get("title", "") + " " + article.get("description", "")
    if is_non_business_noise(article):
        return "other"
    if any(keyword in text for keyword in OWN_NAMES):
        return "own"
    preferred = normalize_keyword_category(article.get("keyword_category"))
    if preferred in {"regulation", "competitor", "industry"} and has_domain_context(text):
        return preferred
    if preferred == "other":
        return "other"
    if contains_competitor_word(text):
        return "competitor"
    if any(keyword in text for keyword in REGULATION_WORDS):
        return "regulation"
    if any(keyword in text for keyword in INDUSTRY_WORDS):
        return "industry"
    return "other"


def normalize_keyword_category(value: object) -> str:
    category = str(value or "").strip()
    return category if category in KEYWORD_CATEGORIES else ""


def contains_competitor_word(text: str) -> bool:
    for keyword in COMPETITOR_WORDS:
        if keyword in AMBIGUOUS_COMPETITOR_WORDS:
            if is_ambiguous_competitor_match(text, keyword):
                return True
            continue
        if keyword in text:
            return True
    return False


def is_ambiguous_competitor_match(text: str, keyword: str) -> bool:
    if re.search(rf"{re.escape(keyword)}(금융|보험|GA|에셋|대리점|서비스)", text):
        return True
    standalone = re.search(rf"(?<![0-9A-Za-z가-힣]){re.escape(keyword)}(?![0-9A-Za-z가-힣])", text)
    return bool(standalone and has_domain_context(text))


def has_domain_context(text: str) -> bool:
    if any(word in text for word in OWN_NAMES):
        return True
    if any(word in text for word in REGULATION_WORDS):
        return True
    if any(word in text for word in INDUSTRY_WORDS):
        return True
    if any(word in text for word in DOMAIN_CONTEXT_WORDS):
        return True
    return False


def has_material_business_context(text: str) -> bool:
    return any(word in text for word in MATERIAL_BUSINESS_CONTEXT_WORDS)


def is_non_business_noise(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    title = article.get("title", "")
    if not text.strip():
        return True
    has_photo_sports_signal = any(word in title or word in text for word in PHOTO_SPORTS_NOISE_WORDS)
    has_material_signal = any(word in text for word in MATERIAL_CAUTION_CONTEXT_WORDS) or any(name in text for name in OWN_NAMES)
    if has_photo_sports_signal and not has_material_signal:
        return True
    return False


def analyze_tone(article: dict) -> str:
    title = article.get("title", "")
    text = title + " " + article.get("description", "")
    category = article.get("_category") or categorize(article)

    if is_non_business_noise(article):
        return "neutral"

    severe_score = 0
    caution_score = 0
    positive_score = 0

    severe_score += sum(4 for word in SEVERE_NEGATIVE_WORDS if word in title)
    severe_score += sum(2 for word in SEVERE_NEGATIVE_WORDS if word in text and word not in title)
    caution_score += sum(2 for word in CAUTION_WORDS if word in title)
    caution_score += sum(1 for word in CAUTION_WORDS if word in text and word not in title)
    caution_score += sum(1 for word in RISK_CONTEXT_WORDS if word in title)
    caution_score += sum(1 for word in RISK_CONTEXT_WORDS if word in text and word not in title)
    if is_investment_downgrade_article(article):
        caution_score += 7
    if is_stock_decline_article(article):
        caution_score += 5
    if is_settlement_support_caution_article(article):
        caution_score += 6

    positive_score += sum(2 for word in POSITIVE_RANKING_WORDS if word in title)
    positive_score += sum(1 for word in POSITIVE_WORDS if word in title)
    positive_score += sum(1 for word in CSR_CONTEXT_WORDS if word in text)

    if is_own_article(article) and is_zero_misconduct_positive_article(article):
        return "positive"

    # 당사 직접 사고/제재성 이슈만 부정으로 둔다. 시장 약세나 투자의견 하향은 주의로 본다.
    if is_own_article(article) and severe_score >= 4 and severe_score >= positive_score:
        return "negative"
    if category == "own" and positive_score >= 2 and severe_score == 0 and caution_score <= 1:
        return "positive"
    if should_mark_caution(article, category, severe_score, caution_score):
        return "caution"
    return "neutral"


def should_mark_caution(article: dict, category: str, severe_score: int, caution_score: int) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    if is_investment_downgrade_article(article) or is_stock_decline_article(article):
        return True
    if is_settlement_support_caution_article(article):
        return True
    if category == "own" and caution_score >= 2:
        return True
    if category == "regulation" and caution_score >= 2:
        return True
    if severe_score >= 4 and any(word in text for word in MATERIAL_CAUTION_CONTEXT_WORDS):
        return True
    if category in {"competitor", "industry"}:
        return caution_score >= 5 and any(word in text for word in MATERIAL_CAUTION_CONTEXT_WORDS)
    return False


def is_zero_misconduct_positive_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    return "불완전판매" in text and any(word in text for word in ("0건", "제로", "우수", "인증", "선정"))


def is_own_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    return any(name in text for name in OWN_NAMES)


def is_investment_downgrade_article(article: dict) -> bool:
    if not is_own_article(article):
        return False
    text = article.get("title", "") + " " + article.get("description", "")
    has_market_context = any(word in text for word in INVESTMENT_DOWNGRADE_CONTEXT_WORDS)
    has_downgrade_signal = any(word in text for word in INVESTMENT_DOWNGRADE_WORDS)
    return has_market_context and has_downgrade_signal


def is_stock_decline_article(article: dict) -> bool:
    if not is_own_article(article):
        return False
    text = article.get("title", "") + " " + article.get("description", "")
    has_market_context = any(word in text for word in STOCK_DECLINE_CONTEXT_WORDS)
    has_decline_signal = any(word in text for word in STOCK_DECLINE_WORDS)
    return has_market_context and has_decline_signal


def is_settlement_support_caution_article(article: dict) -> bool:
    if not is_own_article(article):
        return False
    text = article.get("title", "") + " " + article.get("description", "")
    has_context = any(word in text for word in SETTLEMENT_SUPPORT_CONTEXT_WORDS)
    has_severe_signal = any(word in text for word in SETTLEMENT_SUPPORT_SEVERE_WORDS)
    if not has_context or has_severe_signal:
        return False

    title = article.get("title", "")
    own_in_title = any(name in title for name in OWN_NAMES)
    own_list_mention = bool(re.search(r"[△,·]\s*인카금융서비스|\b인카금융서비스\(\d+억", text))
    industry_title = any(word in title for word in ("GA들", "초대형 GA", "GA ", "1200% 룰", "정착지원금"))
    return (not own_in_title and (own_list_mention or industry_title)) or (
        own_in_title and any(word in text for word in ("공시", "지급 규모", "순이다", "전년 동기"))
    )


def cluster_articles(articles: list[dict], threshold: float = 0.62) -> list[dict]:
    used: set[int] = set()
    representatives = []

    for i, article in enumerate(articles):
        if i in used:
            continue
        cluster = [article]
        used.add(i)
        title = normalize_title(article.get("title", ""))

        for j in range(i + 1, len(articles)):
            if j in used:
                continue
            other_title = normalize_title(articles[j].get("title", ""))
            if difflib.SequenceMatcher(None, title, other_title).ratio() >= threshold:
                cluster.append(articles[j])
                used.add(j)

        representative = max(cluster, key=lambda item: item.get("_score", 0))
        representative["_cluster_size"] = len(cluster)
        representatives.append(representative)

    return representatives


def normalize_title(title: str) -> str:
    cleaned = re.sub(r"\[[^\]]+\]|\([^)]+\)|[^\w가-힣]", "", title)
    return cleaned[:45]


def build_metrics(all_articles: list[dict], clustered: list[dict]) -> dict:
    category_count = Counter(a.get("_category", "other") for a in all_articles)
    tone_count = Counter(a.get("_tone", "neutral") for a in all_articles)
    own_tone_count = Counter(
        a.get("_tone", "neutral")
        for a in all_articles
        if a.get("_category") == "own"
    )
    own_negative = sum(
        1 for a in all_articles
        if a.get("_category") == "own" and a.get("_tone") == "negative"
    )

    return {
        "total_collected": len(all_articles),
        "total_after_cluster": len(clustered),
        "by_category": {
            "own": category_count.get("own", 0),
            "regulation": category_count.get("regulation", 0),
            "competitor": category_count.get("competitor", 0),
            "industry": category_count.get("industry", 0),
            "other": category_count.get("other", 0),
        },
        "by_tone": {
            "negative": tone_count.get("negative", 0),
            "caution": tone_count.get("caution", 0),
            "positive": tone_count.get("positive", 0),
            "neutral": tone_count.get("neutral", 0),
        },
        "own_negative": own_negative,
        "own_total": category_count.get("own", 0),
        "own_by_tone": {
            "positive": own_tone_count.get("positive", 0),
            "caution": own_tone_count.get("caution", 0),
            "neutral": own_tone_count.get("neutral", 0),
            "negative": own_tone_count.get("negative", 0),
        },
        "risk_level": calculate_risk_level(own_negative),
    }


def calculate_risk_level(own_negative: int) -> str:
    if own_negative >= 3:
        return "HIGH"
    if own_negative >= 1:
        return "MEDIUM"
    return "LOW"
