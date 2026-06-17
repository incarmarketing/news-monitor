alter table public.monitor_keywords
  add column if not exists subcategory text,
  add column if not exists entity_type text not null default 'keyword',
  add column if not exists is_search_keyword boolean not null default true,
  add column if not exists require_article_mention boolean not null default false,
  add column if not exists match_target text not null default 'title_summary',
  add column if not exists default_tone text not null default 'neutral',
  add column if not exists analysis_excluded boolean not null default false;

alter table public.monitor_keywords
  drop constraint if exists monitor_keywords_entity_type_check;

alter table public.monitor_keywords
  add constraint monitor_keywords_entity_type_check
  check (entity_type in ('keyword', 'organization', 'person', 'location', 'topic', 'noise'));

alter table public.monitor_keywords
  drop constraint if exists monitor_keywords_match_target_check;

alter table public.monitor_keywords
  add constraint monitor_keywords_match_target_check
  check (match_target in ('title_summary', 'title_only', 'summary_only', 'source', 'keyword', 'all'));

alter table public.monitor_keywords
  drop constraint if exists monitor_keywords_default_tone_check;

alter table public.monitor_keywords
  add constraint monitor_keywords_default_tone_check
  check (default_tone in ('positive', 'neutral', 'caution', 'negative', 'exclude'));

update public.monitor_keywords
   set entity_type = case
        when category in ('own', 'competitor') then 'organization'
        when category = 'regulation' then 'topic'
        when category = 'exclude' then 'noise'
        else entity_type
       end,
       require_article_mention = case
        when category in ('own', 'competitor') then true
        else require_article_mention
       end,
       match_target = case
        when category = 'exclude' then 'title_summary'
        else match_target
       end,
       default_tone = case
        when category = 'own' then 'neutral'
        when category = 'regulation' then 'caution'
        when category = 'exclude' then 'exclude'
        else default_tone
       end,
       analysis_excluded = case
        when category = 'exclude' then true
        else analysis_excluded
       end,
       subcategory = case
        when coalesce(subcategory, '') <> '' then subcategory
        when category = 'own' then 'direct_company'
        when category = 'competitor' then 'ga_competitor'
        when category = 'industry' then 'market_trend'
        when category = 'regulation' then 'policy_supervision'
        when category = 'exclude' then 'noise'
        else 'general'
       end
 where true;

