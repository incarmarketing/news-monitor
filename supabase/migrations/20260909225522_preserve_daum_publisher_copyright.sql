create or replace function public.apply_article_publisher_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_name text; v_host text; v_evidence jsonb;
begin
  select press_name into v_name from public.article_publisher_overrides where article_hash = new.article_hash;
  if v_name is null then
    v_host := public.media_article_host(new.link,new.raw);
    if not public.media_portal_host(v_host) then
      select press_name into v_name from public.press_aliases where host = v_host;
    end if;
  end if;
  if v_name is not null then
    new.source := v_name;
    new.raw := coalesce(new.raw,'{}'::jsonb) || jsonb_build_object('source',v_name,'publisher_manual_override',v_name);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.article_hash = old.article_hash
     and new.link is not distinct from old.link
     and public.media_publisher_unknown(new.source) and not public.media_publisher_unknown(old.source) then
    v_evidence := old.raw->'publisher_evidence';
    if jsonb_typeof(v_evidence) = 'object'
       and v_evidence->>'method' in ('page_metadata','page_copyright')
       and v_evidence->>'name' = old.source
       and nullif(v_evidence->>'host','') is not null
       and v_evidence->>'host' = public.media_article_host(v_evidence->>'url','{}'::jsonb)
       and (not public.media_portal_host(v_evidence->>'host') or (
         v_evidence->>'host' = 'v.daum.net'
         and v_evidence->>'method' = 'page_copyright'
         and v_evidence->>'url' ~ '^https?://v[.]daum[.]net/v/[0-9]{17}([?#].*)?$'
         and v_evidence->'signals' @> '["daum_site_name","article_copyright"]'::jsonb
       )) then
      new.source := old.source;
      new.raw := coalesce(new.raw,'{}'::jsonb) || jsonb_build_object(
        'source',old.source,'publisher_evidence',v_evidence,'publisher_resolution',v_evidence);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_article_publisher_registry() from public,anon,authenticated;
grant execute on function public.apply_article_publisher_registry() to service_role;

create or replace function public.get_media_byline_candidates(p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from (
    select n.article_hash,n.link,n.source,n.title,n.raw->>'_original_url' as original_url,
      n.raw->'publisher_evidence'->>'url' as publisher_evidence_url,coalesce(e.attempts,0) as attempts
    from public.news_articles n left join public.article_byline_evidence e using(article_hash)
    where n.own_mentioned is true and (e.article_hash is null or
      (e.status='fetch_failed' and e.attempts < 3 and e.checked_at < now()-interval '1 day') or
      (e.status in ('needs_original','not_found') and nullif(n.raw->>'_original_url','') is not null
       and n.raw->>'_original_url' <> e.evidence_url
       and not public.media_portal_host(public.media_article_host(n.link,n.raw))) or
      (e.status='needs_original' and (
        n.link ~ '^https?://v[.]daum[.]net/v/[0-9]{17}([?#].*)?$' or
        n.raw->'publisher_evidence'->>'url' ~ '^https?://v[.]daum[.]net/v/[0-9]{17}([?#].*)?$'
      )))
    order by e.checked_at nulls first,n.pub_date desc nulls last,n.article_hash limit least(greatest(p_limit,1),1000)
  ) c;
$$;
revoke all on function public.get_media_byline_candidates(integer) from public,anon,authenticated;
grant execute on function public.get_media_byline_candidates(integer) to service_role;
