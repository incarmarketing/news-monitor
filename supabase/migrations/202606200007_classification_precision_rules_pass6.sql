-- Pass 6: split company-relevant PR from event noise and market/ranking observations.

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
  'own_golf_event_logistics_noise',
  '인카 골프대회 관람·프로암·셔틀 안내 기사 제외',
  'exclude',
  'exclude',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['주차', '셔틀', '날씨', '관람 정보', '갤러리', '프로암', '이모저모', '러프', '웃음꽃'],
  array['후원', '스폰서', '브랜드', '기부', '사회공헌', 'ESG'],
  22,
  '당사명이 대회명에 포함되어도 초점이 관람 안내·교통·프로암·현장 이모저모이면 당사 보도/리스크 분석에서 제외한다.'
),
(
  'third_party_tournament_partner_marketing_noise',
  '인카 골프대회 내 제3 협찬사 마케팅 기사 제외',
  'exclude',
  'exclude',
  array['인카금융', '인카금융서비스', '인카금융 더헤븐', '인카금융 더 헤븐', '더헤븐CC'],
  array['하루틴', '팬심', '협찬사', '일상 침투'],
  array['인카금융서비스가', '인카금융서비스는', '인카금융이', '인카금융은', '후원 확대', '브랜드 홍보'],
  23,
  '대회 협찬사·제3 브랜드 마케팅이 기사 초점이면 당사명 노출만으로 당사 기사로 분류하지 않는다.'
),
(
  'settlement_support_list_observation',
  '정착지원금·1200%룰 순위표형 당사 단순 언급',
  'regulation',
  'caution',
  array['정착지원금', '1200% 룰', '1200%룰', 'GA설계사', '초대형 GA', '설계사 유치', '판매수수료'],
  array['인카금융서비스', '보험GA협회', '정보공시', 'GA'],
  array['인카금융서비스 정착지원금 관련 불완전판매', '불완전판매 조사', '내부통제 위반', '제재', '적발'],
  24,
  '당사가 순위표·금액 비교에 단순 포함된 경우 당사 직접 이슈가 아니라 판매채널/정책 관찰로 분리한다.'
),
(
  'competitor_brand_reputation_against_own',
  '경쟁사 1위 브랜드평판 기사 내 당사 후순위 언급',
  'competitor',
  'caution',
  array['브랜드평판', '평판 랭킹', '평판 순위'],
  array['인카금융', '인카금융서비스', '한화생명금융서비스', '에이플러스에셋', '피플라이프', '지에이코리아', '글로벌금융판매'],
  array['인카금융 1위', '인카금융서비스 1위', '인카금융 선두', '인카금융서비스 선두'],
  25,
  '경쟁사가 브랜드평판 1위이고 당사는 2위·후순위·초박빙으로 언급된 경우 당사 긍정이 아니라 경쟁사/시장 관찰로 분리한다.'
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

with source_rows as (
  select
    id,
    coalesce(title, '') as title,
    concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) as haystack
  from public.news_articles
),
own_golf_event_noise as (
  select id
  from source_rows
  where haystack ~* '(인카금융|인카금융서비스|인카금융[[:space:]]*더헤븐|인카금융[[:space:]]*더[[:space:]]*헤븐|더헤븐CC)'
    and title ~* '(주차|셔틀|날씨|관람[[:space:]]*정보|갤러리|프로암|이모저모|러프|웃음꽃)'
    and title !~* '(후원|스폰서|브랜드|기부|사회공헌|ESG|확정형[[:space:]]*기부)'
),
third_party_partner_noise as (
  select id
  from source_rows
  where haystack ~* '(인카금융|인카금융서비스|인카금융[[:space:]]*더헤븐|인카금융[[:space:]]*더[[:space:]]*헤븐|더헤븐CC)'
    and title ~* '(하루틴|팬심|협찬사|일상[[:space:]]*침투)'
    and title !~* '(인카금융|인카금융서비스)'
),
noise as (
  select id, '인카 골프대회 관람·프로암·셔틀 안내 기사' as reason from own_golf_event_noise
  union
  select id, '인카 골프대회 내 제3 협찬사 마케팅 기사' as reason from third_party_partner_noise
),
noise_updated as (
  update public.news_articles a
     set category = 'other',
         tone = 'exclude',
         own_mentioned = false,
         negative_target = 'none',
         clipping_recommended = false,
         clipping_reason = '',
         classification_provider = 'rule_precision_noise_v8',
         classification_evidence = n.reason,
         classification_reason = n.reason || '로 당사 보도/리스크 분석 대상에서 제외',
         updated_at = now()
    from noise n
   where a.id = n.id
  returning a.id
),
settlement_support_list as (
  select id
  from source_rows
  where haystack ~* '(정착지원금|1200%[[:space:]]*룰|1200%룰|GA설계사|초대형[[:space:]]*GA|설계사[[:space:]]*유치|판매수수료)'
    and haystack ~* '(인카금융서비스|인카금융)'
    and title !~* '(인카금융|인카금융서비스)'
    and haystack !~* '(인카금융서비스[[:space:]]*정착지원금[[:space:]]*관련[[:space:]]*불완전판매|불완전판매[[:space:]]*조사|내부통제[[:space:]]*위반|제재|적발)'
),
settlement_updated as (
  update public.news_articles a
     set category = 'regulation',
         tone = 'caution',
         own_mentioned = true,
         negative_target = 'none',
         classification_provider = 'rule_precision_reclass_v8',
         classification_evidence = '정착지원금·1200%룰 순위표형 당사 단순 언급',
         classification_reason = '당사가 순위표·금액 비교에 단순 포함된 기사로 판매채널/정책 관찰로 분리',
         updated_at = now()
    from settlement_support_list s
   where a.id = s.id
  returning a.id
),
brand_reputation_against_own as (
  select id
  from source_rows
  where haystack ~* '(브랜드평판|평판[[:space:]]*랭킹|평판[[:space:]]*순위)'
    and haystack ~* '(인카금융|인카금융서비스)'
    and haystack ~* '(한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋).{0,35}(1위|선두|탈환)'
    and haystack ~* '(인카금융|인카금융서비스).{0,45}(2위|뒤이어|초박빙|추격)|(2위|뒤이어|초박빙|추격).{0,45}(인카금융|인카금융서비스)'
    and haystack !~* '(인카금융|인카금융서비스).{0,35}(1위|선두|최고|최상위)'
),
brand_updated as (
  update public.news_articles a
     set category = 'competitor',
         tone = 'caution',
         own_mentioned = true,
         negative_target = 'none',
         classification_provider = 'rule_precision_reclass_v8',
         classification_evidence = '경쟁사 1위 브랜드평판 기사 내 당사 후순위 언급',
         classification_reason = '경쟁사가 브랜드평판 1위이고 당사는 후순위로 언급된 기사로 당사 긍정이 아닌 경쟁사/시장 관찰로 분리',
         updated_at = now()
    from brand_reputation_against_own b
   where a.id = b.id
  returning a.id
)
select
  (select count(*) from noise_updated) as noise_reclassified,
  (select count(*) from settlement_updated) as settlement_reclassified,
  (select count(*) from brand_updated) as brand_reclassified;
