alter table public.news_articles add column if not exists own_mentioned boolean;
alter table public.news_articles add column if not exists negative_target text default 'none';
alter table public.news_articles add column if not exists classification_evidence text;
alter table public.news_articles add column if not exists classification_reason text;
alter table public.news_articles add column if not exists classification_confidence numeric default 0;
alter table public.news_articles add column if not exists classification_provider text;
alter table public.news_articles add column if not exists clipping_recommended boolean not null default false;
alter table public.news_articles add column if not exists clipping_reason text;

update public.news_articles
   set own_mentioned = coalesce(
         own_mentioned,
         case
           when lower(coalesce(raw#>>'{_ai_context,own_mentioned}', '')) in ('true', '1', 'yes') then true
           when lower(coalesce(raw#>>'{_ai_context,own_mentioned}', '')) in ('false', '0', 'no') then false
           when category = 'own' then true
           else false
         end
       ),
       negative_target = coalesce(nullif(negative_target, ''), raw#>>'{_ai_context,negative_target}', 'none'),
       classification_evidence = coalesce(nullif(classification_evidence, ''), raw#>>'{_ai_context,evidence}'),
       classification_reason = coalesce(nullif(classification_reason, ''), raw#>>'{_ai_context,reason}'),
       classification_provider = coalesce(nullif(classification_provider, ''), raw#>>'{_ai_context,provider}'),
       clipping_reason = coalesce(nullif(clipping_reason, ''), raw#>>'{_ai_context,clipping_reason}'),
       clipping_recommended = case
         when lower(coalesce(raw#>>'{_ai_context,clipping_recommended}', '')) in ('true', '1', 'yes') then true
         else clipping_recommended
       end
 where own_mentioned is null
    or negative_target is null
    or classification_evidence is null
    or classification_reason is null
    or classification_provider is null
    or clipping_reason is null;

create index if not exists idx_news_articles_clipping_recommended
  on public.news_articles (clipping_recommended, report_date desc);

create index if not exists idx_news_articles_negative_target
  on public.news_articles (negative_target);
