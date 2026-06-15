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
  'short_incar_vehicle_tech_noise',
  '짧은 인카 차량·모빌리티 오탐 제외',
  'exclude',
  'exclude',
  array[
    '인카 게이밍', '인카게이밍', 'in-car', '메르세데스', '벤츠',
    'Mercedes', 'Mercedes pay', '메르세데스 페이', '차량 구매',
    '차량 결제', '내비게이션', '내비', '인포테인먼트', '모빌리티',
    '커넥티드카', '오토 차이나', '오비고', 'NHN KCP', '현대차',
    '기아', '카&테크', 'SBA'
  ],
  array['인카'],
  array['인카금융서비스', '인카금융'],
  2,
  '빅카인즈 인카 검색 샘플 기준. in-car, 벤츠 결제 인프라, 차량 내비/인포테인먼트 문맥은 회사 모니터링 대상에서 제외한다.'
),
(
  'short_incar_profile_sports_noise',
  '짧은 인카 인물·스포츠 오탐 제외',
  'exclude',
  'exclude',
  array[
    '후보 명단', '기초단체장 후보', '병역필', '전과', '프로볼링',
    'KPBA', '포토', '골프 확대경'
  ],
  array['인카'],
  array['인카금융서비스', '인카금융'],
  2,
  '인카 단독 검색에서 후보자 약력, 프로볼링, 스포츠성 기사처럼 당사명이 아닌 우연 노출 문맥을 제외한다.'
),
(
  'short_incar_culture_travel_noise',
  '짧은 인카 문화·관광 오탐 제외',
  'exclude',
  'exclude',
  array[
    '인카제국', '잉카', '마추픽추', '페루', '남미', '쿠스코',
    '안데스', '유적', '문명', '관광', '여행'
  ],
  array['인카'],
  array['인카금융서비스', '인카금융'],
  2,
  '인카/잉카 문화·관광 문맥은 보험·GA·당사 모니터링과 무관하므로 AI 분석 전에 제외한다.'
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
