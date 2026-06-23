"""Score, classify, cluster, and summarize news articles before AI analysis."""

from __future__ import annotations

import difflib
import json
import re
from collections import Counter


OWN_NAMES = ["인카금융", "인카금융서비스"]
SHORT_INCAR_PATTERN = re.compile(r"(?<![0-9A-Za-z가-힣])인카(?![0-9A-Za-z가-힣])", re.I)

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

PREVENTIVE_SECURITY_WORDS = [
    "예방", "사전예방", "사전 예방", "보완", "보안 강화", "보안 체계",
    "보안 역량", "취약점 점검", "가입", "회원사", "대응훈련",
]

SECURITY_RISK_WORDS = [
    "해킹", "침해", "정보보안", "개인정보", "고객정보", "금융보안원",
    "보안", "사이버", "취약점",
]

DIRECT_SECURITY_INCIDENT_WORDS = [
    "유출", "발생", "확인", "다크웹", "피해 확산", "사고 발생", "해킹 발생",
    "해킹당", "침해사고 발생", "개인정보 유출", "고객정보 유출",
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
    "사회공헌", "기부", "후원", "지원", "협약", "최다", "우수", "인증",
    "배출", "완전판매", "전문성", "성과", "선도", "기록",
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

STOCK_LISTING_NOISE_TITLE_WORDS = [
    "52주 최저가", "52주 최고가", "장중 신저가", "장중 신고가",
    "강세 토픽", "약세 토픽", "특징주", "오전 이슈 [보험]",
]

POSITIVE_RANKING_WORDS = ["브랜드평판", "1위", "수상", "선정", "최고", "선두", "최다"]

PHOTO_SPORTS_NOISE_WORDS = [
    "포토", "화보", "갤러리", "골프", "여자오픈", "오픈", "라운드", "최종라운드",
    "1번홀", "홀에서", "리조트", "파72", "우승상금", "순위를 올린다",
    "프로야구", "프로농구", "프로배구", "KBO", "키움 감독", "두산", "마무리 투수",
    "더블 스토퍼", "선발투수", "타자", "홈런", "연패", "승리투수",
]

OWN_SPONSORED_SPORTS_TRIGGERS = [
    "인카금융 더헤븐 마스터즈", "인카금융 더 헤븐 마스터즈", "인카금융서비스 더헤븐 마스터즈",
    "인카금융 더 헤븐", "인카금융 더헤븐", "더헤븐CC", "더 헤븐",
    "KLPGA", "골프", "라운드", "티샷", "버디", "이글", "스윙", "선두", "공동", "순위",
    "우승", "상금", "홀", "언더파", "타수", "선수",
]

OWN_SPONSORED_SPORTS_KEEP_TERMS = [
    "기부", "확정형 기부", "사회공헌", "브랜드", "협약", "인카금융서비스가",
    "인카금융서비스는", "인카금융이", "인카금융은", "홍보", "마케팅", "ESG",
]

OWN_SPONSORED_SPORTS_TITLE_KEEP_TERMS = OWN_SPONSORED_SPORTS_KEEP_TERMS + ["후원", "스폰서", "주최"]

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

SHORT_INCAR_BUSINESS_CONTEXT_WORDS = [
    "보험", "보험사", "생명보험", "손해보험", "보험대리점", "법인보험대리점",
    "GA", "보험GA", "설계사", "보험설계사", "금융서비스", "금감원",
    "금융감독원", "금융위", "금융위원회", "수수료", "정착지원금",
    "불완전판매", "부당승환", "브랜드평판", "우수인증설계사", "실적",
    "매출", "순익", "공시", "코스닥", "주가", "증권",
]

SHORT_INCAR_NOISE_WORDS = [
    "인카 게이밍", "인카게이밍", "in-car", "메르세데스", "벤츠", "Mercedes",
    "Mercedes pay", "메르세데스 페이", "차량 구매", "차량 결제", "내비게이션",
    "내비", "인포테인먼트", "모빌리티", "커넥티드카", "오토 차이나",
    "오비고", "NHN KCP", "현대차", "기아", "카&테크", "SBA",
    "후보 명단", "기초단체장 후보", "병역필", "전과", "프로볼링", "KPBA",
    "인카제국", "잉카", "마추픽추", "페루", "남미", "쿠스코", "안데스",
    "유적", "문명", "관광", "여행",
]

SALES_CONDUCT_TRIGGER_WORDS = [
    "1200%", "1200％", "1200% 룰", "1200%룰", "판매수수료", "모집수수료",
    "정착지원금", "부당승환", "승환계약", "설계사 영입", "스카우트 경쟁",
]

SALES_CONDUCT_REQUIRED_CONTEXT_WORDS = [
    "보험", "보험사", "생명보험", "손해보험", "보험대리점", "법인보험대리점",
    "GA", "보험GA", "보험설계사", "설계사", "보험모집인", "보험계약",
    "금감원", "금융감독원", "금융위", "금융위원회", "보험업법",
]

SALES_CONDUCT_NOISE_WORDS = [
    "수익률", "주식", "증권", "코스피", "코스닥", "SK하이닉스", "하이닉스",
    "삼성전자", "반도체", "제약바이오", "바이오", "신세계", "백화점",
    "가구", "유튜브", "숭실대", "대학생", "IPO", "공모주", "코인",
]

EXTERNAL_INSURANCE_NOISE_TRIGGERS = [
    "호르무즈", "호르무즈 해협", "이란", "통항", "선박", "해운", "유조선",
    "해협", "중동", "원유", "해상 통항", "해상", "항만", "항구", "화물", "물류",
    "운임", "항공", "항로",
]

EXTERNAL_INSURANCE_NOISE_TERMS = [
    "보험 수수료", "보험수수료", "보험증권", "보험 증권", "통항 수수료",
    "수수료 부과", "보험료", "보험료 부과", "보험사", "보험 가입 의무",
    "유료 보험", "보험 의무화", "통항료", "보험 제공", "보험 업계",
]

EXTERNAL_INSURANCE_KEEP_TERMS = [
    "보험대리점", "법인보험대리점", "보험설계사",
    "GA", "인카금융", "금융감독원", "금감원", "금융위원회", "금융위",
    "보험업법", "불완전판매", "보험사기", "실손", "손해율", "보험금 지급",
    "보험계약", "정착지원금", "1200%",
]

GENERAL_FINANCE_NOISE_RE = re.compile(
    r"한양증권|중앙일보|하나은행|어음|최종부도|부도\s*처리|워크아웃|환율|외환시장|코스피|코스닥|사이드카|채권시장|증권사",
    re.I,
)
NON_INSURANCE_FINANCE_DISCLOSURE_NOISE_RE = re.compile(
    r"두나무|업비트|빗썸|코인원|코빗|가상자산|가상화폐|암호화폐|코인거래소|디지털자산|핀테크|전자금융|PG사|결제대행|전자공시시스템|DART|공시시스템",
    re.I,
)
NON_INSURANCE_FINANCE_DISCLOSURE_CONTEXT_RE = re.compile(
    r"금융감독원\s*전자공시시스템|전자공시시스템|DART|연결\s*기준\s*매출|영업이익|순이익|거래\s*급감|수수료\s*장사|가상자산|코인",
    re.I,
)
INSURANCE_GA_BUSINESS_KEEP_RE = re.compile(
    r"인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|보험GA|GA|보험업법|불완전판매|보험사기|실손|손해율|1200%|정착지원금|부당승환|승환계약|판매수수료",
    re.I,
)
INSURANCE_GA_KEEP_RE = re.compile(
    r"인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원|금융위|금융위원회|금융소비자보호",
    re.I,
)
ADMIN_AGENCY_NOISE_RE = re.compile(
    r"선관위|선거관리위원회|정부\s*위원회|위원회\s*수당|셀프증액|공공기관\s*경영평가|금융\s*공공기관\s*경영평가|예금보험공사|주택금융공사|주금공|신용보증기금|신보",
    re.I,
)
INSURANCE_GA_MATERIAL_KEEP_RE = re.compile(
    r"인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원",
    re.I,
)
PUBLIC_HEALTH_INSURANCE_NOISE_RE = re.compile(
    r"국민건강보험공단|건강보험공단|복지부|보건복지부|건강보험\s*부당\s*청구|가짜진료|요양급여|진료행위|환수\s*금액|신고\s*포상금",
    re.I,
)
PRIVATE_INSURANCE_KEEP_RE = re.compile(
    r"인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금",
    re.I,
)
NON_INSURANCE_INVESTMENT_MISCONDUCT_NOISE_RE = re.compile(
    r"미래에셋|미래에셋증권|스페이스X|전문투자자|사채관리회사|회사채|채권자|증권사|금융투자|ELS|홍콩ELS|공모펀드",
    re.I,
)
AMBIGUOUS_COMPETITOR_HOMONYM_NOISE_RE = re.compile(
    r"메가박스|메가박스중앙|메가커피|메가MGC|메가스터디|메가\s*히트|메가\s*런치|메가\s*세일|메가\s*이벤트",
    re.I,
)
SPORTS_OCCUPATION_INSURANCE_AGENT_NOISE_RE = re.compile(
    r"손흥민|이강인|축구|월드컵|A매치|옐로카드|레드카드|퇴장|주심|심판|파울|경고|PSG|파리생제르맹",
    re.I,
)
STOCK_MARKET_SECTOR_NOISE_RE = re.compile(
    r"코스피|코스닥|공매도|지수선물|옵션|마감시황|장중\s*최고치|하락\s*출발|상승폭\s*반납|순매수|업종별|테마별|등락률|생명보험\(\+|손해보험\(\+|보험지수",
    re.I,
)
INSURANCE_STOCK_MARKET_KEEP_RE = re.compile(
    r"보험주|보험지수|손해보험업종|생명보험업종|주주환원|보험업종",
    re.I,
)
ENTERTAINMENT_MARKETING_NOISE_RE = re.compile(
    r"KT|위즈파크|뮤지컬|그날들|캠핑존|초청|충성\s*고객|프로야구\s*시즌|장기\s*고객|콘서트|팬미팅",
    re.I,
)
CELEBRITY_INSURANCE_AGENT_NOISE_RE = re.compile(
    r"조민아|쥬얼리|서인영|셀럽|싱글맘|인스타그램|SNS|좋아요|보험왕|연예인|가수|방송인",
    re.I,
)
POLITICAL_MEDIA_DIGEST_NOISE_RE = re.compile(
    r"지지율|국힘|민주당|부정선거론|민심|정치권|선거|대통령|중앙일보\s+민심|신문\s*사설|데스크\s*칼럼",
    re.I,
)
COMMUNITY_EVENT_ATTENDEE_NOISE_RE = re.compile(
    r"도민회|향우회|이[·ㆍ]?취임식|취임식|축하연|당선인|지방선거|구청장|도의원|주요\s*인사|자리를\s*빛냈",
    re.I,
)
SPORTS_SPONSORSHIP_INCIDENTAL_NOISE_RE = re.compile(
    r"월드컵|거리응원|치킨집|축구|국가대표팀|프로야구|KBO|스포츠마케팅|팬심|팬덤|하루틴|골프청사진|티샷|공동\s*선두",
    re.I,
)
OVERSEAS_LOCAL_INSURANCE_NOISE_RE = re.compile(
    r"미주중앙일보|JPA\s*Adjusters|Adjusters\s*&\s*Associates|어저스터|침수[·ㆍ]화재|보험사가\s*놓친\s*피해|미주|LA|뉴욕",
    re.I,
)
FOREIGN_MACRO_INSURANCE_INCIDENTAL_NOISE_RE = re.compile(
    r"대만|해외투자소득|환율\s*안정|해외서\s*돈\s*벌어도|생명보험사를\s*중심으로\s*한\s*증권투자|중앙은행|수출업체",
    re.I,
)
EXTERNAL_GEOPOLITICAL_SHIPPING_NOISE_RE = re.compile(
    r"호르무즈|이란|해협|유조선|해운|선박|통항|해상통항|해상\s*통항|중동|원유",
    re.I,
)
EXTERNAL_GEOPOLITICAL_SHIPPING_CONTEXT_RE = re.compile(
    r"보험|보험사|보험업계|해운[·ㆍ]보험업계|안전항로|유료\s*호위|위험해역|국제해사기구|IMO|보험\s*약관",
    re.I,
)
EXTERNAL_GEOPOLITICAL_SHIPPING_KEEP_RE = re.compile(
    r"인카금융|보험대리점|법인보험대리점|보험GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기|실손|손해율",
    re.I,
)
OWN_SPONSORED_SPORTS_PREVIEW_TITLE_RE = re.compile(
    r"KLPGA|골프|우승\s*후보|개막|디펜딩\s*챔피언|방어|노승희|안송이|400경기|금자탑|기념보드|꽃다발|선수|티샷|포토|청사진|액티브Shot|인생이야기|별들의\s*격돌|주차|셔틀|날씨|관람\s*정보|갤러리|프로암|이모저모|러프|웃음꽃|하루틴|팬심|협찬사|일상\s*침투|PREVIEW|프리뷰|3승\s*사냥|사냥|더헤븐리조트|커뮤니티\s*시설|샬롬\s*뷰|품격\s*높인다",
    re.I,
)
GENERAL_SPORTS_NOISE_RE = re.compile(
    r"프로야구|프로농구|프로배구|KBO|월드컵|축구|야구|농구|배구|골프|KLPGA|US오픈|우천취소|구장|경기\s*진행|비거리|스포츠\s*바|비키니\s*미녀|황금\s*패치",
    re.I,
)
GENERAL_SPORTS_KEEP_RE = re.compile(
    r"인카금융|보험|보험사|생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|보험GA|금융감독원|금감원|금융위원회|금융위|1200%|정착지원금|불완전판매|소비자보호",
    re.I,
)

CATEGORIES = {
    "own": OWN_NAMES,
    "regulation": REGULATION_WORDS,
    "competitor": COMPETITOR_WORDS,
    "industry": INDUSTRY_WORDS,
}
KEYWORD_CATEGORIES = {"own", "regulation", "competitor", "industry", "sponsorship", "other"}

AI_CONTEXT_CATEGORIES = {"own", "regulation", "competitor", "industry", "sponsorship", "other", "exclude"}
AI_CONTEXT_TONES = {"positive", "neutral", "caution", "negative", "exclude"}
AI_NEGATIVE_TARGETS = {"own", "industry", "competitor", "policy", "none"}
CONTEXT_RULES: list[dict] = []


def configure_context_rules(rows: list[dict] | None) -> None:
    """Load DB-backed context rules. Invalid rows are ignored and code defaults remain active."""
    global CONTEXT_RULES
    cleaned = []
    for row in rows or []:
        if not isinstance(row, dict) or row.get("enabled") is False:
            continue
        triggers = [str(item).strip() for item in row.get("trigger_terms") or [] if str(item).strip()]
        if not triggers:
            continue
        cleaned.append(
            {
                "rule_key": str(row.get("rule_key") or "").strip(),
                "category": str(row.get("category") or "other").strip(),
                "tone": str(row.get("tone") or "neutral").strip(),
                "trigger_terms": triggers,
                "required_terms": [str(item).strip() for item in row.get("required_terms") or [] if str(item).strip()],
                "exclude_terms": [str(item).strip() for item in row.get("exclude_terms") or [] if str(item).strip()],
                "priority": int(row.get("priority") or 100),
            }
        )
    CONTEXT_RULES = sorted(cleaned, key=lambda item: item.get("priority", 100))


def ai_context_budget() -> int:
    """Limit per-run AI classification calls so scheduled jobs stay predictable."""
    try:
        return max(0, int(__import__("os").getenv("AI_CONTEXT_MAX_ARTICLES", "18")))
    except ValueError:
        return 18


def ai_context_enabled() -> bool:
    value = __import__("os").getenv("AI_CONTEXT_CLASSIFICATION", "auto").strip().lower()
    if value in {"0", "false", "no", "off", "rules"}:
        return False
    if value in {"1", "true", "yes", "on", "auto", "gemini"}:
        return bool(__import__("os").getenv("GEMINI_API_KEY", "").strip())
    return False


def ai_context_pro_review_enabled() -> bool:
    return __import__("os").getenv("AI_CONTEXT_PRO_REVIEW", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "y",
        "on",
    }


def should_pro_review_ai_context(article: dict, context: dict) -> bool:
    if not ai_context_pro_review_enabled():
        return False
    normalized = normalized_ai_context(article, context)
    rule_category = article.get("_category") or categorize(article)
    rule_tone = article.get("_tone") or analyze_tone(article)
    confidence = float(normalized.get("confidence") or 0)

    if normalized["negative_target"] == "own":
        return True
    if normalized["category"] == "own" and normalized["own_mentioned"] and normalized["tone"] in {"negative", "caution"}:
        return True
    if rule_category == "own" and rule_tone in {"negative", "caution"}:
        return True
    if confidence and confidence < 0.68 and (normalized["own_mentioned"] or normalized["tone"] in {"negative", "caution"}):
        return True
    return False


def analyze(articles: list[dict], top_n: int = 60) -> tuple[list[dict], dict]:
    remaining_ai_reviews = ai_context_budget() if ai_context_enabled() else 0
    for article in articles:
        if article.get("_feedback_applied"):
            article["_category"] = article.get("_category") or article.get("category") or categorize(article)
            article["_tone"] = article.get("_tone") or article.get("tone") or analyze_tone(article)
            article["_ai_context"] = normalized_ai_context(article, article.get("_ai_context"))
        elif article.get("_analysis_cache_applied"):
            article["_category"] = article.get("_category") or article.get("category") or categorize(article)
            article["_tone"] = article.get("_tone") or article.get("tone") or analyze_tone(article)
            apply_context_safety_guardrails(article, article.get("_ai_context"))
        else:
            article["_category"] = categorize(article)
            article["_tone"] = analyze_tone(article)
            if remaining_ai_reviews and should_ai_context_review(article):
                remaining_ai_reviews -= 1
                apply_ai_context_classification(article)
            else:
                apply_context_safety_guardrails(article)
        article["_score"] = score_article(article)
        if not article.get("_summary") or is_bad_cached_summary(article.get("_summary")):
            article["_summary"] = build_quality_summary(article)

    articles.sort(key=lambda x: x.get("_score", 0), reverse=True)
    clustered = cluster_articles(articles[:top_n])
    clustered.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return clustered, build_metrics(articles, clustered)


def article_context_text(article: dict, limit: int = 1800) -> str:
    """Article evidence text.

    Do not include the collection keyword here. A search keyword is only a
    retrieval hint, not proof that the article itself mentions that entity.
    """
    parts = [
        article.get("title", ""),
        article.get("description", ""),
        article.get("summary", ""),
        article.get("_summary", ""),
        article.get("source", ""),
    ]
    text = re.sub(r"\s+", " ", " ".join(str(part or "") for part in parts)).strip()
    return text[:limit]


def should_ai_context_review(article: dict) -> bool:
    """Send only decision-sensitive articles to Gemini.

    Rule-based collection still gathers candidates, but final tone/category for
    company-sensitive items should come from contextual analysis.
    """
    if article.get("_feedback_applied"):
        return False
    if is_non_business_noise(article):
        return False
    category = article.get("_category") or categorize(article)
    tone = article.get("_tone") or analyze_tone(article)
    text = article_context_text(article)
    if is_own_article(article):
        return True
    if category == "regulation":
        return tone in {"negative", "caution"} or has_priority_policy_context(text)
    if category in {"competitor", "industry"} and is_competitor_brand_reputation_against_own(article):
        return True
    if category in {"competitor", "industry"} and tone in {"negative", "caution"}:
        return has_material_business_context(text)
    if any(word in text for word in SEVERE_NEGATIVE_WORDS + CAUTION_WORDS + RISK_CONTEXT_WORDS):
        return has_material_business_context(text)
    return False


def build_ai_context_prompt(article: dict) -> str:
    title = str(article.get("title", "") or "").strip()
    source = str(article.get("source", "") or "").strip()
    keyword = str(article.get("keyword", "") or "").strip()
    category = article.get("_category") or categorize(article)
    tone = article.get("_tone") or analyze_tone(article)
    body = article_context_text(article)
    return f"""
당신은 인카금융서비스 언론 모니터링의 기사 문맥 분류 담당자입니다.
아래 기사 1건을 읽고, 반드시 JSON 하나만 반환하세요.

중요 원칙:
- 인카금융서비스가 직접 언급되지 않은 기사는 당사 긍정 또는 당사 부정으로 분류하지 않습니다.
- 부정 키워드가 있어도 기사에서 비판, 의혹, 제재, 피해, 위반의 대상이 인카금융서비스가 아니면 당사 부정이 아닙니다.
- 업계 규제, 보험사기, 소비자 피해, 법안, 감독 동향은 당사 직접 언급이 없으면 보통 주의 또는 중립입니다.
- 전세사기 피해 지원, 기부, 사회공헌, 보호, ESG 지원은 부정이 아닙니다.
- 당사 주가 하락, 목표가 하향, 정착지원금 증가, 업계 과열 속 명단 언급은 부정이 아니라 주의입니다.
- 당사 성과, 수상, 우수인증설계사, 브랜드평판, 실적 개선처럼 당사에 우호적인 보도만 긍정입니다.
- 경쟁사가 브랜드평판 1위이고 인카금융서비스가 2위, 뒤이어, 초박빙 등으로 언급된 보도는 당사 긍정이 아니라 경쟁사/시장 평판 관찰 기사입니다.
- 당사 부정은 인카금융서비스가 기사에서 직접 비판/조사/제재/불완전판매/소비자 피해/불법 의혹의 대상으로 지목된 경우만 가능합니다.
- 근거 문장이 없으면 negative로 판정하지 마세요.

허용값:
category: own | regulation | competitor | industry | sponsorship | other | exclude
tone: positive | neutral | caution | negative | exclude
negative_target: own | industry | competitor | policy | none

반환 JSON 형식:
{{
  "category": "own",
  "tone": "caution",
  "own_mentioned": true,
  "negative_target": "none",
  "evidence": "기사에서 판정 근거가 되는 짧은 원문 문장",
  "reason": "짧은 판단 사유",
  "clipping_recommended": true,
  "clipping_reason": "임원 클리핑에 넣을지 판단한 짧은 이유",
  "confidence": 0.82
}}

기사:
- 제목: {title}
- 출처: {source}
- 검색 키워드: {keyword}
- 기존 룰 분류: {category}/{tone}
- 본문/요약: {body}
""".strip()


def apply_ai_context_classification(article: dict) -> bool:
    prompt = build_ai_context_prompt(article)
    try:
        from ai_fallback import generate_gemini_text
    except Exception:
        apply_context_safety_guardrails(article)
        return False

    text, provider = generate_gemini_text(
        prompt,
        max_tokens=720,
        temperature=0.0,
        purpose="article_context_classification",
    )
    context = parse_ai_context_response(text)
    if not context:
        apply_context_safety_guardrails(article)
        return False
    context["provider"] = provider

    if should_pro_review_ai_context(article, context):
        pro_text, pro_provider = generate_gemini_text(
            prompt,
            max_tokens=900,
            temperature=0.0,
            purpose="article_context_pro_review",
        )
        pro_context = parse_ai_context_response(pro_text)
        if pro_context:
            pro_context["provider"] = pro_provider
            pro_context["primary_provider"] = provider
            context = pro_context

    article["_ai_context"] = apply_context_safety_guardrails(article, context)
    article["_ai_context_reviewed"] = True
    return True


def parse_ai_context_response(text: object) -> dict:
    raw = str(text or "").strip()
    if not raw:
        return {}
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.S).strip()
    match = re.search(r"\{.*\}", raw, flags=re.S)
    if match:
        raw = match.group(0)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def normalize_ai_context_category(value: object) -> str:
    text = str(value or "").strip().lower()
    mapped = {
        "company": "own",
        "incar": "own",
        "policy": "regulation",
        "ga": "competitor",
        "market": "industry",
        "brand": "sponsorship",
        "sponsor": "sponsorship",
        "sponsorship": "sponsorship",
        "event": "sponsorship",
        "noise": "exclude",
    }.get(text, text)
    return mapped if mapped in AI_CONTEXT_CATEGORIES else ""


def normalize_ai_context_tone(value: object) -> str:
    text = str(value or "").strip().lower()
    mapped = {
        "warning": "caution",
        "risk": "caution",
        "high": "negative",
        "noise": "exclude",
    }.get(text, text)
    return mapped if mapped in AI_CONTEXT_TONES else ""


def normalize_ai_negative_target(value: object) -> str:
    text = str(value or "").strip().lower()
    mapped = {
        "company": "own",
        "incar": "own",
        "regulation": "policy",
        "policy/regulation": "policy",
        "ga": "industry",
        "market": "industry",
        "": "none",
    }.get(text, text)
    return mapped if mapped in AI_NEGATIVE_TARGETS else "none"


def normalized_ai_context(article: dict, context: dict | None = None) -> dict:
    context = context if isinstance(context, dict) else article.get("_ai_context")
    context = context if isinstance(context, dict) else article.get("ai_context")
    context = context if isinstance(context, dict) else {}
    category = normalize_ai_context_category(context.get("category")) or article.get("_category") or categorize(article)
    tone = normalize_ai_context_tone(context.get("tone")) or article.get("_tone") or analyze_tone(article)
    own_mentioned = bool(context.get("own_mentioned")) or is_own_article(article)
    negative_target = normalize_ai_negative_target(context.get("negative_target"))
    evidence = str(context.get("evidence") or "").strip()
    reason = str(context.get("reason") or "").strip()
    clipping_recommended = normalize_ai_bool(context.get("clipping_recommended"))
    clipping_reason = str(context.get("clipping_reason") or "").strip()
    try:
        confidence = float(context.get("confidence", 0) or 0)
    except (TypeError, ValueError):
        confidence = 0
    return {
        "category": category,
        "tone": tone,
        "own_mentioned": own_mentioned,
        "negative_target": negative_target,
        "evidence": evidence,
        "reason": reason,
        "clipping_recommended": clipping_recommended,
        "clipping_reason": clipping_reason,
        "confidence": round(max(0.0, min(confidence, 1.0)), 3),
        "provider": context.get("provider", ""),
    }


def normalize_ai_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "recommended", "recommend"}:
        return True
    if text in {"0", "false", "no", "n", "none", "not_recommended"}:
        return False
    return None


def apply_context_safety_guardrails(article: dict, context: dict | None = None) -> dict:
    """Apply non-negotiable company-risk rules after rules or AI classification."""
    result = normalized_ai_context(article, context)
    rule_category = article.get("_category") or categorize(article)
    rule_tone = article.get("_tone") or analyze_tone(article)

    if is_external_insurance_noise_article(article):
        result["category"] = "other"
        result["tone"] = "exclude"
        result["own_mentioned"] = False
        result["negative_target"] = "none"
        result["clipping_recommended"] = False
        result["clipping_reason"] = ""
        article["_category"] = result["category"]
        article["_tone"] = result["tone"]
        article["category"] = result["category"]
        article["tone"] = result["tone"]
        article["_ai_context"] = result
        return result

    if is_own_sponsored_sports_article(article):
        result["category"] = "sponsorship"
        result["tone"] = "positive" if is_own_sponsored_sports_brand_article(article) else "neutral"
        result["own_mentioned"] = True
        result["negative_target"] = "none"
        result["clipping_recommended"] = is_own_sponsored_sports_brand_article(article)
        if result["clipping_recommended"] and not result.get("clipping_reason"):
            result["clipping_reason"] = "당사 주최 대회의 브랜드·스폰서십 노출 성과로 보존할 기사입니다."
        article["_category"] = result["category"]
        article["_tone"] = result["tone"]
        article["category"] = result["category"]
        article["tone"] = result["tone"]
        article["_ai_context"] = result
        return result

    if is_own_article(article):
        result["own_mentioned"] = True
        if result["category"] in {"other", "exclude"}:
            result["category"] = "own"

    if is_competitor_brand_reputation_against_own(article):
        result["category"] = "competitor"
        result["tone"] = "caution"
        result["negative_target"] = "none"
        result["own_mentioned"] = True

    if is_settlement_support_list_article(article):
        result["category"] = "regulation"
        result["tone"] = "caution"
        result["negative_target"] = "none"
        result["own_mentioned"] = is_own_article(article)

    if is_non_business_noise(article):
        result["category"] = "other"
        result["tone"] = "neutral"
        result["negative_target"] = "none"

    if is_relief_support_article(article):
        result["tone"] = "positive" if is_own_positive_focus_article(article) else "neutral"
        result["negative_target"] = "none"

    if is_preventive_security_article(article):
        result["tone"] = "neutral"
        result["negative_target"] = "none"

    if is_investment_downgrade_article(article) or is_stock_decline_article(article) or is_settlement_support_caution_article(article):
        result["tone"] = "caution"
        if result["negative_target"] == "own":
            result["negative_target"] = "none"

    if result["tone"] == "positive" and result["category"] != "own":
        result["tone"] = "neutral"
    if result["tone"] == "positive" and result["category"] == "own" and not is_own_positive_focus_article(article):
        result["tone"] = "neutral" if rule_tone != "caution" else "caution"

    direct_own_negative = (
        result["category"] == "own"
        and result["tone"] == "negative"
        and result["own_mentioned"]
        and result["negative_target"] == "own"
        and bool(result["evidence"])
    )
    if result["tone"] == "negative" and not direct_own_negative:
        if result["category"] in {"regulation", "competitor", "industry", "own"} or result["negative_target"] in {"industry", "competitor", "policy"}:
            result["tone"] = "caution"
        else:
            result["tone"] = "neutral"

    if result["category"] == "own" and not result["own_mentioned"]:
        result["category"] = rule_category if rule_category != "own" else "industry"

    recommended = result.get("clipping_recommended")
    if recommended is None:
        recommended = should_recommend_clipping(article, result)
    result["clipping_recommended"] = bool(recommended)
    if not result.get("clipping_reason"):
        result["clipping_reason"] = build_clipping_reason(article, result) if result["clipping_recommended"] else ""

    article["_category"] = result["category"]
    article["_tone"] = result["tone"]
    article["category"] = result["category"]
    article["tone"] = result["tone"]
    article["_ai_context"] = result
    return result


def should_recommend_clipping(article: dict, context: dict) -> bool:
    """Recommend only articles that are useful for executive PR clipping."""
    if context.get("tone") == "exclude" or context.get("category") == "other":
        return False
    if context.get("category") == "sponsorship":
        return is_own_sponsored_sports_brand_article(article)
    if is_non_business_noise(article):
        return False
    if context.get("category") == "own":
        return context.get("tone") in {"positive", "caution", "negative", "neutral"}
    if context.get("tone") in {"negative", "caution"} and context.get("category") in {"regulation", "competitor", "industry"}:
        return True
    if context.get("category") == "regulation" and any(word in article_context_text(article) for word in ("수수료", "1200%", "설계사", "GA", "보험대리점", "내부통제", "불완전판매")):
        return True
    return False


def build_clipping_reason(article: dict, context: dict) -> str:
    category = context.get("category")
    tone = context.get("tone")
    if category == "own" and tone == "positive":
        return "당사 우호 보도로 홍보 활용 여부를 검토할 기사입니다."
    if category == "own" and tone == "negative":
        return "당사 직접 리스크로 사실관계와 대응 필요성을 우선 확인할 기사입니다."
    if category == "own" and tone == "caution":
        return "당사 언급이 포함된 주의 이슈로 임원 보고 후보입니다."
    if category == "own":
        return "당사 직접 언급 기사로 노출 맥락 확인이 필요합니다."
    if category == "sponsorship":
        return "당사 주최 대회의 브랜드·스폰서십 노출 성과로 별도 보존할 기사입니다."
    if category == "regulation":
        return "정책·감독 변화가 영업환경에 미칠 영향을 확인할 기사입니다."
    if category in {"competitor", "industry"} and tone in {"negative", "caution"}:
        return "GA·보험업계 리스크 흐름을 보여주는 관찰 기사입니다."
    return "언론 동향 판단에 참고할 기사입니다."


def is_direct_own_negative_article(article: dict) -> bool:
    context = apply_context_safety_guardrails(article, article.get("_ai_context"))
    return (
        context.get("category") == "own"
        and context.get("tone") == "negative"
        and context.get("own_mentioned") is True
        and context.get("negative_target") == "own"
        and bool(context.get("evidence"))
    )


def score_article(article: dict) -> int:
    title = article.get("title", "")
    desc = article.get("description", "")
    text = f"{title} {desc}"
    score = 0

    if article.get("_category") == "sponsorship":
        score += 2
    elif is_own_article(article):
        score += 14
    elif article.get("_category") in {"regulation", "competitor"}:
        score += 8
    elif article.get("_category") == "industry":
        score += 4

    if article.get("keyword") and article["keyword"] in title:
        score += 4
    if any(press in text for press in MAJOR_PRESS):
        score += 3
    if article.get("_category") != "sponsorship" and is_own_article(article) and any(word in title for word in NEGATIVE_WORDS):
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
    if is_external_insurance_noise_article(article):
        return "other"
    if is_own_sponsored_sports_article(article):
        return "sponsorship"
    if is_non_business_noise(article):
        return "other"
    rule = matched_context_rule(text)
    rule_category = rule.get("category")
    if rule_category in {"exclude", "other"}:
        return "other"
    if rule_category in KEYWORD_CATEGORIES:
        return rule_category
    if is_competitor_brand_reputation_against_own(article):
        return "competitor"
    if is_settlement_support_list_article(article):
        return "regulation"
    if contains_own_name(text):
        return "own"
    if is_sales_conduct_context_text(text):
        return "regulation"
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


def contains_own_name(text: object) -> bool:
    text = str(text or "")
    compact = re.sub(r"\s+", "", text)
    return any(name in text or name in compact for name in OWN_NAMES)


def contains_competitor_word(text: str) -> bool:
    for keyword in COMPETITOR_WORDS:
        if keyword in AMBIGUOUS_COMPETITOR_WORDS:
            if is_ambiguous_competitor_match(text, keyword):
                return True
            continue
        if keyword in text:
            return True
    return False


def contains_unambiguous_competitor_word(text: str) -> bool:
    return any(keyword in text for keyword in COMPETITOR_WORDS if keyword not in AMBIGUOUS_COMPETITOR_WORDS)


def is_ambiguous_competitor_match(text: str, keyword: str) -> bool:
    if re.search(rf"{re.escape(keyword)}(금융|보험|GA|에셋|대리점|서비스)", text):
        return True
    standalone = re.search(rf"(?<![0-9A-Za-z가-힣]){re.escape(keyword)}(?![0-9A-Za-z가-힣])", text)
    return bool(standalone and has_domain_context(text))


def is_sales_conduct_context_text(text: str) -> bool:
    """True when an ambiguous term such as 1200% is actually about insurance sales conduct."""
    text = str(text or "")
    if monitor_rule_matches(text, "ga_sales_commission_1200"):
        return True
    if not any(word in text for word in SALES_CONDUCT_TRIGGER_WORDS):
        return False
    return any(word in text for word in SALES_CONDUCT_REQUIRED_CONTEXT_WORDS)


def is_sales_conduct_noise_text(text: str) -> bool:
    """Suppress BigKinds-style 1200% noise such as stock return, retail, or semiconductor articles."""
    text = str(text or "")
    db_rule = monitor_rule_by_key("ga_sales_commission_1200")
    db_triggers = db_rule.get("trigger_terms", []) if db_rule else []
    has_db_trigger = bool(db_triggers) and any(term in text for term in db_triggers)
    if not has_db_trigger and not re.search(r"1200\s*[%％]|1200%룰|1200% 룰", text, re.I):
        return False
    if is_sales_conduct_context_text(text):
        return False
    exclude_terms = db_rule.get("exclude_terms", []) if db_rule else SALES_CONDUCT_NOISE_WORDS
    required_terms = db_rule.get("required_terms", []) if db_rule else SALES_CONDUCT_REQUIRED_CONTEXT_WORDS
    if any(word in text for word in exclude_terms):
        return True
    return not any(word in text for word in required_terms)


def is_external_insurance_noise_text(text: str) -> bool:
    text = str(text or "")
    if not any(word in text for word in EXTERNAL_INSURANCE_NOISE_TRIGGERS):
        return False
    if not any(word in text for word in EXTERNAL_INSURANCE_NOISE_TERMS):
        return False
    return not any(word in text for word in EXTERNAL_INSURANCE_KEEP_TERMS)


def is_external_insurance_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_external_insurance_noise_text(text)


def is_general_finance_noise_text(text: str) -> bool:
    text = str(text or "")
    return bool(GENERAL_FINANCE_NOISE_RE.search(text)) and not bool(INSURANCE_GA_KEEP_RE.search(text))


def is_non_insurance_finance_disclosure_noise_text(text: str) -> bool:
    text = str(text or "")
    has_non_insurance_signal = bool(NON_INSURANCE_FINANCE_DISCLOSURE_NOISE_RE.search(text))
    has_disclosure_or_earnings_signal = bool(NON_INSURANCE_FINANCE_DISCLOSURE_CONTEXT_RE.search(text))
    if not (has_non_insurance_signal and has_disclosure_or_earnings_signal):
        return False
    return not bool(INSURANCE_GA_BUSINESS_KEEP_RE.search(text))


def is_non_insurance_finance_disclosure_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            raw.get("content"),
            raw.get("body"),
        )
    )
    return is_non_insurance_finance_disclosure_noise_text(text)


def is_general_finance_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_general_finance_noise_text(text)


def is_admin_agency_noise_text(text: str) -> bool:
    text = str(text or "")
    return bool(ADMIN_AGENCY_NOISE_RE.search(text)) and not bool(INSURANCE_GA_MATERIAL_KEEP_RE.search(text))


def is_admin_agency_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_admin_agency_noise_text(text)


def is_public_health_insurance_noise_text(text: str) -> bool:
    text = str(text or "")
    return bool(PUBLIC_HEALTH_INSURANCE_NOISE_RE.search(text)) and not bool(PRIVATE_INSURANCE_KEEP_RE.search(text))


def is_public_health_insurance_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_public_health_insurance_noise_text(text)


def is_non_insurance_investment_misconduct_noise_text(text: str) -> bool:
    text = str(text or "")
    if PRIVATE_INSURANCE_KEEP_RE.search(text):
        return False
    if not NON_INSURANCE_INVESTMENT_MISCONDUCT_NOISE_RE.search(text):
        return False
    return bool(re.search(r"불완전판매|내부통제|고객보호|투자자\s*보호|전문투자자|회사채|사채관리회사|미배정|제재", text, re.I))


def is_non_insurance_investment_misconduct_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_non_insurance_investment_misconduct_noise_text(text)


def is_ambiguous_competitor_homonym_noise_text(text: str) -> bool:
    text = str(text or "")
    return bool(AMBIGUOUS_COMPETITOR_HOMONYM_NOISE_RE.search(text)) and not bool(
        re.search(r"메가금융서비스|보험대리점|법인보험대리점|보험설계사|보험GA|GA|손해보험|생명보험", text, re.I)
    )


def is_ambiguous_competitor_homonym_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_ambiguous_competitor_homonym_noise_text(text)


def is_sports_occupation_insurance_agent_noise_text(text: str) -> bool:
    text = str(text or "")
    if not SPORTS_OCCUPATION_INSURANCE_AGENT_NOISE_RE.search(text):
        return False
    if not re.search(r"보험설계사(?:로\s*알려진|인|로서|라는)\s*(?:테헤라\s*)?(?:주심|심판)|(?:주심|심판)[^.。!?]{0,30}보험설계사", text, re.I):
        return False
    return not bool(
        re.search(r"보험대리점|법인보험대리점|보험GA|GA|생명보험|손해보험|보험회사|보험업계|보험상품|보험계약|불완전판매|보험사기", text, re.I)
    )


def is_sports_occupation_insurance_agent_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_sports_occupation_insurance_agent_noise_text(text)


def is_stock_market_sector_noise_text(text: str) -> bool:
    text = str(text or "")
    if not STOCK_MARKET_SECTOR_NOISE_RE.search(text):
        return False
    if INSURANCE_STOCK_MARKET_KEEP_RE.search(text):
        return False
    return bool(re.search(r"생명보험|손해보험|보험사|보험업종|보험지수", text, re.I))


def is_stock_market_sector_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_stock_market_sector_noise_text(text)


def is_entertainment_marketing_noise_text(text: str) -> bool:
    text = str(text or "")
    if not ENTERTAINMENT_MARKETING_NOISE_RE.search(text):
        return False
    return not bool(re.search(r"인카금융|보험|GA|법인보험대리점|보험대리점|설계사", text, re.I))


def is_entertainment_marketing_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_entertainment_marketing_noise_text(text)


def is_celeb_insurance_agent_noise_text(text: str) -> bool:
    text = str(text or "")
    if not CELEBRITY_INSURANCE_AGENT_NOISE_RE.search(text):
        return False
    if not re.search(r"보험\s*설계사|보험왕|MVP|QUEEN|수상|근황", text, re.I):
        return False
    return not bool(re.search(r"보험대리점|법인보험대리점|GA|보험GA|영업조직|불완전판매|소비자보호|보험업계", text, re.I))


def is_celeb_insurance_agent_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_celeb_insurance_agent_noise_text(text)


def is_political_media_digest_noise_text(text: str) -> bool:
    text = str(text or "")
    if not POLITICAL_MEDIA_DIGEST_NOISE_RE.search(text):
        return False
    return not bool(re.search(r"인카금융|보험대리점|법인보험대리점|GA|보험GA|생명보험|손해보험|보험사기|보험금|실손|1200%|정착지원금", text, re.I))


def is_political_media_digest_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_political_media_digest_noise_text(text)


def is_community_event_attendee_noise_text(text: str) -> bool:
    text = str(text or "")
    if not COMMUNITY_EVENT_ATTENDEE_NOISE_RE.search(text):
        return False
    return not bool(re.search(r"보험상품|보험계약|보험금|보험료|손해율|실손|보험사기|업무협약|캠페인|출시|판매|소비자보호|인카금융", text, re.I))


def is_community_event_attendee_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
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
    return is_community_event_attendee_noise_text(text)


def is_sports_sponsorship_incidental_noise_text(text: str) -> bool:
    text = str(text or "")
    if not SPORTS_SPONSORSHIP_INCIDENTAL_NOISE_RE.search(text):
        return False
    if re.search(r"인카금융|보험대리점|법인보험대리점|보험GA|GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기", text, re.I):
        return False
    return bool(re.search(r"교보생명|KB금융|DB손해보험|손해보험|생명보험|보험업계|보험사", text, re.I)) and bool(
        re.search(r"공식\s*파트너|파트너|캠페인|후원|협찬|이모저모|거리응원|팬심|팬덤|티샷|공동\s*선두|라운드", text, re.I)
    )


def is_sports_sponsorship_incidental_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("keyword"),
        )
    )
    return is_sports_sponsorship_incidental_noise_text(text)


def is_overseas_local_insurance_noise_text(text: str) -> bool:
    text = str(text or "")
    if not OVERSEAS_LOCAL_INSURANCE_NOISE_RE.search(text):
        return False
    return not bool(re.search(r"인카금융|국내\s*보험|금융감독원|금감원|금융위원회|금융위|GA|보험대리점|법인보험대리점|실손|1200%|정착지원금", text, re.I))


def is_overseas_local_insurance_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("keyword"),
        )
    )
    return is_overseas_local_insurance_noise_text(text)


def is_foreign_macro_insurance_incidental_noise_text(text: str) -> bool:
    text = str(text or "")
    if not FOREIGN_MACRO_INSURANCE_INCIDENTAL_NOISE_RE.search(text):
        return False
    return not bool(re.search(r"인카금융|국내\s*보험|보험대리점|법인보험대리점|GA|보험설계사|실손|1200%|정착지원금|불완전판매|보험사기", text, re.I))


def is_foreign_macro_insurance_incidental_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("keyword"),
        )
    )
    return is_foreign_macro_insurance_incidental_noise_text(text)


def is_external_geopolitical_shipping_noise_text(text: str) -> bool:
    text = str(text or "")
    if not EXTERNAL_GEOPOLITICAL_SHIPPING_NOISE_RE.search(text):
        return False
    if not EXTERNAL_GEOPOLITICAL_SHIPPING_CONTEXT_RE.search(text):
        return False
    return not bool(EXTERNAL_GEOPOLITICAL_SHIPPING_KEEP_RE.search(text))


def is_external_geopolitical_shipping_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("summary"),
            article.get("keyword"),
        )
    )
    return is_external_geopolitical_shipping_noise_text(text)


def is_general_sports_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("keyword"),
        )
    )
    return bool(GENERAL_SPORTS_NOISE_RE.search(text)) and not bool(GENERAL_SPORTS_KEEP_RE.search(text))


def own_sponsored_sports_text(article: dict) -> str:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    return " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("summary"),
            article.get("keyword"),
        )
    )


def is_own_sponsored_sports_article(article: dict) -> bool:
    text = own_sponsored_sports_text(article)
    if not text.strip():
        return False
    has_own_tournament = bool(
        re.search(r"인카금융(?:서비스)?\s*더\s*헤븐|인카금융(?:서비스)?\s*더헤븐|인카금융(?:서비스)?[^.。!?]{0,35}마스터즈|더헤븐CC|인카금융(?:서비스)?[^.。!?]{0,35}슈퍼볼링|슈퍼볼링[^.。!?]{0,35}인카금융", text, re.I)
    )
    has_hosted_context = contains_own_name(text) and bool(
        re.search(r"KLPGA|골프|마스터즈|더헤븐|더\s*헤븐|슈퍼볼링|볼링|대회|라운드|티샷|버디|이글|스윙|언더파|타수|선수|프로암|갤러리|관람|협찬사", text, re.I)
    )
    return has_own_tournament or has_hosted_context


def is_own_sponsored_sports_brand_article(article: dict) -> bool:
    text = own_sponsored_sports_text(article)
    title = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            (article.get("raw") if isinstance(article.get("raw"), dict) else {}).get("title"),
        )
    )
    return bool(
        re.search(r"기부|확정형\s*기부|사회공헌|브랜드|협약|후원|스폰서|주최|홍보|마케팅|ESG|파트너십", title, re.I)
        or re.search(r"기부|확정형\s*기부|사회공헌|ESG|브랜드\s*홍보|스포츠마케팅|파트너십", text, re.I)
    )


def is_own_sponsored_sports_preview_noise_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    title = " ".join(str(value or "") for value in (article.get("title"), raw.get("title")))
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title"),
            article.get("description"),
            article.get("source"),
            raw.get("title"),
            raw.get("description"),
            raw.get("summary"),
            article.get("summary"),
            article.get("keyword"),
        )
    )
    if not (contains_own_name(text) or re.search(r"인카금융[^\s]*\s*더\s*헤븐|인카금융[^\s]*\s*더헤븐|더헤븐CC", text)):
        return False
    if re.search(r"인카금융|인카금융서비스", title) and re.search(r"후원|스폰서|주최|브랜드|마케팅|기부|사회공헌|ESG", title):
        return False
    if OWN_SPONSORED_SPORTS_PREVIEW_TITLE_RE.search(title):
        return True
    return bool(
        re.search(r"대회\s*주최사\s*인카금융서비스|타이틀스폰서로\s*합류|공동\s*주최사", text, re.I)
        and OWN_SPONSORED_SPORTS_PREVIEW_TITLE_RE.search(text)
        and not re.search(r"후원|브랜드|마케팅|기부|사회공헌|ESG", title)
    )


def is_own_sponsored_sports_noise_text(text: str) -> bool:
    text = str(text or "")
    if not contains_own_name(text) and "인카금융 더헤븐 마스터즈" not in text and "인카금융 더 헤븐 마스터즈" not in text:
        return False
    if not any(term in text for term in OWN_SPONSORED_SPORTS_TRIGGERS):
        return False
    if any(term in text for term in OWN_SPONSORED_SPORTS_KEEP_TERMS):
        return False
    return True


def is_own_sponsored_sports_scoreboard_title(title: object) -> bool:
    text = str(title or "")
    if not (
        re.search(r"인카금융(?:서비스)?\s*더\s*헤븐\s*마스터즈", text)
        or re.search(r"인카금융(?:서비스)?\s*더헤븐\s*마스터즈", text)
        or re.search(r"인카금융(?:서비스)?\s*더\s*헤븐", text)
        or re.search(r"인카금융(?:서비스)?\s*더헤븐", text)
    ):
        return False
    if any(term in text for term in OWN_SPONSORED_SPORTS_TITLE_KEEP_TERMS):
        return False
    return bool(
        re.search(
            r"KLPGA|골프|라운드|[0-9]R|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|홀|선수|청사진|포토",
            text,
            re.I,
        )
    )


def is_own_sponsored_sports_noise_article(article: dict) -> bool:
    return False


def monitor_rule_by_key(rule_key: str) -> dict:
    return next((rule for rule in CONTEXT_RULES if rule.get("rule_key") == rule_key), {})


def matched_context_rule(text: str, categories: set[str] | None = None) -> dict:
    text = str(text or "")
    for rule in CONTEXT_RULES:
        if categories and rule.get("category") not in categories:
            continue
        if context_rule_matches(text, rule):
            return rule
    return {}


def monitor_rule_matches(text: str, rule_key: str = "") -> bool:
    text = str(text or "")
    for rule in CONTEXT_RULES:
        if rule_key and rule.get("rule_key") != rule_key:
            continue
        if context_rule_matches(text, rule):
            return True
    return False


def context_rule_matches(text: str, rule: dict) -> bool:
    triggers = rule.get("trigger_terms") or []
    required = rule.get("required_terms") or []
    excluded = rule.get("exclude_terms") or []
    if excluded and any(term in text for term in excluded):
        return False
    if triggers and not any(term in text for term in triggers):
        return False
    if required and not any(term in text for term in required):
        return False
    return True


def has_domain_context(text: str) -> bool:
    if is_external_insurance_noise_text(text):
        return False
    if is_non_insurance_finance_disclosure_noise_text(text):
        return False
    if is_own_sponsored_sports_noise_text(text):
        return False
    if is_sales_conduct_noise_text(text):
        return False
    if any(word in text for word in OWN_NAMES):
        return True
    if is_sales_conduct_context_text(text):
        return True
    if any(word in text for word in REGULATION_WORDS if word not in {"1200%"}):
        return True
    if any(word in text for word in INDUSTRY_WORDS):
        return True
    if any(word in text for word in DOMAIN_CONTEXT_WORDS if word not in {"1200%"}):
        return True
    return False


def has_material_business_context(text: str) -> bool:
    return any(word in text for word in MATERIAL_BUSINESS_CONTEXT_WORDS)


def contains_short_incar_keyword(text: str) -> bool:
    return bool(SHORT_INCAR_PATTERN.search(str(text or "")))


def is_short_incar_noise_text(text: str) -> bool:
    text = str(text or "")
    if not contains_short_incar_keyword(text):
        return False
    if contains_own_name(text):
        return False
    return any(word in text for word in SHORT_INCAR_NOISE_WORDS)


def has_short_incar_business_context(text: str) -> bool:
    text = str(text or "")
    if contains_own_name(text):
        return True
    if not contains_short_incar_keyword(text):
        return False
    if is_short_incar_noise_text(text):
        return False
    return any(word in text for word in SHORT_INCAR_BUSINESS_CONTEXT_WORDS)


def has_priority_policy_context(text: str) -> bool:
    if is_sales_conduct_context_text(text):
        return True
    return bool(
        re.search(
            r"불완전판매|내부통제|보험대리점|GA|설계사|금융감독원|금융위원회",
            text,
            re.I,
        )
    )


def is_non_business_noise(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    title = article.get("title", "")
    if not text.strip():
        return True
    if is_external_insurance_noise_article(article):
        return True
    if is_own_sponsored_sports_article(article):
        return False
    if is_general_finance_noise_article(article):
        return True
    if is_non_insurance_finance_disclosure_noise_article(article):
        return True
    if is_admin_agency_noise_article(article):
        return True
    if is_public_health_insurance_noise_article(article):
        return True
    if is_non_insurance_investment_misconduct_noise_article(article):
        return True
    if is_ambiguous_competitor_homonym_noise_article(article):
        return True
    if is_sports_occupation_insurance_agent_noise_article(article):
        return True
    if is_stock_market_sector_noise_article(article):
        return True
    if is_entertainment_marketing_noise_article(article):
        return True
    if is_celeb_insurance_agent_noise_article(article):
        return True
    if is_political_media_digest_noise_article(article):
        return True
    if is_community_event_attendee_noise_article(article):
        return True
    if is_sports_sponsorship_incidental_noise_article(article):
        return True
    if is_overseas_local_insurance_noise_article(article):
        return True
    if is_foreign_macro_insurance_incidental_noise_article(article):
        return True
    if is_external_geopolitical_shipping_noise_article(article):
        return True
    if is_general_sports_noise_article(article):
        return True
    if is_own_sponsored_sports_noise_article(article):
        return True
    if is_short_incar_noise_text(text):
        return True
    if matched_context_rule(text, {"exclude"}):
        return True
    if is_sales_conduct_noise_text(text):
        return True
    if is_stock_listing_noise(article):
        return True
    has_photo_sports_signal = any(word in title or word in text for word in PHOTO_SPORTS_NOISE_WORDS)
    has_material_signal = any(word in text for word in MATERIAL_CAUTION_CONTEXT_WORDS) or any(name in text for name in OWN_NAMES)
    if has_photo_sports_signal and not has_material_signal:
        return True
    return False


def is_stock_listing_noise(article: dict) -> bool:
    title = article.get("title", "")
    text = title + " " + article.get("description", "")
    if not any(word in title for word in STOCK_LISTING_NOISE_TITLE_WORDS):
        return False
    if any(name in title for name in OWN_NAMES) and any(word in text for word in INVESTMENT_DOWNGRADE_CONTEXT_WORDS):
        return False
    return True


def analyze_tone(article: dict) -> str:
    title = article.get("title", "")
    text = title + " " + article.get("description", "")
    category = article.get("_category") or categorize(article)

    if is_external_insurance_noise_article(article):
        return "exclude"
    if is_own_sponsored_sports_article(article):
        return "positive" if is_own_sponsored_sports_brand_article(article) else "neutral"
    if is_non_business_noise(article):
        return "neutral"
    if is_preventive_security_article(article):
        return "neutral"
    if is_own_direct_negative_article(article):
        return "negative"
    if is_own_caution_article(article):
        return "caution"
    if is_relief_support_article(article):
        return "positive" if is_own_article(article) and is_own_positive_focus_article(article) else "neutral"
    if is_competitor_brand_reputation_against_own(article):
        return "caution"
    rule = matched_context_rule(text)
    rule_tone = rule.get("tone")
    if rule_tone in {"exclude", "neutral"}:
        return "neutral"
    if rule_tone == "positive" and rule.get("category") == "own":
        return "positive"
    if rule_tone == "caution" and category != "own":
        return "caution"
    if category == "regulation" and is_sales_conduct_context_text(text):
        return "caution"

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

    if is_zero_misconduct_positive_article(article) and is_own_positive_focus_article(article):
        return "positive"
    if is_zero_misconduct_positive_article(article) and not is_own_positive_focus_article(article):
        return "neutral"

    # 당사 직접 사고/제재성 이슈만 부정으로 둔다. 시장 약세나 투자의견 하향은 주의로 본다.
    if is_own_article(article) and is_own_direct_negative_article(article) and severe_score >= 4 and severe_score >= positive_score:
        return "negative"
    if (
        positive_score >= 2
        and severe_score == 0
        and caution_score <= 1
        and is_own_positive_focus_article(article)
    ):
        return "positive"
    if should_mark_caution(article, category, severe_score, caution_score):
        return "caution"
    return "neutral"


def should_mark_caution(article: dict, category: str, severe_score: int, caution_score: int) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    if is_preventive_security_article(article):
        return False
    if is_relief_support_article(article):
        return False
    if is_investment_downgrade_article(article) or is_stock_decline_article(article):
        return True
    if is_settlement_support_caution_article(article):
        return True
    if matched_context_rule(text, {"own", "regulation", "competitor", "industry"}).get("tone") == "caution":
        return True
    if category == "regulation" and is_sales_conduct_context_text(text):
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


def is_relief_support_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    relief_target = re.search(
        r"전세사기|사기\s*피해|피해\s*(?:청년|가구|계층|자|지원|복구)|금융취약계층|취약계층|재난|재해|수해|화재\s*피해|구호|구제",
        text,
        re.I,
    )
    support_action = re.search(
        r"지원|후원|기부|성금|사회공헌|구호|구제|보호|돕|나눔|캠페인|협약|ESG",
        text,
        re.I,
    )
    accusation = re.search(
        r"혐의|연루|가해|횡령|배임|고발|수사|제재|처분|논란|불법|사칭|피의|압수수색|기관주의|과태료|과징금",
        text,
        re.I,
    )
    return bool(relief_target and support_action and not accusation)


def is_zero_misconduct_positive_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    return "불완전판매" in text and any(word in text for word in ("0건", "제로", "우수", "인증", "선정"))


def is_own_positive_focus_article(article: dict) -> bool:
    """Only direct company-favorable coverage can be counted as positive."""
    if not is_own_article(article):
        return False
    if is_competitor_brand_reputation_against_own(article):
        return False

    title = article.get("title", "")
    text = title + " " + article.get("description", "")
    positive_signals = set(POSITIVE_WORDS + POSITIVE_RANKING_WORDS + CSR_CONTEXT_WORDS + REPUTATION_WORDS)

    if any(name in title for name in OWN_NAMES):
        return any(word in text for word in positive_signals)

    preferred = normalize_keyword_category(article.get("keyword_category"))
    if preferred == "competitor" and contains_competitor_word(title):
        return False

    sentence_parts = re.split(r"[.!?。！？\n]|(?<=[가-힣])\s{2,}", text)
    for sentence in sentence_parts:
        if any(name in sentence for name in OWN_NAMES) and any(word in sentence for word in positive_signals):
            return True
    return False


def is_own_article(article: dict) -> bool:
    return has_own_evidence(article)


def is_own_direct_negative_article(article: dict) -> bool:
    """Directly negative only when the article alleges own-company misconduct."""
    if not is_own_article(article):
        return False
    text = article_summary_text(article)
    return bool(
        re.search(
            r"인카금융스캔들|불법\s*사채|가로챈|관리\s*부실|불완전판매\s*(?:조사|검사|적발|착수|의혹)|내부통제\s*위반|압수수색|기소|검찰|경찰|과태료|제재|소송|사기|횡령|배임",
            text,
            re.I,
        )
    )


def is_own_caution_article(article: dict) -> bool:
    """Own mention with market/supervisory context is caution, not negative."""
    if not is_own_article(article):
        return False
    text = article_summary_text(article)
    return bool(
        re.search(
            r"금감원|금융감독원|금융위원회|금융위|1200%|정착지원금|부당승환|불완전판매|점검|검사|주가|최저가|하락|목표가\s*하향|VI\s*발동",
            text,
            re.I,
        )
    )


def has_own_evidence(article: dict) -> bool:
    """Use only original article fields as own-company evidence, not generated summaries."""
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title", ""),
            article.get("description", ""),
            raw.get("title", ""),
            raw.get("description", ""),
            raw.get("content", ""),
            raw.get("body", ""),
        )
    )
    return contains_own_name(text)


def contains_own_reference(value: object) -> bool:
    text = str(value or "")
    return contains_own_name(text) or "당사" in text


def is_unsupported_own_reference(article: dict, value: object) -> bool:
    return contains_own_reference(value) and not has_own_evidence(article)


def is_preventive_security_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    has_security_context = any(word in text for word in SECURITY_RISK_WORDS)
    has_preventive_context = any(word in text for word in PREVENTIVE_SECURITY_WORDS)
    has_direct_incident = any(word in text for word in DIRECT_SECURITY_INCIDENT_WORDS)
    has_financial_security_membership = (
        "금융보안원" in text
        and any(word in text for word in ("가입", "회원사", "설명회", "대상 확대", "대폭 확대", "보안 체계", "취약점 점검", "예방"))
    )
    own_direct_incident = any(name in text for name in OWN_NAMES) and any(
        phrase in text
        for phrase in (
            "인카금융서비스 개인정보 유출",
            "인카금융 개인정보 유출",
            "인카금융서비스 해킹",
            "인카금융 해킹",
            "인카금융서비스 침해사고",
            "인카금융 침해사고",
        )
    )
    if has_financial_security_membership and not own_direct_incident:
        return True
    return has_security_context and has_preventive_context and not has_direct_incident


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
    if is_sales_conduct_article(article):
        return False
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


def is_settlement_support_list_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    if is_sales_conduct_article(article):
        return False
    has_context = any(word in text for word in SETTLEMENT_SUPPORT_CONTEXT_WORDS)
    has_severe_signal = any(word in text for word in SETTLEMENT_SUPPORT_SEVERE_WORDS)
    if not has_context or has_severe_signal:
        return False

    title = article.get("title", "")
    own_in_title = any(name in title for name in OWN_NAMES)
    own_list_mention = bool(re.search(r"[△,·]\s*인카금융서비스|\b인카금융서비스\(\d+억", text))
    industry_title = any(word in title for word in ("GA들", "초대형 GA", "GA ", "GA설계사", "1200% 룰", "1200%룰", "정착지원금"))
    return not own_in_title and (own_list_mention or industry_title)


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
    analysis_cache_hits = sum(1 for a in all_articles if a.get("_analysis_cache_applied"))
    ai_context_reviews = sum(1 for a in all_articles if a.get("_ai_context_reviewed"))
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
            "sponsorship": category_count.get("sponsorship", 0),
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
        "sponsorship_total": category_count.get("sponsorship", 0),
        "own_by_tone": {
            "positive": own_tone_count.get("positive", 0),
            "caution": own_tone_count.get("caution", 0),
            "neutral": own_tone_count.get("neutral", 0),
            "negative": own_tone_count.get("negative", 0),
        },
        "risk_level": calculate_risk_level(own_negative),
        "analysis_cache_hits": analysis_cache_hits,
        "ai_context_reviews": ai_context_reviews,
        "ai_context_budget": ai_context_budget(),
    }


def calculate_risk_level(own_negative: int) -> str:
    if own_negative >= 3:
        return "HIGH"
    if own_negative >= 1:
        return "MEDIUM"
    return "LOW"


GENERIC_SUMMARY_PHRASES = [
    "키워드 기준으로 수집된 기사입니다",
    "키워드로 수집되었습니다",
    "키워드로 수집됐습니다",
    "기사 원문만 요약되었습니다",
    "기준 핵심만 요약했습니다",
    "당사 직접 언급 기사입니다",
    "당사 직접 언급 기사로 보고서와 리스크 점검 근거",
    "경쟁사 키워드 기준",
    "정책·규제 변화가 영업 환경",
    "직접 부정은 아니지만 시장 평가",
    "시장 평가, 투자 의견, 규제성 신호",
    "보험사·GA 시장 흐름",
    "업계 동향 기사로 분리",
    "분석 대상에서 제외한 노이즈성 기사",
    "홍보 활용 가능성을 검토",
    "소비자 피해, 제재, 사칭, 법적 분쟁",
]


def build_quality_summary(article: dict) -> str:
    """Build a concise, non-generic summary for dashboard/report cards."""
    title = clean_summary_fragment(article.get("title", ""))
    body = "" if is_external_insurance_noise_article(article) else clean_summary_fragment(article.get("description", "") or article.get("summary", ""))
    contextual = [
        sentence
        for sentence in build_contextual_summary_sentences(article)
        if not is_unsupported_own_reference(article, sentence)
    ]
    sentences = [
        sentence
        for sentence in split_quality_sentences(body)
        if (
            sentence != title
            and not is_generic_quality_sentence(sentence)
            and not is_broken_quality_sentence(sentence)
            and not is_unsupported_own_reference(article, sentence)
        )
    ]
    fallback = "" if is_unsupported_own_reference(article, title) else headline_based_summary(title)
    candidates = [*contextual, *sentences] if len(contextual) >= 2 else [*contextual, *sentences, fallback]
    lines = unique_quality_sentences(candidates)
    return " ".join(ensure_summary_sentence(sentence) for sentence in lines[:3])


def headline_based_summary(title: str) -> str:
    clean = clean_summary_fragment(title)
    if not clean:
        return ""
    return ensure_summary_sentence(clean)


def clean_summary_fragment(value: object) -> str:
    text = str(value or "")
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;nbsp;", " ")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[[^\]]+\s+[^\]]*(?:기자|reporter)\]\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^[^\s]+ (?:기자|reporter)\s*=\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text.rstrip(".!? …")


def split_quality_sentences(value: object) -> list[str]:
    text = clean_summary_fragment(value)
    if not text:
        return []
    normalized = re.sub(r"([.!?])\s+", r"\1|", text)
    normalized = re.sub(r"(습니다|했습니다|합니다|됩니다|됐습니다|있습니다|없습니다|다|요|니다|함|됨)\s+", r"\1.|", normalized)
    return [
        clean_summary_fragment(chunk)
        for chunk in normalized.split("|")
        if len(clean_summary_fragment(chunk)) >= 8
    ]


def ensure_summary_sentence(value: str) -> str:
    text = clean_summary_fragment(value)
    if not text:
        return ""
    if re.search(r"([.!?]|다|요|함|됨)$", text):
        return text
    return f"{text}."


def is_generic_quality_sentence(value: object) -> bool:
    text = clean_summary_fragment(value)
    if not text or len(text) < 8:
        return True
    return any(phrase in text for phrase in GENERIC_SUMMARY_PHRASES)


def is_bad_cached_summary(value: object) -> bool:
    text = clean_summary_fragment(value)
    if not text:
        return True
    if len(text) > 240:
        return True
    if text.endswith("...") or text.endswith("…"):
        return True
    return is_generic_quality_sentence(text) or is_broken_quality_sentence(text)


def unique_quality_sentences(lines: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for line in lines:
        clean = clean_summary_fragment(line)
        if not clean or is_generic_quality_sentence(clean) or is_broken_quality_sentence(clean):
            continue
        if clean in seen:
            continue
        seen.add(clean)
        result.append(clean)
    return result


def is_broken_quality_sentence(value: object) -> bool:
    text = clean_summary_fragment(value)
    if not text or len(text) > 150:
        return True
    return bool(re.search(r"(대폭|위해|통해|으로|로|및|또한|이어|했고|하며|밝혀|설명|전했|강조)$", text))


def build_contextual_summary_sentences(article: dict) -> list[str]:
    lines: list[str] = []
    if is_competitor_brand_reputation_against_own(article):
        lines.append("경쟁사가 GA 브랜드평판 1위로 소개되고 인카금융서비스는 후순위 경쟁사로 언급된 평판 기사입니다")
        lines.append("인카 중심 성과 보도가 아니라 브랜드평판 순위 변화와 경쟁사 노출 흐름을 확인할 기사입니다")
    elif is_stock_volatility_article(article):
        lines.append("인카금융서비스 주가가 장중 급등해 변동성완화장치가 발동된 단기 시장 신호입니다")
        lines.append("직접 경영 이슈보다 거래량과 주가 변동성 관찰이 필요한 주가성 기사입니다")
    elif is_sales_conduct_article(article):
        lines.append("1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다")
        lines.append("소비자 피해, 불완전판매, 종신보험 판매 관행처럼 판매채널 관리 리스크를 확인해야 하는 기사입니다")
    elif is_own_consulting_profile_article(article):
        lines.append("인카금융서비스 Having사업단의 맞춤형 온라인 금융 컨설팅 사례를 소개한 인터뷰성 보도입니다")
        lines.append("보장성 보험을 노후 준비와 연결한 영업·컨설팅 메시지가 중심입니다")
    elif is_stock_disclosure_article(article):
        lines.append("인카금융서비스의 자사주, 배당 등 공시성 항목이 주식시장 주요공시 목록에 포함됐습니다")
        lines.append("주가 판단용으로는 공시 내용과 기준일, 규모를 별도 확인해야 하는 기사입니다")
    elif is_competitor_product_performance_article(article):
        lines.append("경쟁 보험사의 특약이 출시 이후 누적 가입 성과를 기록한 상품 반응 기사입니다")
        lines.append("상품 경쟁력과 보장 수요 흐름을 확인할 수 있는 경쟁사 동향으로 봅니다")
    elif is_brand_reputation_article(article):
        lines.append("손해보험사 브랜드평판 순위 변화와 소비자 인식 흐름을 다룬 기사입니다")
        lines.append("직접 리스크보다 경쟁사 브랜드 노출과 평판 추이를 관찰하는 자료로 봅니다")
    elif is_preventive_security_article(article):
        if is_own_article(article):
            lines.append("인카금융서비스가 포함된 GA의 금융보안원 가입 확대 내용입니다")
        lines.append("핵심은 해킹 사고 보도가 아니라 보안 점검과 피해 예방 체계 확대입니다")
    elif is_investment_downgrade_article(article):
        lines.append("증권가 투자의견이나 목표가 조정 등 시장 평가 변화가 기사 핵심입니다")
    elif is_settlement_support_caution_article(article):
        lines.append("GA별 정착지원금 지급 규모와 순위를 비교한 공시성 기사입니다")
    elif is_insurance_loss_context_article(article):
        lines.append("실손보험 계약, 손해율, 적자폭 변화가 중심인 보험업계 지표 기사입니다")
    return lines


def article_summary_text(article: dict) -> str:
    """Text for contextual classification.

    Use original article material only. Generated summaries can contain
    rule-based context from a different article cluster, so using them here can
    create a feedback loop where a product article becomes a policy article.
    """
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    description = (
        article.get("description")
        or raw.get("description")
        or raw.get("summary")
        or ""
    )
    return f"{article.get('title', '')} {description}"


def is_sales_conduct_article(article: dict) -> bool:
    text = article_summary_text(article)
    has_sales_risk = bool(re.search(r"불완전판매|소비자 피해|소비자보호|생보협회|손보협회|설계사 쟁탈전|쟁탈전|판매채널|보험업계 긴장|해소가 관건", text, re.I))
    has_product_sales_risk = bool(re.search(r"종신보험", text, re.I) and re.search(r"불완전판매|판매\s*관행|판매채널|해소가 관건|소비자\s*피해", text, re.I))
    return (has_sales_risk or has_product_sales_risk) and bool(
        re.search(r"GA|보험|설계사|생보|손보|협회|대리점", text, re.I)
    )


def is_stock_volatility_article(article: dict) -> bool:
    text = article_summary_text(article)
    return bool(re.search(r"VI 발동|변동성완화장치|주가 급등|주가 급락|\+\d+(?:\.\d+)?%|-\d+(?:\.\d+)?%", text, re.I)) and bool(
        re.search(r"인카금융|주가|조선비즈|Chosunbiz|증시|코스닥", text, re.I)
    )


def is_own_consulting_profile_article(article: dict) -> bool:
    text = article_summary_text(article)
    return bool(re.search(r"Having사업단|이화정|맞춤형 온라인 금융 컨설팅|온라인 금융 컨설팅|노후", text, re.I)) and bool(
        re.search(r"인카금융|금융 컨설팅|사업단", text, re.I)
    )


def is_stock_disclosure_article(article: dict) -> bool:
    text = article_summary_text(article)
    return bool(re.search(r"주식시장 주요공시|주요공시|자사주|현금배당|중간배당|공시", text, re.I)) and bool(
        re.search(r"인카금융|주식시장|공시|자사주|배당", text, re.I)
    )


def is_competitor_product_performance_article(article: dict) -> bool:
    text = article_summary_text(article)
    return bool(re.search(r"누적 가입|가입\s*\d|돌파|특약|출시|판매", text, re.I)) and bool(
        re.search(r"DB손해보험|KB손해보험|삼성화재|현대해상|한화생명|교보생명|보험", text, re.I)
    )


def is_brand_reputation_article(article: dict) -> bool:
    text = article_summary_text(article)
    return bool(re.search(r"브랜드평판|평판 판도|소비자 평판|브랜드 경쟁", text, re.I)) and bool(
        re.search(r"보험|손해보험|생명보험|금융", text, re.I)
    )


def is_competitor_brand_reputation_against_own(article: dict) -> bool:
    text = article_summary_text(article)
    if not re.search(r"브랜드평판|평판\s*랭킹|평판\s*순위", text, re.I):
        return False
    if not any(name in text for name in OWN_NAMES):
        return False
    competitor_names = r"한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋"
    competitor_first = re.search(
        rf"(?:({competitor_names})[^.。!?]{{0,45}}(?:1위|선두|탈환)|(?:1위|선두|탈환)[^.。!?]{{0,45}}({competitor_names}))",
        text,
        re.I,
    )
    own_first = re.search(
        r"인카금융(?:서비스)?\s*(?:가|은|는|,)?\s*(?:GA|독립 보험대리점|보험대리점|브랜드평판)?\s*(?:1위|선두|최고|최상위)",
        text,
    )
    if own_first and not competitor_first:
        return False
    own_follow = re.search(r"(?:인카금융(?:서비스)?[^.。!?]{0,45}(?:2위|뒤이어|초박빙|추격)|(?:2위|뒤이어|초박빙|추격)[^.。!?]{0,45}인카금융(?:서비스)?)", text)
    return bool(competitor_first and (own_follow or contains_own_name(text)))


def is_insurance_loss_context_article(article: dict) -> bool:
    text = article.get("title", "") + " " + article.get("description", "")
    return bool(re.search(r"실손|손해율|적자폭|보험 민원|민원", text)) and bool(re.search(r"보험|손보|생보|계약", text))
