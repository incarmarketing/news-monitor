insert into public.ga_revenue_metrics (
  company_name,
  period_key,
  period_label,
  amount_krw_100m,
  status,
  source_label,
  source_url,
  note,
  confirmed_at
)
values
  ('한화생명금융서비스', '2024', '2024 연간', 21095, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('지에이코리아주식회사', '2024', '2024 연간', 12292, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('글로벌금융판매', '2024', '2024 연간', 7806, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('프라임에셋', '2024', '2024 연간', 4984, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('케이지에이에셋 주식회사', '2024', '2024 연간', 5355, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('에이플러스에셋어드바이저', '2024', '2024 연간', 4563, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('한국보험금융', '2024', '2024 연간', 4538, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('메가', '2024', '2024 연간', 4829, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31'),
  ('엠금융서비스', '2024', '2024 연간', 3568, '확인값', '업계 매출 비교 기준값', null, '업계 동향 화면의 연간 매출 비교 기준값입니다.', '2025-12-31')
on conflict (company_name, period_key) do update
set period_label = excluded.period_label,
    amount_krw_100m = excluded.amount_krw_100m,
    status = excluded.status,
    source_label = excluded.source_label,
    source_url = excluded.source_url,
    note = excluded.note,
    confirmed_at = excluded.confirmed_at,
    updated_at = now();
