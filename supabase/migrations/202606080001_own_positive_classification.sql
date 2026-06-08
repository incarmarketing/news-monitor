-- Positive coverage is reserved for direct company-favorable articles.
-- Competitor wins, industry improvements, and policy/market articles should not
-- be counted as positive when Incar Financial Service is not directly involved.
update public.news_articles
   set tone = 'neutral',
       raw = jsonb_set(
         jsonb_set(coalesce(raw, '{}'::jsonb), '{_tone}', '"neutral"'::jsonb, true),
         '{tone}', '"neutral"'::jsonb, true
       )
 where tone = 'positive'
   and coalesce(category, 'other') <> 'own';
