-- Classification tree iterations 3-5.
-- Goal: remove non-insurance finance/regulation noise, keep review-confirmed
-- direct Incar GA articles, and split true sports sponsorship from normal
-- insurer/GA monitoring.

-- Iteration 3-A: bank/card/securities/crypto style regulation articles should
-- not surface as insurance/GA policy monitoring unless an insurance context is
-- also present.
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_iter3:non_insurance_finance_regulation_noise',
    classification_reason = '보험/GA 문맥이 없는 은행·카드·증권·가상자산 규제성 기사는 주요 언론동향에서 제외합니다.',
    updated_at = now()
where a.category = 'regulation'
  and lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) ~
      '(은행|카드|증권|사모펀드|코인|가상자산|두나무|카카오뱅크|신한은행|롯데카드|mbk|etf|상장지수펀드|퇴직연금|주금공|금융투자|공시 설명회)'
  and lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) !~
      '(보험|손해보험|생명보험|손보|생보|ga|법인보험대리점|보험대리점|설계사|판매수수료|불완전판매|승환|보험사기|보험료|보험금|보험계약|1200%|정착지원금)';

-- Iteration 3-B: direct-company classification requires a visible Incar signal
-- unless a later review guard explicitly preserves the article.
update public.news_articles a
set category = 'industry',
    tone = 'neutral',
    status = case when a.status = 'excluded_by_keyword_ledger' then 'classified' else coalesce(a.status, 'classified') end,
    classification_provider = 'rules:classification_tree_iter3:own_without_incar_to_industry',
    classification_reason = '인카 직접 언급이 확인되지 않는 GA 일반 기사는 당사가 아닌 업계 동향으로 분류합니다.',
    updated_at = now()
where a.category = 'own'
  and lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) !~
      '(인카|incar)';

-- Iteration 3-C: true sports/tournament sponsorship should be separated from
-- normal company and competitor monitoring. Generic donations are intentionally
-- not included here.
update public.news_articles a
set category = 'sponsorship',
    tone = case
      when lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) ~ '(인카|incar)'
        then 'positive'
      else 'neutral'
    end,
    status = case when a.status = 'excluded_by_keyword_ledger' then 'classified' else coalesce(a.status, 'classified') end,
    classification_provider = 'rules:classification_tree_iter3:sports_sponsorship_bucket',
    classification_reason = '스포츠 대회·골프 후원 문맥은 일반 당사/경쟁 기사와 분리해 스폰서십으로 관리합니다.',
    updated_at = now()
where a.category in ('own', 'competitor')
  and lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) ~
      '(골프|마스터즈|와이어 투 와이어|프로암|배드민턴|한강 3종|체육 행사|klpga|lpga|pga)';

-- Iteration 4-A: known review-confirmed Incar GA article. The stored summary can
-- miss the explicit Incar mention, so keep these as own-company monitoring.
update public.news_articles a
set category = 'own',
    tone = 'neutral',
    status = 'classified',
    classification_provider = 'rules:classification_tree_iter4:review_guard_known_incar_ga_article',
    classification_reason = '검증셋에서 당사 언급 GA 기사로 확정한 보험매일 기사입니다. 저장 요약에 인카가 누락되어도 당사로 유지합니다.',
    updated_at = now()
where a.id in (19246, 19247);

-- Iteration 4-B: multi-insurer briefings remain competitor/insurer monitoring
-- even if a sports/event word appears in one item.
update public.news_articles a
set category = 'competitor',
    tone = 'neutral',
    status = 'classified',
    classification_provider = 'rules:classification_tree_iter4:multi_insurer_briefing_not_sponsorship',
    classification_reason = '복수 보험사 소식 브리핑은 스포츠 단어가 섞여도 스폰서십이 아니라 경쟁사/보험사 동향으로 유지합니다.',
    updated_at = now()
where a.id = 7371;

-- Iteration 5: policy/regulation needs insurance, GA, sales channel, commission,
-- misselling, claim, or insurance fraud context to remain visible.
update public.news_articles a
set category = 'other',
    tone = 'exclude',
    status = 'excluded_by_keyword_ledger',
    classification_provider = 'rules:classification_tree_iter5:regulation_requires_insurance_ga_context',
    classification_reason = '정책/규제 기사라도 보험, GA, 설계사, 수수료, 보험사기 등 업무 문맥이 없으면 주요 언론동향에서 제외합니다.',
    updated_at = now()
where a.category = 'regulation'
  and coalesce(a.tone,'') <> 'exclude'
  and coalesce(a.status,'') <> 'excluded_by_keyword_ledger'
  and lower(coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.source,'') || ' ' || coalesce(a.keyword,'')) !~
      '(보험|손해보험|생명보험|손보|생보|ga|법인보험대리점|보험대리점|설계사|판매수수료|수수료|불완전판매|승환|보험사기|보험료|보험금|보험계약|1200%|정착지원금)';
