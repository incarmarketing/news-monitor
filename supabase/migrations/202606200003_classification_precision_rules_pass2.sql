-- Classification precision pass 2: keep tightening recurring false positives
-- found in live DB after the first precision migration.

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  priority,
  memo
) values
(
  'external_transport_insurance_fee_noise',
  '해운·항공·화물 보험료/보험증권 오탐 제외',
  'exclude',
  'exclude',
  array['호르무즈', '호르무즈 해협', '이란', '통항', '선박', '해운', '유조선', '해협', '중동', '원유', '해상 통항', '해상', '항만', '항구', '화물', '물류', '운임', '항공', '항로'],
  array['보험 수수료', '보험수수료', '보험증권', '보험 증권', '통항 수수료', '수수료 부과', '보험료', '보험료 부과', '보험 가입 의무', '유료 보험', '보험 의무화', '통항료', '보험 제공', '보험 업계'],
  array['생명보험', '손해보험', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '인카금융', '금융감독원', '금감원', '금융위원회', '금융위', '보험업법', '불완전판매', '보험사기', '실손', '손해율', '보험금', '해상보험'],
  4,
  '보험이라는 단어가 해운·항공·화물 비용/증권/통항료 의미로 쓰인 기사는 보험사·GA 분석 대상이 아니므로 제외한다.'
),
(
  'own_sponsored_golf_scoreboard_noise',
  '인카 골프대회 경기결과/포토 기사 제외',
  'exclude',
  'exclude',
  array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈', '인카금융서비스 더헤븐 마스터즈', '인카금융 더 헤븐', '인카금융 더헤븐', '더헤븐CC', '더 헤븐', 'KLPGA', '골프', '라운드', '티샷', '버디', '이글', '스윙', '선두', '공동', '순위', '우승', '상금', '언더파', '타수', '선수'],
  array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈', '인카금융 더 헤븐', '인카금융 더헤븐', '더헤븐CC'],
  array['기부', '확정형 기부', '사회공헌', '브랜드', '협약', '인카금융서비스가', '인카금융서비스는', '인카금융이', '인카금융은', '홍보', '마케팅', 'ESG'],
  3,
  '당사명이 포함된 대회명이라도 경기 순위·포토·선수 플레이 중심 기사는 기업 PR/리스크 분류에서 제외한다. 기부·후원·브랜드·마케팅 스토리는 제외하지 않는다.'
),
(
  'general_finance_without_insurance_context_noise',
  '보험/GA 문맥 없는 일반 금융시장 기사 제외',
  'exclude',
  'exclude',
  array['한양증권', '중앙일보', '하나은행', '어음', '최종부도', '부도 처리', '워크아웃', '환율', '외환시장', '코스피', '코스닥', '사이드카', '채권시장', '증권사'],
  array['한양증권', '중앙일보', '하나은행', '어음', '최종부도', '부도 처리', '워크아웃', '환율', '외환시장', '코스피', '코스닥', '사이드카', '채권시장', '증권사'],
  array['인카금융', '생명보험', '손해보험', '보험사', '보험회사', '보험업계', '보험상품', '보험계약', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '보험GA', '설계사', '보험업법', '보험사기', '보험금', '보험료', '실손', '손해율', '판매채널', '보장', '민원', '소비자보호', '금융소비자', '1200%', '정착지원금', '금감원', '금융감독원', '금융위', '금융위원회'],
  6,
  '증권·환율·워크아웃 등 일반 금융시장 기사는 보험/GA/당국 문맥이 없으면 보험 모니터링 대상에서 제외한다. 불완전판매 단어만으로 보험 문맥으로 보지 않는다.'
),
(
  'stock_market_sector_listing_noise',
  '증시 시황 내 보험업종 단순 나열 제외',
  'exclude',
  'exclude',
  array['코스피', '코스닥', '공매도', '지수선물', '옵션', '마감시황', '장중 최고치', '하락 출발', '상승폭 반납', '순매수', '업종별', '테마별', '등락률'],
  array['생명보험', '손해보험', '보험사', '보험업종', '보험지수'],
  array['보험주', '보험지수', '삼성생명', 'DB손해보험', '한화생명', '현대해상', '손해보험업종', '생명보험업종', '주주환원', '보험업종'],
  12,
  '일반 증시 시황에서 생명보험/손해보험이 업종명으로만 나열된 기사는 보험업계 동향에서 제외한다. 보험주·보험지수 자체가 중심이면 유지한다.'
),
(
  'entertainment_marketing_homonym_noise',
  '프로야구·뮤지컬·통신사 마케팅 오탐 제외',
  'exclude',
  'exclude',
  array['KT', '위즈파크', '뮤지컬', '그날들', '캠핑존', '초청', '충성 고객', '프로야구 시즌', '장기 고객', '콘서트', '팬미팅'],
  array['KT', '위즈파크', '뮤지컬', '그날들', '캠핑존', '초청', '충성 고객', '프로야구 시즌', '장기 고객', '콘서트', '팬미팅'],
  array['인카금융', '보험', 'GA', '법인보험대리점', '보험대리점', '설계사'],
  13,
  '프로야구·공연·통신사 멤버십 마케팅 기사는 보험/GA 문맥이 없으면 경쟁사/업계 기사에서 제외한다.'
),
(
  'celebrity_insurance_agent_profile_noise',
  '연예인 보험설계사 근황 기사 제외',
  'exclude',
  'exclude',
  array['조민아', '쥬얼리', '서인영', '셀럽', '싱글맘', '인스타그램', 'SNS', '좋아요', '보험왕', '연예인', '가수', '방송인'],
  array['보험 설계사', '보험설계사', '보험왕', 'MVP', 'QUEEN', '수상', '근황'],
  array['보험대리점', '법인보험대리점', 'GA', '보험GA', '영업조직', '불완전판매', '소비자보호', '보험업계'],
  14,
  '연예인 개인 근황으로 보험설계사 활동이 언급된 기사는 보험업계 동향에서 제외한다.'
),
(
  'political_media_digest_incidental_insurance_noise',
  '정치·신문 사설 기사 내 보험 문장 단순 혼입 제외',
  'exclude',
  'exclude',
  array['지지율', '국힘', '민주당', '부정선거론', '민심', '정치권', '선거', '대통령', '신문 사설', '데스크 칼럼'],
  array['지지율', '국힘', '민주당', '부정선거론', '민심', '정치권', '선거', '대통령', '신문 사설', '데스크 칼럼'],
  array['인카금융', '보험대리점', '법인보험대리점', 'GA', '보험GA', '생명보험', '손해보험', '보험사기', '보험금', '실손', '1200%', '정착지원금'],
  15,
  '정치·신문 사설 기사에 보험업계 문장이 일부 섞인 경우 보험/GA 기사로 분류하지 않는다.'
),
(
  'community_event_attendee_insurer_noise',
  '지역 행사 참석자 명단 내 보험사 인물 단순 언급 제외',
  'exclude',
  'exclude',
  array['도민회', '향우회', '이·취임식', '취임식', '축하연', '당선인', '지방선거', '구청장', '도의원', '주요 인사', '자리를 빛냈'],
  array['도민회', '향우회', '이·취임식', '취임식', '축하연', '당선인', '지방선거', '구청장', '도의원', '주요 인사', '자리를 빛냈'],
  array['보험상품', '보험계약', '보험금', '보험료', '손해율', '실손', '보험사기', '업무협약', '캠페인', '출시', '판매', '소비자보호', '인카금융'],
  16,
  '지역 행사 참석자 명단에 보험사 인물이 포함된 것만으로 보험업계 동향으로 보지 않는다.'
)
on conflict (rule_key) do update
set label = excluded.label,
    category = excluded.category,
    tone = excluded.tone,
    trigger_terms = excluded.trigger_terms,
    required_terms = excluded.required_terms,
    exclude_terms = excluded.exclude_terms,
    priority = excluded.priority,
    memo = excluded.memo,
    enabled = true,
    updated_at = now();

with transport_insurance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(호르무즈|이란|통항|선박|해운|유조선|해협|중동|원유|해상 통항|해상|항만|항구|화물|물류|운임|항공|항로)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험 수수료|보험수수료|보험증권|보험 증권|통항 수수료|수수료 부과|보험료|보험료 부과|보험 가입 의무|유료 보험|보험 의무화|통항료|보험 제공|보험 업계)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|GA|인카금융|금융감독원|금감원|금융위원회|금융위|보험업법|불완전판매|보험사기|실손|손해율|보험금|해상보험)'
),
golf_scoreboard_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(인카금융[[:space:]]*더[[:space:]]*헤븐[[:space:]]*마스터즈|인카금융[[:space:]]*더헤븐[[:space:]]*마스터즈|인카금융[[:space:]]*더[[:space:]]*헤븐|인카금융[[:space:]]*더헤븐|더헤븐CC)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(KLPGA|골프|라운드|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|선수|홀에서)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(기부|확정형 기부|사회공헌|브랜드|협약|인카금융서비스가|인카금융서비스는|인카금융이|인카금융은|홍보|마케팅|ESG)'
),
general_finance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(한양증권|중앙일보|하나은행|어음|최종부도|부도[[:space:]]*처리|워크아웃|환율|외환시장|코스피|코스닥|사이드카|채권시장|증권사)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원|금융위|금융위원회)'
),
stock_market_sector_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(코스피|코스닥|공매도|지수선물|옵션|마감시황|장중[[:space:]]*최고치|하락[[:space:]]*출발|상승폭[[:space:]]*반납|순매수|업종별|테마별|등락률)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(생명보험|손해보험|보험사|보험업종|보험지수)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험주|보험지수|삼성생명|DB손해보험|한화생명|현대해상|손해보험업종|생명보험업종|주주환원|보험업종)'
),
entertainment_marketing_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(KT|위즈파크|뮤지컬|그날들|캠핑존|초청|충성[[:space:]]*고객|프로야구[[:space:]]*시즌|장기[[:space:]]*고객|콘서트|팬미팅)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|보험|GA|법인보험대리점|보험대리점|설계사)'
),
celebrity_insurance_agent_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(조민아|쥬얼리|서인영|셀럽|싱글맘|인스타그램|SNS|좋아요|보험왕|연예인|가수|방송인)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험[[:space:]]*설계사|보험왕|MVP|QUEEN|수상|근황)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험대리점|법인보험대리점|GA|보험GA|영업조직|불완전판매|소비자보호|보험업계)'
),
political_media_digest_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(지지율|국힘|민주당|부정선거론|민심|정치권|선거|대통령|신문[[:space:]]*사설|데스크[[:space:]]*칼럼)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|보험대리점|법인보험대리점|GA|보험GA|생명보험|손해보험|보험사기|보험금|실손|1200%|정착지원금)'
),
community_event_attendee_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(도민회|향우회|이·취임식|취임식|축하연|당선인|지방선거|구청장|도의원|주요[[:space:]]*인사|자리를[[:space:]]*빛냈)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험상품|보험계약|보험금|보험료|손해율|실손|보험사기|업무협약|캠페인|출시|판매|소비자보호|인카금융)'
),
noise as (
  select id, '해운·항공·화물 보험료/보험증권 기사' as reason from transport_insurance_noise
  union
  select id, '인카 골프대회 경기결과/포토 기사' as reason from golf_scoreboard_noise
  union
  select id, '보험/GA 문맥 없는 일반 금융시장 기사' as reason from general_finance_noise
  union
  select id, '증시 시황 내 보험업종 단순 나열 기사' as reason from stock_market_sector_noise
  union
  select id, '프로야구·공연·통신사 마케팅 기사' as reason from entertainment_marketing_noise
  union
  select id, '연예인 보험설계사 근황 기사' as reason from celebrity_insurance_agent_noise
  union
  select id, '정치·신문 사설 기사 내 보험 문장 단순 혼입' as reason from political_media_digest_noise
  union
  select id, '지역 행사 참석자 명단 내 보험사 인물 단순 언급' as reason from community_event_attendee_noise
)
update public.news_articles a
   set category = 'other',
       tone = 'exclude',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_precision_noise_v4',
       classification_evidence = n.reason,
       classification_reason = n.reason || '로 보험/GA/당사 리스크 분석 대상에서 제외',
       updated_at = now()
  from noise n
 where a.id = n.id;
