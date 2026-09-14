-- Extend the existing service-only queue; no new public grants or scheduler.
create or replace function public.get_media_byline_candidates(p_limit integer default 20)
returns jsonb language sql stable set search_path = '' as $function$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from (
    select n.article_hash,n.link,n.source,n.title,n.raw->>'_original_url' as original_url,
      n.raw->'publisher_evidence'->>'url' as publisher_evidence_url,
      coalesce(e.attempts,0) as attempts
    from public.news_articles n left join public.article_byline_evidence e using(article_hash)
    where (n.own_mentioned is true or
      (public.media_publisher_unknown(n.source) and n.pub_date >= now()-interval '14 days'))
    and (e.article_hash is null or
      (e.status='fetch_failed' and e.attempts < 3 and e.checked_at < now()-interval '1 day') or
      (e.status='needs_original' and e.attempts < 3 and e.checked_at < now()-interval '1 day'
       and n.link ~ '^https://news[.]google[.]com/(rss/)?(articles|read)/[A-Za-z0-9_-]{30,}([?].*)?$') or
      (e.status in ('needs_original','not_found') and nullif(n.raw->>'_original_url','') is not null
       and n.raw->>'_original_url' <> e.evidence_url
       and not public.media_portal_host(public.media_article_host(n.link,n.raw))) or
      (e.status='needs_original' and (
        n.link ~ '^https?://v[.]daum[.]net/v/[0-9]{17}([?#].*)?$' or
        n.raw->'publisher_evidence'->>'url' ~ '^https?://v[.]daum[.]net/v/[0-9]{17}([?#].*)?$'
      )))
    order by public.media_publisher_unknown(n.source) desc,
      e.checked_at nulls first,n.pub_date desc nulls last,n.article_hash
    limit least(greatest(p_limit,1),1000)
  ) c;
$function$;
