update public.news_articles
   set tone = 'negative',
       risk_level = case when risk_level = 'LOW' then 'MEDIUM' else risk_level end
 where category = 'own'
   and tone <> 'negative'
   and (
     title ilike '%전격 점검%'
     or title ilike '%이직 보따리%'
     or title ilike '%정착지원금%'
   )
   and (
     title ilike '%인카%'
     or summary ilike '%인카금융%'
   );

update public.report_runs
   set risk_level = 'MEDIUM',
       metrics = jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(metrics, '{by_tone,negative}', '1'::jsonb, true),
               '{by_tone,positive}', '0'::jsonb, true
             ),
             '{own_by_tone,negative}', '1'::jsonb, true
           ),
           '{own_by_tone,positive}', '0'::jsonb, true
         ),
         '{own_negative}', '1'::jsonb, true
       )
 where report_date = date '2026-05-27'
   and report_slot = '18';
