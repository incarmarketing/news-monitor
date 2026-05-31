update public.news_articles
   set tone = 'negative',
       risk_level = case when risk_level = 'HIGH' then 'HIGH' else 'MEDIUM' end,
       score = greatest(coalesce(score, 0), 22)
 where article_hash in (
   '470ea02b601940201184efc00ebd2531ac4e738f8cb7a20e8b8c38c1f8331345',
   '7187e6f21ad46e7527acc1be23635b2c33802e31cb86cbc65552aad267280ceb'
 );

update public.report_runs
   set metrics = jsonb_set(
                 jsonb_set(
                   jsonb_set(metrics, '{by_tone,negative}', '27'::jsonb, true),
                   '{by_tone,positive}', '28'::jsonb, true
                 ),
                 '{own_negative}', '6'::jsonb, true
               ),
       risk_level = case when risk_level = 'LOW' then 'MEDIUM' else risk_level end
 where report_date = '2026-05-08'
   and (report_slot is null or report_slot = '');
