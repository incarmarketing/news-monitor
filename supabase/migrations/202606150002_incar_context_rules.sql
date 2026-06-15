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
  'own_incidental_name_noise',
  '당사명 우연 노출 제외',
  'exclude',
  'exclude',
  array['기초단체장 후보', '후보 명단', '병역필', '전과', '프로볼링', 'KPBA', '우승에 1억', '헬스 트레이닝', '강제 은퇴'],
  array['인카금융서비스', '인카금융'],
  array[]::text[],
  1,
  '빅카인즈 인카금융서비스 검색 샘플 기준. 회사명이 직업·후원·개인 약력에 우연히 포함된 기사는 언론 모니터링 판단 대상에서 제외한다.'
),
(
  'own_stock_market_notice',
  '당사 주가·증시성 자동 기사',
  'other',
  'neutral',
  array['장중수급포착', '오늘의 증시일정', '리포트 브리핑', '주가', '순매수', '52주', '신저가', '신고가', '투자의견', '목표주가', '증권가', '코스피', '코스닥'],
  array['인카금융서비스', '인카금융'],
  array[]::text[],
  3,
  '주가·수급·증시일정 기사는 주가 대시보드에서 다루고 언론 평판의 긍정/부정 기사로 보지 않는다.'
),
(
  'own_performance_positive',
  '당사 성과·홍보 활용 후보',
  'own',
  'positive',
  array['우수인증설계사', '브랜드평판', '1위', '최다', '수상', '선정', '실적', '역대 최대', '매출', '순익', '성장', '협약', '사회공헌', '기부', '후원', '완전판매'],
  array['인카금융서비스', '인카금융'],
  array['주가', '장중수급포착', '오늘의 증시일정', '투자의견', '목표주가'],
  5,
  '당사명이 직접 등장하고 성과·수상·실적·브랜드평판 문맥이 있는 경우만 당사 긍정 후보로 본다.'
),
(
  'own_direct_risk_caution',
  '당사 직접 리스크 주의',
  'own',
  'caution',
  array['금감원', '금융감독원', '검사', '점검', '제재', '처분', '불완전판매', '부당승환', '정착지원금', '편법', '스카우트', '착취', '스캔들', '피해', '민원', '내부통제', '수수료', '1200%'],
  array['인카금융서비스', '인카금융'],
  array['금융보안원 가입', '해킹 피해 예방', '보안 체계 강화'],
  6,
  '당사 직접 언급과 감독·영업관행·소비자피해 문맥이 같이 있으면 우선 주의로 올리고, 명확한 당사 귀책 근거가 있을 때만 부정으로 격상한다.'
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
    enabled = true;
