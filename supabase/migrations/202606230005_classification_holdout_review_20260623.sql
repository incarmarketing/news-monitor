-- Holdout classification review batch 2026-06-23.
-- This is intentionally separate from review_20260623_stratified_65 so we can
-- measure generalization against data not used in the previous correction pass.

begin;

alter table public.monitor_classification_review_cases
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_monitor_classification_review_cases_updated_at
  on public.monitor_classification_review_cases;
create trigger set_monitor_classification_review_cases_updated_at
before update on public.monitor_classification_review_cases
for each row execute function public.set_updated_at();

insert into public.monitor_classification_review_cases (
  review_batch,
  article_id,
  expected_category,
  expected_tone,
  expected_visible,
  review_note,
  reviewer
) values
  ('review_20260623_holdout_56', 9630, 'competitor', 'neutral', true, '한화생명금융서비스 FP/외국인 설계사 성과', 'codex'),
  ('review_20260623_holdout_56', 20190, 'competitor', 'neutral', true, '미래에셋생명 CSR', 'codex'),
  ('review_20260623_holdout_56', 21402, 'competitor', 'neutral', true, 'NH농협손보 채널/브랜드 활동', 'codex'),
  ('review_20260623_holdout_56', 17313, 'competitor', 'caution', true, 'GA코리아 보험업법 위반 판결', 'codex'),
  ('review_20260623_holdout_56', 1736, 'competitor', 'neutral', true, '삼성화재·한화생명 동향', 'codex'),
  ('review_20260623_holdout_56', 1812, 'competitor', 'neutral', true, '한화 보험계열 신용등급', 'codex'),
  ('review_20260623_holdout_56', 12325, 'competitor', 'caution', true, '한화생명금융서비스 GA 브랜드평판 1위', 'codex'),
  ('review_20260623_holdout_56', 3982, 'competitor', 'neutral', true, '부산지역 GA 성장', 'codex'),
  ('review_20260623_holdout_56', 9955, 'other', 'exclude', false, '한화 금융채널 언급이나 주식시장 대담 중심', 'codex'),
  ('review_20260623_holdout_56', 20198, 'industry', 'neutral', true, '보험저널 도로위험/보험상품 후보', 'codex'),
  ('review_20260623_holdout_56', 21060, 'other', 'exclude', false, '대만 보험설계사 개인 투자 사례, 국내 보험/GA 문맥 부족', 'codex'),
  ('review_20260623_holdout_56', 9953, 'regulation', 'caution', true, '보험 판매수수료·소비자 신뢰 포럼', 'codex'),
  ('review_20260623_holdout_56', 19960, 'industry', 'neutral', true, '보험사 K-ICS 비율', 'codex'),
  ('review_20260623_holdout_56', 1833, 'competitor', 'neutral', true, '한화손보 신용등급 상향', 'codex'),
  ('review_20260623_holdout_56', 21893, 'competitor', 'neutral', true, 'DB손보 지역 거점 강화', 'codex'),
  ('review_20260623_holdout_56', 2721, 'other', 'exclude', false, 'PR회사 임원 영입, 보험업계 이슈 아님', 'codex'),
  ('review_20260623_holdout_56', 9064, 'regulation', 'caution', true, '도수치료 제도 개편과 실손보험 손해율', 'codex'),
  ('review_20260623_holdout_56', 11389, 'industry', 'neutral', true, '보험사 이모저모', 'codex'),
  ('review_20260623_holdout_56', 2720, 'industry', 'neutral', true, '신용생명보험 공급사 입찰', 'codex'),
  ('review_20260623_holdout_56', 10627, 'industry', 'neutral', true, '코리안리 재보험 업황', 'codex'),
  ('review_20260623_holdout_56', 20896, 'other', 'exclude', false, 'MLB 스포츠 기사', 'codex'),
  ('review_20260623_holdout_56', 179, 'other', 'exclude', false, '홍보/교보문고 사례 기사', 'codex'),
  ('review_20260623_holdout_56', 332, 'other', 'exclude', false, '모빌리티 제휴 기사 속 차보험 비교 광고 주변 문맥', 'codex'),
  ('review_20260623_holdout_56', 19880, 'other', 'exclude', false, '메가박스 영화 굿즈', 'codex'),
  ('review_20260623_holdout_56', 19549, 'other', 'exclude', false, '해외투자/환율 거시 기사 속 생보사 단순 사례', 'codex'),
  ('review_20260623_holdout_56', 7896, 'other', 'exclude', false, '스테이블코인/쿠콘 비보험 금융', 'codex'),
  ('review_20260623_holdout_56', 19306, 'other', 'exclude', false, '방송/농구 감독 예능 기사', 'codex'),
  ('review_20260623_holdout_56', 20736, 'other', 'exclude', false, 'NBA/프로야구 스포츠 기사', 'codex'),
  ('review_20260623_holdout_56', 20439, 'other', 'exclude', false, '프로야구 기사', 'codex'),
  ('review_20260623_holdout_56', 20529, 'other', 'exclude', false, '스포츠 중계 플랫폼 기사', 'codex'),
  ('review_20260623_holdout_56', 20548, 'other', 'exclude', false, '유소년 농구대회 기사', 'codex'),
  ('review_20260623_holdout_56', 20274, 'other', 'exclude', false, '프로야구 기사', 'codex'),
  ('review_20260623_holdout_56', 19247, 'own', 'neutral', true, 'GA 생산성 기사 내 당사 언급 후보', 'codex'),
  ('review_20260623_holdout_56', 9598, 'own', 'positive', true, '당사 자사주/주주환원 공시', 'codex'),
  ('review_20260623_holdout_56', 18643, 'own', 'neutral', true, '당사 투자분석 단순 노출', 'codex'),
  ('review_20260623_holdout_56', 342, 'own', 'positive', true, '당사 지점장 인터뷰/영업 현장 우호 기사', 'codex'),
  ('review_20260623_holdout_56', 4052, 'own', 'neutral', true, '당사 투자분석 단순 노출', 'codex'),
  ('review_20260623_holdout_56', 796, 'own', 'positive', true, '신인 설계사 영업지원 교육', 'codex'),
  ('review_20260623_holdout_56', 1431, 'own', 'caution', true, '상위 GA 역성장 기사 내 당사 감소폭 언급', 'codex'),
  ('review_20260623_holdout_56', 21861, 'own', 'caution', true, '주요 주주 지분 감소 공시성 기사', 'codex'),
  ('review_20260623_holdout_56', 5092, 'other', 'exclude', false, '주가조작 수사 일반, 보험/GA 문맥 없음', 'codex'),
  ('review_20260623_holdout_56', 8266, 'other', 'exclude', false, '공직자 재취업 심사 일반', 'codex'),
  ('review_20260623_holdout_56', 21103, 'other', 'exclude', false, '금융업권 생산적 금융 일반 보도자료, 보험/GA 직접 이슈 아님', 'codex'),
  ('review_20260623_holdout_56', 8142, 'other', 'exclude', false, '8대 금융지주 소비자보호 일반', 'codex'),
  ('review_20260623_holdout_56', 8720, 'other', 'exclude', false, '금융업권 생산적 금융 일반 보도자료 중복', 'codex'),
  ('review_20260623_holdout_56', 1451, 'regulation', 'neutral', true, '금감원 보험회사 경영실적 통계', 'codex'),
  ('review_20260623_holdout_56', 15167, 'regulation', 'caution', true, '1200%룰·설계사 영입 경쟁', 'codex'),
  ('review_20260623_holdout_56', 11350, 'regulation', 'caution', true, '1200%룰 앞 보험사-GA 사전 모의 의혹', 'codex'),
  ('review_20260623_holdout_56', 6007, 'other', 'exclude', false, '키움증권 퇴직연금 수수료 기사', 'codex'),
  ('review_20260623_holdout_56', 4027, 'regulation', 'caution', true, '변액보험 미스터리 쇼핑', 'codex'),
  ('review_20260623_holdout_56', 21272, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 포토', 'codex'),
  ('review_20260623_holdout_56', 21300, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 포토', 'codex'),
  ('review_20260623_holdout_56', 19686, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 포토', 'codex'),
  ('review_20260623_holdout_56', 20141, 'sponsorship', 'positive', true, '인카금융 더헤븐 대회 연계 기부/후원', 'codex'),
  ('review_20260623_holdout_56', 20377, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 출전 기사', 'codex'),
  ('review_20260623_holdout_56', 18472, 'sponsorship', 'neutral', true, '인카금융 더헤븐 대회 개막/출격', 'codex')
on conflict (review_batch, article_id) do update
set expected_category = excluded.expected_category,
    expected_tone = excluded.expected_tone,
    expected_visible = excluded.expected_visible,
    review_note = excluded.review_note,
    reviewer = excluded.reviewer,
    updated_at = now();

commit;
