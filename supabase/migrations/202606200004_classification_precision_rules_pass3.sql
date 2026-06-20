-- Classification precision pass 3.
-- Tighten remaining live false-positive families after pass 2 verification.

update public.monitor_context_rules
   set exclude_terms = array[
         '보험대리점', '법인보험대리점', '보험설계사', 'GA', '인카금융',
         '금융감독원', '금감원', '금융위원회', '금융위', '보험업법',
         '불완전판매', '보험사기', '실손', '손해율', '보험금 지급',
         '보험계약', '정착지원금', '1200%'
       ],
       memo = '손해보험/생명보험 같은 넓은 단어만으로 호르무즈·해운 보험료 기사를 살리지 않는다. 실제 보험/GA/규제 관리 문맥만 예외로 둔다.',
       updated_at = now()
 where rule_key = 'external_transport_insurance_fee_noise';

update public.monitor_context_rules
   set exclude_terms = array['보험주', '보험지수', '손해보험업종', '생명보험업종', '주주환원', '보험업종'],
       memo = '일반 증시 시황에서 보험사명이 종목 목록에만 들어간 경우 제외한다. 보험주·보험지수·보험업종 자체 분석이면 유지한다.',
       updated_at = now()
 where rule_key = 'stock_market_sector_listing_noise';

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
  'sports_sponsorship_incidental_noise',
  '스포츠 후원/파트너십 단순 노출 기사 제외',
  'exclude',
  'exclude',
  array['월드컵', '거리응원', '치킨집', '축구', '국가대표팀', '프로야구', 'KBO', '스포츠마케팅', '팬심', '팬덤', '하루틴', '골프청사진', '티샷', '공동 선두'],
  array['공식 파트너', '파트너', '캠페인', '후원', '협찬', '이모저모', '거리응원', '팬심', '팬덤', '티샷', '공동 선두', '라운드'],
  array['인카금융', '보험대리점', '법인보험대리점', '보험GA', 'GA', '보험설계사', '설계사', '1200%', '정착지원금', '불완전판매', '보험사기'],
  17,
  '보험사가 스포츠 파트너/후원사로 단순 노출된 기사 중 보험/GA 영업·규제 문맥이 없는 경우 제외한다.'
),
(
  'overseas_local_insurance_noise',
  '해외 현지 보험 조정사/클레임 홍보 기사 제외',
  'exclude',
  'exclude',
  array['미주중앙일보', 'JPA Adjusters', 'Adjusters & Associates', '어저스터', '침수·화재', '보험사가 놓친 피해', '미주', 'LA', '뉴욕'],
  array['미주중앙일보', 'JPA Adjusters', 'Adjusters & Associates', '어저스터', '침수·화재', '보험사가 놓친 피해', '미주', 'LA', '뉴욕'],
  array['인카금융', '국내 보험', '금융감독원', '금감원', '금융위원회', '금융위', 'GA', '보험대리점', '법인보험대리점', '실손', '1200%', '정착지원금'],
  18,
  '미주 현지 조정사·보험 클레임 홍보 기사는 국내 보험/GA 모니터링 대상에서 제외한다.'
),
(
  'foreign_macro_insurance_incidental_noise',
  '해외 거시경제 기사 내 보험사 단순 사례 제외',
  'exclude',
  'exclude',
  array['대만', '해외투자소득', '환율 안정', '해외서 돈 벌어도', '생명보험사를 중심으로 한 증권투자', '중앙은행', '수출업체'],
  array['대만', '해외투자소득', '환율 안정', '해외서 돈 벌어도', '생명보험사를 중심으로 한 증권투자', '중앙은행', '수출업체'],
  array['인카금융', '국내 보험', '보험대리점', '법인보험대리점', 'GA', '보험설계사', '실손', '1200%', '정착지원금', '불완전판매', '보험사기'],
  19,
  '해외 거시경제/환율 분석에서 보험사가 사례로만 언급된 기사는 제외한다.'
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
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(호르무즈|이란|통항|선박|해운|유조선|해협|중동|원유|해상 통항|해상|항만|항구|화물|물류|운임|항공|항로)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(보험 수수료|보험수수료|보험증권|보험 증권|통항 수수료|수수료 부과|보험료|보험료 부과|보험사|보험 가입 의무|유료 보험|보험 의무화|통항료|보험 제공|보험 업계)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험대리점|법인보험대리점|보험설계사|GA|인카금융|금융감독원|금감원|금융위원회|금융위|보험업법|불완전판매|보험사기|실손|손해율|보험금 지급|보험계약|정착지원금|1200%)'
),
own_sponsored_golf_photo_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(인카금융[[:space:]]*더[[:space:]]*헤븐[[:space:]]*마스터즈|인카금융[[:space:]]*더헤븐[[:space:]]*마스터즈|인카금융[[:space:]]*더[[:space:]]*헤븐|인카금융[[:space:]]*더헤븐|더헤븐CC)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(KLPGA|골프|라운드|[0-9]R|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|홀|선수|청사진|포토|감사합니다|시작합니다|응원 부탁)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(기부|확정형 기부|사회공헌|브랜드|협약|인카금융서비스가|인카금융서비스는|인카금융이|인카금융은|홍보|마케팅|ESG|후원|스폰서|주최)'
),
stock_market_listing_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(코스피|코스닥|공매도|지수선물|옵션|마감시황|장중[[:space:]]*최고치|하락[[:space:]]*출발|상승폭[[:space:]]*반납|순매수|업종별|테마별|등락률|52주|신저가|신고가)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(생명보험|손해보험|보험사|보험업종|보험지수|DB손해보험|삼성생명|한화생명|현대해상)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(보험주|보험지수|손해보험업종|생명보험업종|주주환원|보험업종|인카금융)'
),
sports_sponsorship_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(월드컵|거리응원|치킨집|축구|국가대표팀|프로야구|KBO|스포츠마케팅|팬심|팬덤|하루틴|골프청사진|티샷|공동[[:space:]]*선두)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(공식[[:space:]]*파트너|파트너|캠페인|후원|협찬|이모저모|거리응원|팬심|팬덤|티샷|공동[[:space:]]*선두|라운드)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(교보생명|KB금융|DB손해보험|손해보험|생명보험|보험업계|보험사)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|보험대리점|법인보험대리점|보험GA|GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기)'
),
overseas_local_insurance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(미주중앙일보|JPA[[:space:]]*Adjusters|Adjusters[[:space:]]*&[[:space:]]*Associates|어저스터|침수·화재|보험사가[[:space:]]*놓친[[:space:]]*피해|미주|LA|뉴욕)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|국내[[:space:]]*보험|금융감독원|금감원|금융위원회|금융위|GA|보험대리점|법인보험대리점|실손|1200%|정착지원금)'
),
foreign_macro_insurance_noise as (
  select id
  from public.news_articles
  where concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) ~* '(대만|해외투자소득|환율[[:space:]]*안정|해외서[[:space:]]*돈[[:space:]]*벌어도|생명보험사를[[:space:]]*중심으로[[:space:]]*한[[:space:]]*증권투자|중앙은행|수출업체)'
    and concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) !~* '(인카금융|국내[[:space:]]*보험|보험대리점|법인보험대리점|GA|보험설계사|실손|1200%|정착지원금|불완전판매|보험사기)'
),
noise as (
  select id, '해운·항공·화물 보험료/보험증권 기사' as reason from transport_insurance_noise
  union
  select id, '인카 골프대회 경기결과/포토 기사' as reason from own_sponsored_golf_photo_noise
  union
  select id, '증시 시황 내 보험업종 단순 나열 기사' as reason from stock_market_listing_noise
  union
  select id, '스포츠 후원/파트너십 단순 노출 기사' as reason from sports_sponsorship_noise
  union
  select id, '해외 현지 보험 조정사/클레임 홍보 기사' as reason from overseas_local_insurance_noise
  union
  select id, '해외 거시경제 기사 내 보험사 단순 사례' as reason from foreign_macro_insurance_noise
)
update public.news_articles a
   set category = 'other',
       tone = 'exclude',
       own_mentioned = false,
       negative_target = 'none',
       clipping_recommended = false,
       clipping_reason = '',
       classification_provider = 'rule_precision_noise_v5',
       classification_evidence = n.reason,
       classification_reason = n.reason || '로 보험/GA/당사 리스크 분석 대상에서 제외',
       updated_at = now()
  from noise n
 where a.id = n.id;
