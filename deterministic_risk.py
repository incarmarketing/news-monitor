"""Deterministic, source-only classifier for direct Incar risk alerts.

The alert path deliberately favors precision over recall.  An article is an
alert only when original source text binds the company to a concrete risk
event in the same sentence.  Search keywords, generated summaries, cached AI
output, and provider confidence are never accepted as evidence.
"""

from __future__ import annotations

import html
import re
from typing import Any, Iterable


OWN_PATTERN = re.compile(
    r"(?:인카금융서비스|인카금융|(?<![0-9A-Za-z가-힣])인카(?![0-9A-Za-z가-힣]))",
    re.I,
)

INCIDENTAL_PATTERN = re.compile(
    r"(?:인카금융서비스|인카금융).{0,80}(?:출신|거쳐|역임|근무|퇴직|경력)|"
    r"(?:출신|거쳐|역임|근무|퇴직|경력).{0,80}(?:인카금융서비스|인카금융)",
    re.I,
)

EVENT_PATTERNS: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    (
        "sanction",
        "risk_alert_sanction",
        re.compile(
            r"제재|처분|등록(?:을)?\s*취소|업무(?:를)?\s*정지|기관\s*(?:주의|경고)|"
            r"과징금|과태료|시정\s*명령|영업(?:을)?\s*정지",
            re.I,
        ),
    ),
    (
        "fraud",
        "risk_alert_fraud",
        re.compile(
            r"보험\s*사기|사기|편취|횡령|배임|고의\s*사고|허위\s*(?:계약|입원|서류)|"
            r"가공\s*계약|불법\s*사채|사채\s*놀이|보험\s*꺾기|약탈\s*영업",
            re.I,
        ),
    ),
    (
        "consumer_harm",
        "risk_alert_consumer_harm",
        re.compile(
            r"소비자\s*피해|불완전\s*판매|부당\s*승환|보장\s*공백|민원\s*(?:급증|증가)|"
            r"고객\s*(?:정보|DB)\s*(?:유출|무단|침해)",
            re.I,
        ),
    ),
    (
        "legal",
        "risk_alert_legal",
        re.compile(
            r"압수\s*수색|기소|구속|입건|고발|검찰\s*송치|경찰\s*수사|"
            r"소송\s*(?:제기|패소)|수사\s*착수",
            re.I,
        ),
    ),
    (
        "governance",
        "risk_alert_governance",
        re.compile(
            r"내부\s*통제\s*(?:부실|실패|구멍)|관리\s*(?:부실|구멍|소홀)|"
            r"관리\s*책임|영업\s*관리\s*부실|모집\s*질서\s*위반",
            re.I,
        ),
    ),
    (
        "reputational",
        "risk_alert_reputational",
        re.compile(
            r"스캔들|약탈\s*영업|불법\s*영업|그늘|과제\s*직면|도덕적\s*해이|"
            r"평판\s*훼손|신뢰\s*추락|막차\s*리크루팅|영입\s*경쟁\s*과열|"
            r"정착지원금.{0,35}(?:급증|과열|논란)|관리\s*부실\s*논란|"
            r"수만\s*늘렸나|외형\s*성장\s*뒤",
            re.I,
        ),
    ),
)

REVIEW_PATTERN = re.compile(
    r"점검|검사|조사|논란|의혹|우려|경고|주시|모니터링|전격\s*점검|"
    r"정착지원금|1200%|판매\s*수수료|내부\s*통제|근로자성|리스크",
    re.I,
)

NEGATION_PATTERN = re.compile(
    r"혐의\s*(?:없음|없다)|문제\s*(?:없음|없다)|피해\s*(?:없음|없다|미발생)|"
    r"위반\s*(?:아님|아니다)|제재\s*(?:아님|대상\s*아님)|사실\s*무근|"
    r"무관|해당\s*없음|오보|정정\s*보도|예방|방지|대응\s*강화|"
    r"보안\s*강화|회원사\s*가입|업무\s*협약",
    re.I,
)

ROUTINE_STATISTICS_PATTERN = re.compile(
    r"(?:\d{1,2}월|상반기|하반기|분기).{0,60}(?:GA|보험).{0,80}"
    r"(?:실적|M/S|점유율|매출|순위|판매)|"
    r"(?:GA|보험).{0,60}(?:실적|M/S|점유율|매출|순위).{0,60}(?:\d{1,2}월|상반기|하반기|분기)",
    re.I,
)

BRAND_REPUTATION_PATTERN = re.compile(r"브랜드\s*평판", re.I)
BRAND_FIRST_PATTERN = re.compile(
    r"(?:1위\s*(?:는|에)?\s*(?:인카금융서비스|인카금융)|"
    r"(?:인카금융서비스|인카금융).{0,45}(?:1위|선두|정상|최고))",
    re.I,
)
CERTIFIED_AGENT_PATTERN = re.compile(r"우수\s*인증\s*설계사", re.I)
CERTIFIED_POSITIVE_PATTERN = re.compile(
    r"선정|배출|인터뷰|최다|증가|성과|인증|규모|실적|지점장",
    re.I,
)
POSITIVE_PERFORMANCE_PATTERN = re.compile(
    r"호실적|양호한\s*실적|매출\s*(?:증가|급증|회복)|실적\s*(?:증가|개선|반등)|"
    r"역대\s*최대|최대\s*실적|1위|최다|수상|선정|배출|돌파|성장|회복|업계\s*최다",
    re.I,
)
POSITIVE_RISK_EXCEPTION_PATTERN = re.compile(
    r"자격\s*취소|허위|제재|처분|사기|피해|부실|위반|논란|의혹|고발|압수\s*수색",
    re.I,
)
SPONSORSHIP_PATTERN = re.compile(
    r"인카금융(?:서비스)?\s*(?:더헤븐|마스터즈|클래식)|KLPGA|골프\s*대회|후원\s*대회",
    re.I,
)
PREVENTIVE_SECURITY_PATTERN = re.compile(
    r"금융보안원.{0,80}(?:가입|회원사|협약)|(?:가입|회원사|협약).{0,80}금융보안원|"
    r"보안\s*(?:체계|역량)\s*강화|취약점\s*점검|예방\s*훈련",
    re.I,
)
RELIEF_SUPPORT_PATTERN = re.compile(r"피해\s*(?:지원|구제)|성금|기부|후원|사회\s*공헌", re.I)
MARKET_ONLY_PATTERN = re.compile(
    r"주가|52주\s*최저가|목표가|투자\s*의견|시가\s*총액|거래량|VI\s*발동",
    re.I,
)
PEER_LIST_PATTERN = re.compile(
    r"상위\s*\d+\s*(?:개|사)?\s*GA|(?:한화생명금융서비스|지에이코리아|글로벌금융판매|"
    r"메가금융서비스|에이플러스에셋).{0,100}(?:인카금융서비스|인카금융)|"
    r"(?:인카금융서비스|인카금융).{0,100}(?:한화생명금융서비스|지에이코리아|"
    r"글로벌금융판매|메가금융서비스|에이플러스에셋)",
    re.I,
)

PERFORMANCE_DISCLOSURE_TITLE_PATTERN = re.compile(
    r"(?:매출|영업\s*이익|순이익|실적|설계사).{0,60}"
    r"(?:역대\s*최대|최대\s*실적|증가|급증|성장|개선|회복|돌파)|"
    r"(?:역대\s*최대|최대\s*실적|호실적).{0,60}"
    r"(?:매출|영업\s*이익|순이익|실적|설계사)",
    re.I,
)
HISTORICAL_ONE_OFF_COST_PATTERN = re.compile(
    r"(?:20\d{2}년|지난해|전년|과거).{0,180}"
    r"(?:정기\s*검사|검사\s*결과|과태료\s*납부|과징금\s*납부|제재\s*비용).{0,220}"
    r"(?:일회성\s*(?:비용|요인)|실적에\s*반영|비용으로\s*반영)",
    re.I,
)
FRESH_ENFORCEMENT_ACTION_PATTERN = re.compile(
    r"(?:과태료|과징금|제재|처분).{0,45}"
    r"(?:부과|통보|결정|확정|착수|적발|확인)|"
    r"(?:부과|통보|결정|확정|착수|적발).{0,45}"
    r"(?:과태료|과징금|제재|처분)",
    re.I,
)

_context_rules: list[dict[str, Any]] = []


def configure_rules(rows: Iterable[dict[str, Any]] | None) -> None:
    """Load editable DB policy terms used as deterministic extensions."""
    global _context_rules
    _context_rules = [dict(row) for row in rows or [] if isinstance(row, dict)]


def _clean_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def source_values(article: dict[str, Any]) -> list[str]:
    """Return unique source fields; never include keyword, summary, or AI output."""
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    values: list[str] = []
    seen: set[str] = set()
    for value in (
        article.get("title"),
        article.get("description"),
        article.get("content"),
        article.get("body"),
        raw.get("title"),
        raw.get("description"),
        raw.get("content"),
        raw.get("body"),
    ):
        cleaned = _clean_text(value)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            values.append(cleaned)
    return values


def source_text(article: dict[str, Any]) -> str:
    return " ".join(source_values(article))


def source_sentences(article: dict[str, Any]) -> list[str]:
    sentences: list[str] = []
    seen: set[str] = set()
    for value in source_values(article):
        for sentence in re.split(r"(?<=[.!?。！？])\s+|[\r\n]+", value):
            cleaned = _clean_text(sentence)
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                sentences.append(cleaned)
    return sentences


def contains_own_source(article: dict[str, Any]) -> bool:
    return bool(OWN_PATTERN.search(source_text(article)))


def _title(article: dict[str, Any]) -> str:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    return _clean_text(article.get("title") or raw.get("title"))


def _source_leads(article: dict[str, Any]) -> list[str]:
    """Return original body leads without title, keyword, or generated text."""
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    leads: list[str] = []
    seen: set[str] = set()
    for value in (
        article.get("description"),
        article.get("content"),
        article.get("body"),
        raw.get("description"),
        raw.get("content"),
        raw.get("body"),
    ):
        cleaned = _clean_text(value)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            leads.append(cleaned[:500])
    return leads


def _own_is_primary_subject(article: dict[str, Any]) -> bool:
    """Recognize the company as a grammatical subject in the title or source lead."""
    title = _title(article)
    if OWN_PATTERN.search(title):
        return True

    for lead in _source_leads(article):
        first_sentence = re.split(r"(?<=[.!?。！？])\s+|[\r\n]+", lead, maxsplit=1)[0]
        if INCIDENTAL_PATTERN.search(first_sentence):
            continue
        if re.search(
            r"^(?:\[[^\]]{1,60}\]\s*)?"
            r"(?:인카금융서비스|인카금융)(?:은|는|이|가|의|에서|도|측|\s)",
            first_sentence,
            re.I,
        ):
            return True
        if re.search(
            r"(?:인카금융서비스|인카금융)(?:은|는|이|가)\s*.{0,180}"
            r"(?:밝혔|발표했|기록했|선정됐|선정되|수상했|배출했|증가했|성장했|"
            r"개선했|강화했|가입했|체결했|출시했|마감했|회복했|유지했|"
            r"하락했|감소했|낮아졌|상향됐|하향됐)",
            first_sentence,
            re.I,
        ):
            return True
    return False


def _infer_own_role(article: dict[str, Any], *, own_mentioned: bool | None = None) -> str:
    if own_mentioned is None:
        own_mentioned = contains_own_source(article)
    if not own_mentioned:
        return "absent"
    if INCIDENTAL_PATTERN.search(source_text(article)) and not OWN_PATTERN.search(_title(article)):
        return "incidental"
    return "primary" if _own_is_primary_subject(article) else "secondary"


def _positive_document_override(article: dict[str, Any]) -> tuple[str, str] | None:
    title = _title(article)
    text = source_text(article)
    if not OWN_PATTERN.search(text):
        return None
    if ROUTINE_STATISTICS_PATTERN.search(text) and not POSITIVE_RISK_EXCEPTION_PATTERN.search(title):
        return "routine_statistics", "neutral"
    if BRAND_REPUTATION_PATTERN.search(text) and BRAND_FIRST_PATTERN.search(text):
        return "brand_reputation", "positive"
    if (
        CERTIFIED_AGENT_PATTERN.search(text)
        and CERTIFIED_POSITIVE_PATTERN.search(text)
        and not POSITIVE_RISK_EXCEPTION_PATTERN.search(text)
    ):
        return "certified_agent", "positive"
    if SPONSORSHIP_PATTERN.search(text) and not POSITIVE_RISK_EXCEPTION_PATTERN.search(text):
        return "sponsorship", "neutral"
    if PREVENTIVE_SECURITY_PATTERN.search(text) and not re.search(r"(?:인카금융서비스|인카금융).{0,80}(?:유출|해킹\s*발생|침해\s*사고)", text, re.I):
        return "industry_news", "neutral"
    if RELIEF_SUPPORT_PATTERN.search(text) and not re.search(r"(?:인카금융서비스|인카금융).{0,80}(?:가해|위반|제재)", text, re.I):
        return "industry_news", "neutral"
    if (
        OWN_PATTERN.search(title)
        and POSITIVE_PERFORMANCE_PATTERN.search(title)
        and not POSITIVE_RISK_EXCEPTION_PATTERN.search(title)
        and not any(pattern.search(title) for _event, _key, pattern in EVENT_PATTERNS)
    ):
        return "industry_news", "positive"
    return None


def _db_suppression(article: dict[str, Any]) -> tuple[str, str] | None:
    text = source_text(article)
    for rule in sorted(_context_rules, key=lambda item: int(item.get("priority") or 100)):
        decision = str(rule.get("decision") or "")
        if decision not in {
            "suppress_negative_alert",
            "exclude_from_alert",
        }:
            continue
        triggers = [str(term) for term in rule.get("trigger_terms") or [] if str(term)]
        required = [str(term) for term in rule.get("required_terms") or [] if str(term)]
        excludes = [str(term) for term in rule.get("exclude_terms") or [] if str(term)]
        trigger_matches = [term in text for term in triggers]
        required_matches = [term in text for term in required]
        if triggers and (
            not all(trigger_matches)
            if str(rule.get("trigger_mode") or "any") == "all"
            else not any(trigger_matches)
        ):
            continue
        if required and (
            not all(required_matches)
            if str(rule.get("required_mode") or "any") == "all"
            else not any(required_matches)
        ):
            continue
        if excludes and any(term in text for term in excludes):
            continue
        return str(rule.get("rule_key") or "db_guardrail"), decision or "guardrail"
    return None


def _is_peer_list(sentence: str) -> bool:
    if not PEER_LIST_PATTERN.search(sentence):
        return False
    direct_subject = re.search(
        r"(?:인카금융서비스|인카금융)(?:의|는|가|에서|소속|\s+전직).{0,90}"
        r"(?:제재|처분|등록(?:을)?\s*취소|업무(?:를)?\s*정지|사기|편취|횡령|배임|압수\s*수색|"
        r"내부\s*통제\s*부실|관리\s*(?:부실|구멍))",
        sentence,
        re.I,
    )
    return not bool(direct_subject)


def _event_in_sentence(sentence: str) -> tuple[str, str, re.Match[str]] | None:
    for rule in sorted(_context_rules, key=lambda item: int(item.get("priority") or 100)):
        if str(rule.get("decision") or "") != "alert_direct_own_risk":
            continue
        terms = [str(term).strip() for term in rule.get("trigger_terms") or [] if str(term).strip()]
        required = [str(term).strip() for term in rule.get("required_terms") or [] if str(term).strip()]
        excludes = [str(term).strip() for term in rule.get("exclude_terms") or [] if str(term).strip()]
        matches = [re.search(re.escape(term), sentence, re.I) for term in terms]
        trigger_mode = str(rule.get("trigger_mode") or "any")
        trigger_ok = bool(matches) and (all(matches) if trigger_mode == "all" else any(matches))
        required_matches = [re.search(re.escape(term), sentence, re.I) for term in required]
        required_mode = str(rule.get("required_mode") or "any")
        required_ok = not required or (
            all(required_matches) if required_mode == "all" else any(required_matches)
        )
        if not trigger_ok or not required_ok or any(re.search(re.escape(term), sentence, re.I) for term in excludes):
            continue
        match = next((item for item in matches if item), None)
        if match:
            group = str(rule.get("rule_group") or "")
            event_type = group.partition(":")[2] or "reputational"
            if event_type not in {
                "sanction",
                "fraud",
                "consumer_harm",
                "legal",
                "governance",
                "reputational",
            }:
                event_type = "reputational"
            return event_type, str(rule.get("rule_key") or "db_risk_alert"), match
    for event_type, rule_key, pattern in EVENT_PATTERNS:
        match = pattern.search(sentence)
        if match:
            return event_type, rule_key, match
    return None


def _is_historical_one_off_performance_disclosure(
    article: dict[str, Any],
    sentence: str,
) -> bool:
    """Ignore old one-off cost explanations inside a positive earnings article.

    This guardrail is intentionally narrow. A newly imposed or announced
    sanction must still alert even when the article also discusses earnings.
    """
    title = _title(article)
    if not PERFORMANCE_DISCLOSURE_TITLE_PATTERN.search(title):
        return False
    if any(pattern.search(title) for _event, _key, pattern in EVENT_PATTERNS):
        return False
    if not HISTORICAL_ONE_OFF_COST_PATTERN.search(sentence):
        return False
    return not FRESH_ENFORCEMENT_ACTION_PATTERN.search(sentence)


def _is_direct_binding(sentence: str, event_match: re.Match[str], *, is_title: bool) -> bool:
    own_matches = list(OWN_PATTERN.finditer(sentence))
    if not own_matches:
        return False
    if _is_peer_list(sentence):
        return False
    if NEGATION_PATTERN.search(sentence):
        return False

    for own_match in own_matches:
        distance = min(
            abs(event_match.start() - own_match.end()),
            abs(own_match.start() - event_match.end()),
        )
        if distance <= (180 if is_title else 120):
            return True

    if is_title:
        return True
    return bool(
        re.search(
            r"(?:금감원|금융감독원|금융당국|경찰|검찰).{0,100}"
            r"(?:인카금융서비스|인카금융).{0,140}"
            r"(?:제재|처분|등록(?:을)?\s*취소|업무(?:를)?\s*정지|고발|압수\s*수색|기소)",
            sentence,
            re.I,
        )
    )


def classify(article: dict[str, Any]) -> dict[str, Any]:
    """Return the deterministic risk decision contract for one article."""
    text = source_text(article)
    title = _title(article)
    own_mentioned = bool(OWN_PATTERN.search(text))
    inferred_role = _infer_own_role(article, own_mentioned=own_mentioned)
    base = {
        "own_mentioned": own_mentioned,
        "own_role": inferred_role,
        "document_type": "other",
        "risk_event_type": "none",
        "alert_eligible": False,
        "review_required": False,
        "confidence": 1.0 if not own_mentioned else 0.9,
        "evidence": "",
        "matched_rule_keys": [],
        "suggested_tone": "neutral",
        "negative_target": "none",
        "decision": "no_alert",
    }
    if not own_mentioned:
        return base

    if INCIDENTAL_PATTERN.search(text) and not OWN_PATTERN.search(title):
        base.update(
            own_role="incidental",
            document_type="company_profile",
            confidence=0.995,
            decision="incidental_reference",
        )
        return base

    sentences = source_sentences(article)
    historical_disclosure_suppressed = False
    for sentence in sentences:
        event = _event_in_sentence(sentence)
        if not event or not OWN_PATTERN.search(sentence):
            continue
        event_type, rule_key, event_match = event
        if _is_direct_binding(sentence, event_match, is_title=sentence == title):
            if _is_historical_one_off_performance_disclosure(article, sentence):
                historical_disclosure_suppressed = True
                continue
            base.update(
                own_role="primary",
                document_type="risk_event",
                risk_event_type=event_type,
                alert_eligible=True,
                confidence=0.995,
                evidence=sentence[:500],
                matched_rule_keys=[rule_key, "same_sentence_actor_event_binding"],
                suggested_tone="negative",
                negative_target="own",
                decision="alert",
            )
            return base

    positive_override = _positive_document_override(article)
    if positive_override:
        document_type, tone = positive_override
        matched_rule_keys = [f"guardrail_{document_type}"]
        if historical_disclosure_suppressed:
            matched_rule_keys.append("guardrail_historical_one_off_performance_disclosure")
        base.update(
            own_role=inferred_role,
            document_type=document_type,
            confidence=0.995,
            suggested_tone=tone,
            decision="positive_or_routine_guardrail",
            matched_rule_keys=matched_rule_keys,
        )
        return base


    if historical_disclosure_suppressed:
        base.update(
            own_role=inferred_role,
            document_type="industry_news",
            confidence=0.995,
            decision="positive_or_routine_guardrail",
            matched_rule_keys=["guardrail_historical_one_off_performance_disclosure"],
        )
        return base

    db_suppression = _db_suppression(article)
    if db_suppression:
        rule_key, decision = db_suppression
        base.update(
            own_role=inferred_role,
            confidence=0.995,
            decision=decision,
            matched_rule_keys=[rule_key],
        )
        return base

    own_sentences = [sentence for sentence in sentences if OWN_PATTERN.search(sentence)]
    review_sentence = next(
        (
            sentence
            for sentence in own_sentences
            if REVIEW_PATTERN.search(sentence) and not NEGATION_PATTERN.search(sentence)
        ),
        "",
    )
    unbound_event = next(
        (
            sentence
            for sentence in own_sentences
            if _event_in_sentence(sentence) and not NEGATION_PATTERN.search(sentence)
        ),
        "",
    )
    if review_sentence or unbound_event:
        evidence = review_sentence or unbound_event
        event = _event_in_sentence(evidence)
        base.update(
            own_role=inferred_role,
            document_type="risk_event" if event else "regulatory",
            risk_event_type=event[0] if event else "none",
            review_required=True,
            confidence=0.8,
            evidence=evidence[:500],
            matched_rule_keys=["ambiguous_own_risk_review"],
            suggested_tone="caution",
            decision="review",
        )
        return base

    if MARKET_ONLY_PATTERN.search(text):
        base.update(
            own_role=inferred_role,
            document_type="industry_news",
            risk_event_type="market",
            confidence=0.98,
            suggested_tone="caution",
            decision="market_caution",
        )
        return base

    base.update(
        own_role=inferred_role,
        document_type="industry_news",
        confidence=0.95,
    )
    return base
