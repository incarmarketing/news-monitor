create index news_articles_unresolved_registry_idx on public.news_articles(pub_date desc,article_hash)
where public.media_publisher_unknown(source);

create or replace function public.get_media_byline_candidates(p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from (
    select n.article_hash,n.link,n.source,n.title,n.raw->>'_original_url' as original_url,coalesce(e.attempts,0) as attempts
    from public.news_articles n left join public.article_byline_evidence e using(article_hash)
    where n.own_mentioned is true and (e.article_hash is null or
      (e.status='fetch_failed' and e.attempts < 3 and e.checked_at < now()-interval '1 day') or
      (e.status in ('needs_original','not_found') and nullif(n.raw->>'_original_url','') is not null
       and n.raw->>'_original_url' <> e.evidence_url
       and not public.media_portal_host(public.media_article_host(n.link,n.raw))))
    order by e.checked_at nulls first,n.pub_date desc nulls last,n.article_hash limit least(greatest(p_limit,1),1000)
  ) c;
$$;
