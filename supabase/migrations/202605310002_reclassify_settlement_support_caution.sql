update public.news_articles
   set tone = 'neutral',
       risk_level = 'LOW',
       score = greatest(coalesce(score, 0), 14)
 where article_hash = '6a08c10c960760d5ea0498959619374288f956255286fe734602e7204879d21b';

update public.report_runs
   set metrics = jsonb_set(
                 jsonb_set(
                   jsonb_set(metrics, '{by_tone,negative}', '26'::jsonb, true),
                   '{by_tone,neutral}', '199'::jsonb, true
                 ),
                 '{own_negative}', '5'::jsonb, true
               )
 where report_date = '2026-05-08'
   and (report_slot is null or report_slot = '');
