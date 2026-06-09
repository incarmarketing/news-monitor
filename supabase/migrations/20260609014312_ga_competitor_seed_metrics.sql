insert into public.ga_disclosure_metrics (
  company_name,
  stand_mm,
  period_label,
  planners,
  stay_rate,
  retention_13_life,
  retention_25_life,
  poor_sales_life
)
values
  ('인카금융서비스', '201912', '2019', 10296, 48.05, 78.05, 57.87, 0.180),
  ('인카금융서비스', '202012', '2020', 10901, 47.39, 79.68, 54.60, 0.100),
  ('인카금융서비스', '202112', '2021', 11119, 51.27, 85.29, 59.75, 0.030),
  ('인카금융서비스', '202212', '2022', 12228, 58.20, 85.40, 69.75, 0.010),
  ('인카금융서비스', '202312', '2023', 14516, 55.25, 87.46, 70.08, 0.010),
  ('인카금융서비스', '202412', '2024', 16858, 53.92, 91.24, 73.53, 0.000),
  ('인카금융서비스', '202506', '2025.6', 18568, 58.26, 91.20, 79.30, 0.010),
  ('인카금융서비스', '202512', '2025', 20652, 56.71, 90.78, 80.68, 0.000),
  ('한화생명금융서비스', '202512', '2025', 27453, 64.22, 86.38, 68.84, 0.020),
  ('지에이코리아주식회사', '202512', '2025', 17435, 69.59, 91.33, 80.94, 0.080),
  ('글로벌금융판매', '202512', '2025', 14192, 64.93, 91.01, 79.73, 0.030),
  ('프라임에셋', '202512', '2025', 9618, 57.38, 90.57, 81.02, 0.020),
  ('케이지에이에셋 주식회사', '202512', '2025', 9213, 59.93, 91.09, 79.53, 0.040),
  ('에이플러스에셋어드바이저', '202512', '2025', 7489, 63.87, 91.90, 82.46, 0.010),
  ('한국보험금융', '202512', '2025', 6678, 48.64, 78.69, 78.08, 0.030),
  ('메가', '202512', '2025', 6526, 69.35, 88.74, 76.96, 0.040),
  ('엠금융서비스', '202512', '2025', 6221, 66.23, 89.09, 74.86, 0.080)
on conflict (company_name, stand_mm) do update
set period_label = excluded.period_label,
    planners = excluded.planners,
    stay_rate = excluded.stay_rate,
    retention_13_life = excluded.retention_13_life,
    retention_25_life = excluded.retention_25_life,
    poor_sales_life = excluded.poor_sales_life,
    updated_at = now();

insert into public.ga_market_metrics (
  stand_mm,
  period_label,
  companies_count,
  total_planners,
  stay_rate,
  retention_13_life,
  retention_25_life,
  poor_sales_life
)
values
  ('201912', '2019', 60, 159289, 53.49, 81.19, 62.71, 0.360),
  ('202012', '2020', 60, 159219, 55.85, 81.96, 59.42, 0.310),
  ('202112', '2021', 65, 175974, 55.55, 83.30, 64.37, 0.300),
  ('202212', '2022', 63, 178755, 58.97, 85.01, 67.79, 0.100),
  ('202312', '2023', 70, 198517, 58.83, 86.42, 69.14, 0.090),
  ('202412', '2024', 74, 227405, 57.87, 88.46, 70.34, 0.080),
  ('202506', '2025.6', 72, 249089, 59.15, 89.45, 76.01, 0.070),
  ('202512', '2025', 72, 262470, 59.98, 89.32, 77.21, 0.060)
on conflict (stand_mm) do update
set period_label = excluded.period_label,
    companies_count = excluded.companies_count,
    total_planners = excluded.total_planners,
    stay_rate = excluded.stay_rate,
    retention_13_life = excluded.retention_13_life,
    retention_25_life = excluded.retention_25_life,
    poor_sales_life = excluded.poor_sales_life,
    updated_at = now();
