insert into public.ga_revenue_metrics (
  company_name,
  period_key,
  period_label,
  amount_krw_100m,
  operating_profit_krw_100m,
  net_income_krw_100m,
  status,
  source_label,
  source_url,
  note,
  confirmed_at
)
values
  ('한화생명금융서비스', '2025', '2025 연간', 24397.35, 1611.78, 1158.06, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('인카금융서비스', '2025', '2025 연간', 10217.69, 948.44, 723.00, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('지에이코리아주식회사', '2025', '2025 연간', 14393.81, 523.22, 436.34, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('글로벌금융판매', '2025', '2025 연간', 9397.67, 320.93, 309.78, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('프라임에셋', '2025', '2025 연간', 6295.47, 247.65, 221.89, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('케이지에이에셋 주식회사', '2025', '2025 연간', 6201.99, 54.83, 44.81, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('에이플러스에셋어드바이저', '2025', '2025 연간', 6013.39, 269.48, 213.25, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('한국보험금융', '2025', '2025 연간', 4506.64, 45.07, 51.02, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('메가', '2025', '2025 연간', 4671.98, 110.46, 91.67, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10'),
  ('엠금융서비스', '2025', '2025 연간', 3876.38, 70.07, 75.30, '통합공시 확인', '법인보험대리점 통합공시 손익현황', 'https://gapub.insure.or.kr/gongsimain/mainSearch.do', '2025년 말 결산 상세 손익현황의 매출액 기준입니다.', '2026-06-10')
on conflict (company_name, period_key) do update set
  period_label = excluded.period_label,
  amount_krw_100m = excluded.amount_krw_100m,
  operating_profit_krw_100m = excluded.operating_profit_krw_100m,
  net_income_krw_100m = excluded.net_income_krw_100m,
  status = excluded.status,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  note = excluded.note,
  confirmed_at = excluded.confirmed_at;
