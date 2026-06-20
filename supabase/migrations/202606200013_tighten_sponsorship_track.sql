-- Pass 12: tighten sponsorship matching after adding the brand/sponsorship track.
-- Keep actual company-hosted/sponsored event coverage, but restore GA/business articles
-- that were over-captured by broad terms such as "선두" or "후원".

update public.monitor_context_rules
   set trigger_terms = array['인카금융 더헤븐 마스터즈', '인카금융 더 헤븐 마스터즈', '인카금융서비스 더헤븐 마스터즈', '인카금융 더 헤븐', '인카금융 더헤븐', '더헤븐CC', 'KLPGA', '골프', '마스터즈', '라운드', '티샷', '버디', '이글', '스윙', '언더파', '타수', '선수', '프로암', '갤러리', '관람', '협찬사'],
       required_terms = array['인카금융'],
       memo = '당사 주최 골프대회 관련 경기·운영·포토성 보도만 브랜드/스폰서십 트랙으로 보존한다. 선두/순위/후원 같은 단독 단어는 GA 실적·브랜드평판과 충돌하므로 제외한다.',
       updated_at = now()
 where rule_key = 'own_sponsored_golf_scoreboard_noise';

with candidates as (
  select
    id,
    concat_ws(' ', title, source, summary, raw->>'title', raw->>'description', raw->>'summary', keyword) as haystack
  from public.news_articles
  where category = 'sponsorship'
),
valid_sponsorship as (
  select id
  from candidates
  where haystack ~* '(인카금융[[:space:]]*더[[:space:]]*헤븐|인카금융[[:space:]]*더헤븐|인카금융서비스[^.。!?]{0,35}마스터즈|인카금융[^.。!?]{0,35}마스터즈|더헤븐CC|KLPGA|골프|라운드|티샷|버디|이글|스윙|언더파|타수|선수|프로암|갤러리|관람|협찬사|슈퍼볼링|볼링|대회[[:space:]]*주최사[^.。!?]{0,80}인카금융서비스|인카금융서비스[^.。!?]{0,80}대회[[:space:]]*주최사)'
),
to_restore as (
  select c.id, c.haystack
  from candidates c
  left join valid_sponsorship v on v.id = c.id
  where v.id is null
),
restored as (
  update public.news_articles a
     set category = case
           when t.haystack ~* '브랜드평판|평판[[:space:]]*랭킹|평판[[:space:]]*순위' then 'competitor'
           when t.haystack ~* '정착률|최하위[[:space:]]*티어' then 'own'
           when t.haystack ~* '정착지원금|1200%|판매수수료|모집수수료' then 'regulation'
           when t.haystack ~* '후원[^.。!?]{0,80}뇌성마비|사회공헌|문화탐방|장애인' then 'own'
           else 'industry'
         end,
         tone = case
           when t.haystack ~* '브랜드평판|평판[[:space:]]*랭킹|평판[[:space:]]*순위' then 'caution'
           when t.haystack ~* '정착률|최하위[[:space:]]*티어|정착지원금|1200%|판매수수료|모집수수료' then 'caution'
           when t.haystack ~* '후원[^.。!?]{0,80}뇌성마비|사회공헌|문화탐방|장애인' then 'positive'
           else 'neutral'
         end,
         own_mentioned = t.haystack ~* '(인카금융|인카금융서비스)',
         negative_target = 'none',
         clipping_recommended = case
           when t.haystack ~* '브랜드평판|정착률|최하위[[:space:]]*티어|정착지원금|1200%|후원[^.。!?]{0,80}뇌성마비|사회공헌|문화탐방|장애인' then true
           else false
         end,
         clipping_reason = case
           when t.haystack ~* '브랜드평판|평판[[:space:]]*랭킹|평판[[:space:]]*순위' then '경쟁 GA 브랜드평판 흐름으로 확인할 기사입니다.'
           when t.haystack ~* '정착률|최하위[[:space:]]*티어' then '당사 운영 지표 관련 주의 기사로 확인할 필요가 있습니다.'
           when t.haystack ~* '정착지원금|1200%|판매수수료|모집수수료' then '판매채널 규제·수수료 이슈로 분리 확인할 기사입니다.'
           when t.haystack ~* '후원[^.。!?]{0,80}뇌성마비|사회공헌|문화탐방|장애인' then '당사 사회공헌 보도로 홍보 활용 여부를 검토할 기사입니다.'
           else ''
         end,
         classification_provider = 'rule_sponsorship_track_v2',
         classification_evidence = '스폰서십 과포착 보정',
         classification_reason = '브랜드/스폰서십 트랙 조건을 실제 주최·후원 이벤트 기사로 축소',
         updated_at = now()
    from to_restore t
   where a.id = t.id
  returning a.id
)
select count(*) as restored_count
from restored;
