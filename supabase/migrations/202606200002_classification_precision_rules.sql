-- Classification precision round: reduce broad keyword false positives.
-- The dashboard can still display raw collected rows, but these rules keep
-- risk/report classification focused on insurance, GA, company, and policy
-- contexts rather than same-word noise.

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
  'own_sponsored_golf_scoreboard_noise',
  '인카 골프대회 경기결과/포토 기사 제외',
  'exclude',
  'exclude',
  array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈', 'KLPGA', '골프', '라운드', '티샷', '버디', '이글', '스윙', '선두', '공동', '순위', '우승', '상금', '언더파', '타수', '선수'],
  array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈'],
  array['기부', '확정형 기부', '사회공헌', '브랜드', '협약', '인카금융서비스가', '인카금융서비스는', '인카금융이', '인카금융은', '홍보', '마케팅', 'ESG'],
  3,
  '당사명이 포함된 대회명이라도 경기 순위·포토·선수 플레이 중심 기사는 기업 PR/리스크 분류에서 제외한다. 기부·후원·브랜드 스토리는 제외하지 않는다.'
),
(
  'external_transport_insurance_fee_noise',
  '해운·항공·화물 보험료/보험증권 오탐 제외',
  'exclude',
  'exclude',
  array['호르무즈', '호르무즈 해협', '이란', '통항', '선박', '해운', '유조선', '해협', '중동', '원유', '해상 통항', '해상', '항만', '항구', '화물', '물류', '운임', '항공', '항로'],
  array['보험 수수료', '보험수수료', '보험증권', '보험 증권', '통항 수수료', '수수료 부과', '보험료', '보험료 부과', '보험 가입 의무'],
  array['생명보험', '손해보험', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '인카금융', '금융감독원', '금감원', '금융위원회', '금융위', '보험업법', '불완전판매', '보험사기', '실손', '손해율', '보험금', '해상보험'],
  4,
  '보험이라는 단어가 해운·항공·화물 비용/증권 의미로 쓰인 기사는 보험사·GA 분석 대상이 아니므로 제외한다.'
),
(
  'stock_watchlist_own_name_noise',
  '상장사 시세 목록 내 당사 단순 포함 제외',
  'exclude',
  'exclude',
  array['52주 최저가', '52주 최고가', '장중 신저가', '장중 신고가', '강세 토픽', '약세 토픽', '특징주', 'MVP 상위', '상위 10선', '오전 이슈 [보험]'],
  array['인카금융', '인카금융서비스'],
  array['투자의견', '목표주가', '목표가', '증권가', '리포트', '애널리스트', '자사주', '배당', '공시'],
  5,
  '종목 나열형 기사에 인카금융서비스가 포함된 것만으로 당사 기사나 시장 리스크로 보지 않는다. 투자의견·공시 등 본문 이슈가 있으면 제외하지 않는다.'
),
(
  'general_finance_without_insurance_context_noise',
  '보험/GA 문맥 없는 일반 금융시장 기사 제외',
  'exclude',
  'exclude',
  array['한양증권', '중앙일보', '하나은행', '어음', '최종부도', '부도 처리', '워크아웃', '환율', '외환시장', '코스피', '코스닥', '사이드카', '채권시장', '증권사'],
  array['한양증권', '중앙일보', '하나은행', '어음', '최종부도', '부도 처리', '워크아웃', '환율', '외환시장', '코스피', '코스닥', '사이드카', '채권시장', '증권사'],
  array['인카금융', '생명보험', '손해보험', '보험사', '보험회사', '보험업계', '보험상품', '보험계약', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '보험GA', '설계사', '보험업법', '불완전판매', '보험사기', '보험금', '보험료', '실손', '손해율', '판매채널', '보장', '민원', '소비자보호', '금융소비자', '1200%', '정착지원금', '금감원', '금융감독원', '금융위', '금융위원회'],
  6,
  '증권·환율·워크아웃 등 일반 금융시장 기사는 보험/GA/당국 문맥이 없으면 보험 모니터링 대상에서 제외한다.'
),
(
  'admin_agency_without_insurance_context_noise',
  '보험/GA 문맥 없는 일반 행정·공공기관 기사 제외',
  'exclude',
  'exclude',
  array['선관위', '선거관리위원회', '정부 위원회', '위원회 수당', '셀프증액', '공공기관 경영평가', '금융 공공기관 경영평가', '예금보험공사', '주택금융공사', '주금공', '신용보증기금', '신보'],
  array['선관위', '선거관리위원회', '정부 위원회', '위원회 수당', '셀프증액', '공공기관 경영평가', '금융 공공기관 경영평가', '예금보험공사', '주택금융공사', '주금공', '신용보증기금', '신보'],
  array['인카금융', '생명보험', '손해보험', '보험사', '보험회사', '보험업계', '보험상품', '보험계약', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '보험GA', '설계사', '보험업법', '불완전판매', '보험사기', '보험금', '보험료', '실손', '손해율', '판매채널', '보장', '민원', '소비자보호', '금융소비자', '1200%', '정착지원금', '금감원', '금융감독원'],
  7,
  '금융위원회 산하·위원회라는 표현만 있는 일반 행정/공공기관 기사는 보험/GA 정책 분석 대상에서 제외한다.'
),
(
  'public_health_insurance_without_private_context_noise',
  '민영보험 문맥 없는 공공 건강보험 기사 제외',
  'exclude',
  'exclude',
  array['국민건강보험공단', '건강보험공단', '복지부', '보건복지부', '건강보험 부당 청구', '가짜진료', '요양급여', '진료행위', '환수 금액', '신고 포상금'],
  array['국민건강보험공단', '건강보험공단', '복지부', '보건복지부', '건강보험 부당 청구', '가짜진료', '요양급여', '진료행위', '환수 금액', '신고 포상금'],
  array['인카금융', '생명보험', '손해보험', '보험사', '보험회사', '보험업계', '보험상품', '보험계약', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '보험GA', '설계사', '보험업법', '보험사기', '보험금', '보험료', '실손', '손해율', '판매채널', '1200%', '정착지원금'],
  8,
  '국민건강보험·복지부 중심의 공공의료 보험 기사는 민영 보험사/GA/실손/보험사기 문맥이 없으면 제외한다.'
),
(
  'non_insurance_investment_misconduct_noise',
  '보험 문맥 없는 증권·투자 불완전판매 기사 제외',
  'exclude',
  'exclude',
  array['미래에셋', '미래에셋증권', '스페이스X', '전문투자자', '사채관리회사', '회사채', '채권자', '증권사', '금융투자', 'ELS', '홍콩ELS', '공모펀드'],
  array['불완전판매', '내부통제', '고객보호', '투자자 보호', '전문투자자', '회사채', '사채관리회사', '미배정', '제재'],
  array['인카금융', '생명보험', '손해보험', '보험사', '보험회사', '보험업계', '보험상품', '보험계약', '보험대리점', '법인보험대리점', '보험설계사', 'GA', '보험GA', '설계사', '보험업법', '보험사기', '보험금', '보험료', '실손', '손해율', '판매채널', '1200%', '정착지원금'],
  9,
  '불완전판매라도 증권·투자상품 문맥만 있고 보험/GA 문맥이 없으면 보험 모니터링 대상에서 제외한다.'
),
(
  'ambiguous_mega_competitor_homonym_noise',
  '메가금융서비스 동음이의 브랜드 기사 제외',
  'exclude',
  'exclude',
  array['메가박스', '메가박스중앙', '메가커피', '메가MGC', '메가스터디', '메가 히트', '메가 런치', '메가 세일', '메가 이벤트'],
  array['메가박스', '메가박스중앙', '메가커피', '메가MGC', '메가스터디', '메가 히트', '메가 런치', '메가 세일', '메가 이벤트'],
  array['메가금융서비스', '보험대리점', '법인보험대리점', '보험설계사', '보험GA', 'GA', '손해보험', '생명보험'],
  10,
  '메가 키워드는 메가금융서비스 보정용이며, 영화관·커피·교육 브랜드 문맥이면 경쟁사 기사에서 제외한다.'
),
(
  'sports_referee_insurance_agent_occupation_noise',
  '스포츠 심판 직업 설명 보험설계사 기사 제외',
  'exclude',
  'exclude',
  array['손흥민', '이강인', '축구', '월드컵', 'A매치', '옐로카드', '레드카드', '퇴장', '주심', '심판', '파울', '경고', 'PSG', '파리생제르맹'],
  array['보험설계사로 알려진', '보험설계사인', '보험설계사라는'],
  array['보험대리점', '법인보험대리점', '보험GA', 'GA', '생명보험', '손해보험', '보험회사', '보험업계', '보험상품', '보험계약', '불완전판매', '보험사기'],
  11,
  '스포츠 기사에서 심판·주심 직업으로 보험설계사가 언급된 경우는 보험업계 기사로 분류하지 않는다.'
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

update public.monitor_keywords
   set match_mode = 'context',
       context_terms = array['보험회사', '보험상품', '보험계약', '보험금', '손해율', '실손', '생명보험', '손해보험', '보험대리점', '법인보험대리점', 'GA', '설계사', '금감원', '금융감독원', '금융위', '금융위원회', '보험업법', '불완전판매', '판매채널', '보장', '계약'],
       exclude_terms = array['호르무즈', '이란', '통항', '선박', '해운', '유조선', '해협', '중동', '원유', '해상 통항', '항만', '항구', '화물', '물류', '운임', '항공', '항로', '프로야구', '프로농구', '프로배구', '골프', '포토', '후원', '스폰서십'],
       memo = '보험사 일반 키워드는 보험회사·상품·감독·판매채널 문맥에서만 인정하고 해운/항공 보험료·스포츠 후원 노이즈는 제외',
       updated_at = now()
 where keyword = '보험사'
   and category = 'industry';

update public.monitor_keywords
   set match_mode = 'context',
       context_terms = array['보험회사', '보험상품', '보험계약', '보험금', '손해율', '실손', '생명보험', '손해보험', '보험대리점', '법인보험대리점', 'GA', '설계사', '금감원', '금융감독원', '금융위', '금융위원회', '보험업법', '불완전판매', '판매채널', '보장', '계약'],
       exclude_terms = array['호르무즈', '이란', '통항', '선박', '해운', '유조선', '해협', '중동', '원유', '해상 통항', '항만', '항구', '화물', '물류', '운임', '항공', '항로', '프로야구', '프로농구', '프로배구', '골프', '포토', '후원', '스폰서십'],
       memo = '생명보험/손해보험 키워드는 보험업 본문 문맥에서만 산업 기사로 인정',
       updated_at = now()
 where keyword in ('생명보험', '손해보험')
   and category = 'industry';

with golf_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(인카금융[[:space:]]*더[[:space:]]*헤븐[[:space:]]*마스터즈|인카금융[[:space:]]*더헤븐[[:space:]]*마스터즈)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(KLPGA|골프|라운드|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|선수|홀에서)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(기부|확정형 기부|사회공헌|브랜드|협약|인카금융서비스가|인카금융서비스는|인카금융이|인카금융은|홍보|마케팅|ESG)'
),
transport_insurance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(호르무즈|이란|통항|선박|해운|유조선|해협|중동|원유|해상 통항|해상|항만|항구|화물|물류|운임|항공|항로)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험 수수료|보험수수료|보험증권|보험 증권|통항 수수료|수수료 부과|보험료|보험료 부과|보험 가입 의무)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|GA|인카금융|금융감독원|금감원|금융위원회|금융위|보험업법|불완전판매|보험사기|실손|손해율|보험금|해상보험)'
),
stock_watchlist_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(인카금융|인카금융서비스)'
    and title ~* '(52주 최저가|52주 최고가|장중 신저가|장중 신고가|강세 토픽|약세 토픽|특징주|MVP 상위|상위 10선|오전 이슈 \\[보험\\])'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(투자의견|목표주가|목표가|증권가|리포트|애널리스트|자사주|배당|공시)'
),
general_finance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(한양증권|중앙일보|하나은행|어음|최종부도|부도[[:space:]]*처리|워크아웃|환율|외환시장|코스피|코스닥|사이드카|채권시장|증권사)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원|금융위|금융위원회)'
),
admin_agency_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(선관위|선거관리위원회|정부[[:space:]]*위원회|위원회[[:space:]]*수당|셀프증액|공공기관[[:space:]]*경영평가|금융[[:space:]]*공공기관[[:space:]]*경영평가|예금보험공사|주택금융공사|주금공|신용보증기금|신보)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원)'
),
public_health_insurance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(국민건강보험공단|건강보험공단|복지부|보건복지부|건강보험[[:space:]]*부당[[:space:]]*청구|가짜진료|요양급여|진료행위|환수[[:space:]]*금액|신고[[:space:]]*포상금)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금)'
),
non_insurance_investment_misconduct_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(미래에셋|미래에셋증권|스페이스X|전문투자자|사채관리회사|회사채|채권자|증권사|금융투자|ELS|홍콩ELS|공모펀드)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(불완전판매|내부통제|고객보호|투자자[[:space:]]*보호|전문투자자|회사채|사채관리회사|미배정|제재)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금)'
),
ambiguous_mega_homonym_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(메가박스|메가박스중앙|메가커피|메가MGC|메가스터디|메가[[:space:]]*히트|메가[[:space:]]*런치|메가[[:space:]]*세일|메가[[:space:]]*이벤트)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(메가금융서비스|보험대리점|법인보험대리점|보험설계사|보험GA|GA|손해보험|생명보험)'
),
sports_referee_insurance_agent_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(손흥민|이강인|축구|월드컵|A매치|옐로카드|레드카드|퇴장|주심|심판|파울|경고|PSG|파리생제르맹)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험설계사로[[:space:]]*알려진|보험설계사인|보험설계사라는)'
    and concat_ws(' ', title, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험대리점|법인보험대리점|보험GA|GA|생명보험|손해보험|보험회사|보험업계|보험상품|보험계약|불완전판매|보험사기)'
),
noise as (
  select id, '인카 골프대회 경기결과/포토 기사' as reason from golf_noise
  union
  select id, '해운·항공·화물 보험료/보험증권 기사' as reason from transport_insurance_noise
  union
  select id, '상장사 시세 목록 내 당사 단순 포함' as reason from stock_watchlist_noise
  union
  select id, '보험/GA 문맥 없는 일반 금융시장 기사' as reason from general_finance_noise
  union
  select id, '보험/GA 문맥 없는 일반 행정·공공기관 기사' as reason from admin_agency_noise
  union
  select id, '민영보험 문맥 없는 공공 건강보험 기사' as reason from public_health_insurance_noise
  union
  select id, '보험 문맥 없는 증권·투자 불완전판매 기사' as reason from non_insurance_investment_misconduct_noise
  union
  select id, '메가금융서비스 동음이의 브랜드 기사' as reason from ambiguous_mega_homonym_noise
  union
  select id, '스포츠 심판 직업 설명 보험설계사 기사' as reason from sports_referee_insurance_agent_noise
)
update public.news_articles a
   set category = 'other',
       tone = 'exclude',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_precision_noise_v3',
       classification_evidence = n.reason,
       classification_reason = n.reason || '로 보험/GA/당사 리스크 분석 대상에서 제외',
       updated_at = now()
  from noise n
 where a.id = n.id;
