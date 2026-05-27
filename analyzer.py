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
    "DB금융서비스", "메가", "글로벌금융판매", "지에이코리아", "GA코리아",
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

INDUSTRY_WORDS = [
    "보험", "보험사", "GA", "보험설계사", "설계사", "생명보험", "손해보험",
    "보험대리점", "프로모션", "영업", "보험금", "보험료",
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

POSITIVE_RANKING_WORDS = ["브랜드평판", "1위", "수상", "선정", "최고", "선두"]

CATEGORIES = {
    "own": OWN_NAMES,
    "regulation": REGULATION_WORDS,
    "competitor": COMPETITOR_WORDS,
    "industry": INDUSTRY_WORDS,
}


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
    if any(word in title for word in REGULATION_WORDS):
        score += 4
    if any(word in text for word in REPUTATION_WORDS):
        score += 7
    if is_own_article(article) and any(word in text for word in REPUTATION_WORDS):
        score += 5
    if len(title) < 15:
        score -= 2
    return score


def categorize(article: dict) -> str:
    text = article.get("title", "") + " " + article.get("description", "")
    if any(keyword in text for keyword in OWN_NAMES):
        return "own"
    if any(keyword in text for keyword in COMPETITOR_WORDS):
        return "competitor"
    if any(keyword in text for keyword in REGULATION_WORDS):
        return "regulation"
    if any(keyword in text for keyword in INDUSTRY_WORDS):
        return "industry"
    return "other"


def analyze_tone(article: dict) -> str:
    if not is_own_article(article):
        return "neutral"

    title = article.get("title", "")
    text = title + " " + article.get("description", "")

    negative_score = 0
    positive_score = 0

    negative_score += sum(3 for word in NEGATIVE_WORDS if word in title)
    negative_score += sum(1 for word in NEGATIVE_WORDS if word in text and word not in title)
    negative_score += sum(2 for word in RISK_CONTEXT_WORDS if word in title)
    negative_score += sum(1 for word in RISK_CONTEXT_WORDS if word in text and word not in title)

    positive_score += sum(2 for word in POSITIVE_RANKING_WORDS if word in title)
    positive_score += sum(1 for word in POSITIVE_WORDS if word in title)
    positive_score += sum(1 for word in CSR_CONTEXT_WORDS if word in text)

    # 당사 언급 기사에서 감독/점검/제재 맥락은 단순 수치 증가보다 리스크 신호가 우선이다.
    if negative_score >= 2 and negative_score >= positive_score:
        return "negative"
    if positive_score >= 2 and negative_score == 0:
        return "positive"
    return "neutral"


def is_own_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    return any(name in text for name in OWN_NAMES)


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
            "positive": tone_count.get("positive", 0),
            "neutral": tone_count.get("neutral", 0),
        },
        "own_negative": own_negative,
        "own_total": category_count.get("own", 0),
        "own_by_tone": {
            "positive": own_tone_count.get("positive", 0),
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
