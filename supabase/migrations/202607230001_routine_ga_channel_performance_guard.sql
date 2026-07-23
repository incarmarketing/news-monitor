-- Routine insurer-by-insurer GA channel statistics are market data, not direct
-- Incar risk. Keep own_mentioned separately when the article body names Incar.
with candidates as (
  select
    id,
    title ~* '(인카금융서비스|인카금융)' as own_in_title,
    (
      coalesce(title, '') || ' ' ||
      coalesce(raw->>'description', '') || ' ' ||
      coalesce(raw->>'body', '') || ' ' ||
      coalesce(raw->>'content', '')
    ) ~* '(인카금융서비스|인카금융)' as own_anywhere
  from public.news_articles
  where title ~* '((20[0-9]{2}년)?[0-9]{1,2}월|상반기|하반기|[1-4]분기)'
    and title ~* '(GA|보험대리점)'
    and title ~* '(생보실적|손보실적|신계약[[:space:]]*실적|판매실적|실적[[:space:]]*M/?S|M/?S|시장점유율|점유율)'
    and title !~* '(제재|처분|검사|조사|수사|압수수색|기소|소송|불완전판매|부당승환|보험사기|횡령|배임|불법|위반|내부통제|소비자[[:space:]]*피해|민원|스캔들|사채)'
), normalized as (
  select
    id,
    own_in_title,
    own_anywhere,
    case
      when own_in_title then 'own'
      else 'industry'
    end as normalized_category,
    case
      when own_in_title and title ~* '(하락|밀려|내려앉|후퇴|부진|감소|급감|추락|최하위)' then 'caution'
      when own_in_title and title ~* '(1위|선두|수성|탈환|도약|상승|껑충|굳히기|호실적|증가|회복)' then 'positive'
      else 'neutral'
    end as normalized_tone
  from candidates
  join public.news_articles using (id)
)
update public.news_articles as article
set
  category = normalized.normalized_category,
  tone = normalized.normalized_tone,
  risk_level = 'LOW',
  own_mentioned = normalized.own_anywhere,
  negative_target = 'none',
  classification_evidence = '보험사별 월간 GA 채널 신계약 실적·점유율·순위 통계',
  classification_reason = '정기 실적 통계의 순위 상승·하락은 당사 제재·위법·소비자 피해와 다른 시장 지표',
  classification_confidence = 1,
  classification_provider = 'rules:routine_ga_channel_performance_v1',
  clipping_recommended = normalized.normalized_category = 'own' and normalized.normalized_tone = 'positive',
  clipping_reason = case
    when normalized.normalized_category = 'own' and normalized.normalized_tone = 'positive'
      then '당사가 제목에서 우수한 GA 채널 실적으로 직접 부각된 정기 통계 보도입니다.'
    else ''
  end,
  raw = coalesce(article.raw, '{}'::jsonb) || jsonb_build_object(
    '_ai_context',
    coalesce(article.raw->'_ai_context', '{}'::jsonb) || jsonb_build_object(
      'category', normalized.normalized_category,
      'tone', normalized.normalized_tone,
      'own_mentioned', normalized.own_anywhere,
      'negative_target', 'none',
      'evidence', '보험사별 월간 GA 채널 신계약 실적·점유율·순위 통계',
      'reason', '정기 실적 통계의 순위 상승·하락은 당사 제재·위법·소비자 피해와 다른 시장 지표',
      'confidence', 1,
      'provider', 'rules:routine_ga_channel_performance_v1',
      'clipping_recommended', normalized.normalized_category = 'own' and normalized.normalized_tone = 'positive',
      'clipping_reason', case
        when normalized.normalized_category = 'own' and normalized.normalized_tone = 'positive'
          then '당사가 제목에서 우수한 GA 채널 실적으로 직접 부각된 정기 통계 보도입니다.'
        else ''
      end
    )
  ),
  updated_at = now()
from normalized
where article.id = normalized.id;
