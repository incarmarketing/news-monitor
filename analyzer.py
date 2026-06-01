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

GENERIC_POLICY_WORDS = {"수수료", "규제", "법안", "감독", "공시", "제도"}
INSURANCE_DOMAIN_CONTEXT_WORDS = [
    word for word in DOMAIN_CONTEXT_WORDS
    if word not in GENERIC_POLICY_WORDS and word != "금융서비스"
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
    "하락", "급락", "약세", "낙폭", "신저가", "최저가", "부진", "조정", "매도", "▼", "↓",
]

POSITIVE_RANKING_WORDS = ["브랜드평판", "1위", "수상", "선정", "최고", "선두"]

PHOTO_SPORTS_NOISE_WORDS = [
    "포토", "화보", "갤러리", "골프", "여자오픈", "오픈", "라운드", "최종라운드",
    "1번홀", "홀에서", "리조트", "파72", "우승상금", "순위를 올린다",
]

SPORTS_MARKETING_NOISE_WORDS = [
    "스포츠마케팅", "스포츠 마케팅", "프로야구", "프로농구", "프로배구",
    "농구단", "배구단", "야구단", "축구단", "골프단", "구단", "선수단",
    "배구", "농구", "야구", "축구", "골프", "KBO", "KBL", "V리그",
    "시구", "시타", "홈경기", "원정경기", "플레이오프", "챔피언결정전",
    "유니폼", "스폰서", "후원", "스폰서십", "타이틀스폰서",
]

SPORTS_BUSINESS_KEEP_WORDS = [
    "보험금", "보험료", "상품", "계약", "민원", "제재", "소송", "실적",
    "매출", "영업이익", "M/S", "점유율", "금감원", "금융감독원", "금융위",
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
        article["_summary"] = build_quality_summary(article)

    articles.sort(key=lambda x: x.get("_score", 0), reverse=True)
    clustered = cluster_articles(articles[:top_n])
    clustered.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return clustered, build_metrics(articles, clustered)


def build_quality_summary(article: dict) -> str:
    """Return an operational article summary, not a photo caption or portal fragment."""
    title = clean_summary_text(article.get("title", ""))
    description = strip_caption_prefix(clean_summary_text(article.get("description", "") or article.get("summary", "")))
    complaint_summary = consumer_complaint_summary(article, title, description)
    if complaint_summary:
        return complaint_summary
    if description and not is_caption_like_summary(description):
        sentences = split_summary_sentences(description)
        usable = [
            sentence for sentence in sentences
            if sentence != title and not is_caption_like_summary(sentence)
        ]
        if usable:
            summary = limit_summary(" ".join(usable[:2]))
            if summary:
                return summary
        if len(description) >= 38 and not is_broken_summary_fragment(description):
            summary = limit_summary(description)
            if summary:
                return summary
    return title_based_summary(article, title)


def clean_summary_text(value: object) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;nbsp;", " ")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = re.sub(r"^[\[［【(（].{0,60}[=＝].{0,30}기자[\]］】)）]\s*", "", text)
    text = re.sub(r"^\[[^\]]+\s+[^\]]*기자\]\s*", "", text)
    text = re.sub(r"^[［【].{1,60}기자[］】]\s*", "", text)
    text = re.sub(r"^[가-힣A-Za-z0-9_.·\s-]{1,30}\s*[=＝]\s*[가-힣]{2,5}\s*기자\s*", "", text)
    text = re.sub(r"^[^\s]+ 기자\s*=\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \t\r\n.·")


def strip_caption_prefix(value: str) -> str:
    text = clean_summary_text(value)
    if not re.search(r"전경|사진\s*=|제공\s*=|이미지|기념\s*촬영|로고", text):
        return text
    if "◇" in text:
        head, tail = text.split("◇", 1)
        if re.search(r"전경|사진\s*=|제공\s*=|이미지", head):
            return clean_summary_text(tail)

    text = re.sub(
        r"^[^.!?。]{0,130}(?:사옥\s*전경|본사\s*전경|건물\s*외관)\s*(?:[.,。/ ]|\([^)]*\))*\s*",
        "",
        text,
    )
    text = re.sub(r"^[\[/ ]*(?:사진|제공)\s*=\s*[^◇.。\]]{0,90}[\]◇.。]?\s*", "", text)
    text = re.sub(r"^[/ ]*사진\s*/\s*[^ ]{1,20}\s*", "", text)
    return clean_summary_text(text)


def split_summary_sentences(value: str) -> list[str]:
    text = clean_summary_text(value)
    if not text:
        return []
    text = re.sub(r"([.!?。])\s*", r"\1|", text)
    text = re.sub(
        r"(다|했다|밝혔다|전망했다|설명했다|진단했다|분석했다|마무리했다|참여한다고)\s+",
        r"\1.|",
        text,
    )
    return [
        sentence.strip(" .")
        for sentence in text.split("|")
        if len(sentence.strip()) >= 18 and not is_broken_summary_fragment(sentence)
    ][:3]


def is_caption_like_summary(value: str) -> bool:
    text = clean_summary_text(value)
    if not text:
        return True
    caption_patterns = [
        r"사옥\s*전경",
        r"본사\s*전경",
        r"건물\s*외관",
        r"사진\s*=",
        r"제공\s*=",
        r"자료\s*사진",
        r"이미지",
        r"기념\s*촬영",
        r"로고",
    ]
    if re.match(r"^[\[/ ]*(?:사진|제공)\s*=", text):
        return True
    if any(re.search(pattern, text, re.I) for pattern in caption_patterns) and len(text) <= 80:
        return True
    if len(text) < 18 and not re.search(r"(인수|실적|검사|점검|제재|승인|협약|출시|선정|상승|하락)", text):
        return True
    return False


def is_broken_summary_fragment(value: str) -> bool:
    text = clean_summary_text(value)
    stem = re.sub(r"[.!?。]+$", "", text).strip()
    return bool(
        re.fullmatch(r"(강력히|적극적으로|지속적으로|본격적으로|확대|강화|추진|확인|필요)", text)
        or re.search(r"(강력히|적극적으로|지속적으로|본격적으로)$", text)
        or (len(text) < 8 and not re.search(r"\d", text))
        or text.endswith(("고", "며", "또한", "통해", "위해"))
        or re.search(r"(을|를|에|의|과|와|로|으로|에게|에서|부터|까지|보다|처럼)$", stem)
        or (not re.search(r"[.!?。]$|다$|요$|임$|함$|필요$", text) and text.endswith(("에", "을", "를", "의", "과", "와", "로", "으로")))
        or re.search(r"전망했\s*또한|밝혔\s*또한|한다고\s*\d{1,2}일?$", text)
        or len(text) > 230
    )


def title_based_summary(article: dict, title: str) -> str:
    description = strip_caption_prefix(clean_summary_text(article.get("description", "") or article.get("summary", "")))
    text = f"{title} {description} {article.get('keyword', '')}"
    category = article.get("_category") or article.get("category") or "other"
    tone = article.get("_tone") or article.get("tone") or "neutral"
    actor = extract_primary_entity(text)

    complaint_summary = consumer_complaint_summary(article, title, description)
    if complaint_summary:
        return complaint_summary
    if re.search(r"공공\s*마이데이터|장기보상|보험금\s*청구", text):
        subject = actor or "보험사"
        return (
            f"{subject}이 공공 마이데이터를 보험금 청구·장기보상 업무에 연계한 서비스 사례입니다. "
            "고객 서류 제출 부담을 낮추고 보상 처리 효율을 높이는 보험사 디지털 전환 흐름으로 볼 수 있습니다."
        )
    if re.search(r"해외|인수|M&A|포테그라|글로벌", text, re.I) and re.search(r"보험|손보|생보", text):
        subject = actor or "보험업계"
        return (
            f"{subject}의 해외 사업 확대와 보험사 인수 흐름을 다룬 기사입니다. "
            "국내 보험시장 성장 정체와 IFRS17 이후 수익성 중심 경쟁 속에서 수익원 다변화 필요성이 함께 제기됩니다."
        )
    if re.search(r"금감원|금융감독원|금융위|금융위원회|제재|검사|점검|승인|경영개선", text):
        return (
            f"{actor or '금융당국'} 관련 감독·정책 이슈를 다룬 기사입니다. "
            "당사 직접 이슈인지 업계 공통 관리 신호인지 분리해 확인할 필요가 있습니다."
        )
    if re.search(r"실적|마감|매출|순이익|영업익|역성장|감소|증가|성장", text):
        return (
            f"{actor or '보험·GA 업계'}의 실적과 영업 흐름을 다룬 기사입니다. "
            "시장 점유, 생산성, 성장 둔화 여부를 당사 영향과 비교해 볼 필요가 있습니다."
        )
    if re.search(r"브랜드평판|평판|1위|순위|선정|수상", text):
        return (
            f"{actor or '보험·GA 업계'}의 평판·순위성 보도입니다. "
            "홍보 활용 가능성과 경쟁사 동시 노출 여부를 함께 확인합니다."
        )
    if category == "own":
        return (
            f"{actor or '당사'} 직접 언급 기사입니다. "
            "평판 영향, 사실관계, 후속 보도 가능성을 우선 확인합니다."
        )
    if category == "regulation":
        return "보험·GA 관련 정책 또는 감독 이슈입니다. 영업 환경과 소비자 보호 기준 변화 가능성을 확인합니다."
    if tone == "caution":
        return "직접 부정은 아니지만 시장성·규제성 신호가 있는 기사입니다. 반복 노출 여부와 당사 관련성을 분리해 봅니다."
    return headline_based_summary(title)


def headline_based_summary(title: str) -> str:
    cleaned = clean_summary_text(re.sub(r"\s+-\s+[^-]{2,24}$", "", title or ""))
    if not cleaned:
        return ""
    return limit_summary(f"{cleaned} 기사입니다.")


def consumer_complaint_summary(article: dict, title: str, description: str = "") -> str:
    text = f"{title} {description} {article.get('keyword', '')}"
    if not re.search(r"소비자\s*민원|민원평가|민원\s*점유율|민원\s*건수|불만\s*건수|분쟁", text):
        return ""
    actor = extract_primary_entity(text) or "손해보험사"
    ranking = ""
    if re.search(r"2년\s*연속\s*1위", text):
        ranking = "2년 연속 1위로 언급됐습니다"
    elif re.search(r"1위", text):
        ranking = "1위로 언급됐습니다"
    elif re.search(r"상위|빅5|집중|점유율", text):
        ranking = "민원 비중 상위권으로 언급됐습니다"
    else:
        ranking = "소비자 민원 지표에 언급됐습니다"
    return limit_summary(
        f"{actor}{topic_particle(actor)} 손해보험 소비자 민원 평가에서 민원 점유율이 높은 회사로 {ranking}. "
        "여기서 순위는 우호 성과가 아니라 민원·불만 집중도 의미이므로 소비자보호 리스크 흐름으로 봐야 합니다."
    )


def topic_particle(value: str) -> str:
    if not value:
        return "은"
    last = value[-1]
    if "가" <= last <= "힣":
        return "은" if (ord(last) - ord("가")) % 28 else "는"
    return "은"


def extract_primary_entity(text: str) -> str:
    candidates = OWN_NAMES + COMPETITOR_WORDS
    for name in candidates:
        if name in text:
            return name
    match = re.search(r"([가-힣A-Za-z0-9]+(?:손해보험|손보|생명|화재|금융서비스|보험))", text)
    return match.group(1) if match else ""


def limit_summary(value: str, limit: int = 210) -> str:
    text = clean_summary_text(value)
    if is_broken_summary_fragment(text):
        return ""
    if len(text) <= limit:
        return ensure_summary_sentence(text)
    cut = text[:limit].rsplit(" ", 1)[0]
    cut = cut.rstrip(" ,·")
    if is_broken_summary_fragment(cut):
        return ""
    return ensure_summary_sentence(cut)


def ensure_summary_sentence(value: str) -> str:
    text = clean_summary_text(value)
    if not text:
        return ""
    return text if re.search(r"[.!?。]$", text) else f"{text}."


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
    if any(keyword in text for keyword in REGULATION_WORDS) and has_domain_context(text):
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
    if any(word in text for word in INDUSTRY_WORDS):
        return True
    if contains_unambiguous_competitor_word(text):
        return True
    if any(word in text for word in INSURANCE_DOMAIN_CONTEXT_WORDS):
        return True
    return False


def contains_unambiguous_competitor_word(text: str) -> bool:
    for keyword in COMPETITOR_WORDS:
        if keyword in AMBIGUOUS_COMPETITOR_WORDS:
            continue
        if keyword in text:
            return True
    return False


def has_material_business_context(text: str) -> bool:
    return any(word in text for word in MATERIAL_BUSINESS_CONTEXT_WORDS)


def is_non_business_noise(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    title = article.get("title", "")
    if not text.strip():
        return True
    if is_sports_marketing_noise(article):
        return True
    has_photo_sports_signal = any(word in title or word in text for word in PHOTO_SPORTS_NOISE_WORDS)
    has_material_signal = any(word in text for word in MATERIAL_CAUTION_CONTEXT_WORDS) or any(name in text for name in OWN_NAMES)
    if has_photo_sports_signal and not has_material_signal:
        return True
    return False


def is_sports_marketing_noise(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "") + " " + article.get("keyword", "")
    if any(name in text for name in OWN_NAMES):
        return False
    if not any(word in text for word in SPORTS_MARKETING_NOISE_WORDS):
        return False
    if any(word in text for word in SPORTS_BUSINESS_KEEP_WORDS):
        return False
    sports_context = bool(re.search(r"스포츠|배구|농구|야구|축구|골프|구단|선수|리그|시구|후원|스폰서", text, re.I))
    insurance_context = bool(re.search(r"보험|손보|생보|화재|생명", text))
    return sports_context and insurance_context


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
    if is_investment_downgrade_article(article) or is_stock_decline_article(article):
        return "caution"
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
