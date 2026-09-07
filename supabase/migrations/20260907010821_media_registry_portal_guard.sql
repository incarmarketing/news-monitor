create or replace function public.media_publisher_unknown(p_name text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(trim(p_name),'') = '' or lower(trim(p_name)) in
    ('언론사 확인 필요','언론사 확인','출처 확인','미확인','unknown','google','구글','구글뉴스','google news',
     'naver','네이버','네이버뉴스','네이버 뉴스','naver blog','네이버 블로그','네이버 프리미엄콘텐츠',
     'daum','다음','다음뉴스','nate','네이트','네이트뉴스','네이트 뉴스','bing','msn')
    or trim(p_name) ~ '^(https?://)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/?$';
$$;
create or replace function public.media_portal_host(p_host text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(p_host,'') = '' or lower(p_host) ~ '(^|\.)(google\.[a-z.]+|naver\.com|daum\.net|nate\.com|msn\.com|googleusercontent\.com|bing\.com|yahoo\.com)$';
$$;
reindex index public.news_articles_unresolved_registry_idx;

create or replace function public.get_media_registry(p_mode text default 'summary', p_key text default '', p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_rows jsonb; v_total integer; v_media text; v_name text;
begin
  if p_mode = 'summary' then
    return (with registry as materialized (select * from public.media_registry_articles)
      select jsonb_build_object('as_of',now(),
      'own_articles',(select count(*) from registry where own_mentioned is true),
      'byline_pending',(select count(*) from registry where own_mentioned and byline_status='pending'),
      'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.article_count desc,m.name) from (
        select source as name,count(*) as article_count,min(pub_date) as first_at,max(pub_date) as last_at,
          count(*) filter(where byline_status='verified') as verified_count,
          count(*) filter(where tone='negative') as negative_count
        from registry where own_mentioned and not unresolved group by source
      ) m),'[]'::jsonb),
      'unknown',coalesce((select jsonb_agg(to_jsonb(u) order by u.article_count desc,u.host) from (
        select host,public.media_portal_host(host) as portal,count(*) as article_count,
          count(*) filter(where own_mentioned) as own_count,max(pub_date) as last_at
        from registry where unresolved group by host
      ) u),'[]'::jsonb),
      'reporters',coalesce((select jsonb_agg(to_jsonb(r) order by r.article_count desc,r.name) from (
        select n.source as media,a->>'name' as name,count(distinct n.article_hash) as article_count,
          max(n.pub_date) as last_at
        from registry n cross join lateral jsonb_array_elements(n.authors) a
        where n.own_mentioned and not n.unresolved and n.byline_status='verified'
        group by n.source,a->>'name'
      ) r),'[]'::jsonb)));
  end if;
  if p_mode not in ('media','unknown','reporter') or p_offset < 0 then raise exception 'invalid_registry_query'; end if;
  if p_mode='reporter' then v_media := p_key::jsonb->>0; v_name := p_key::jsonb->>1; end if;
  select count(*) into v_total from public.media_registry_articles n
    where (p_mode='media' and n.own_mentioned and not n.unresolved and n.source=p_key)
    or (p_mode='unknown' and n.unresolved and n.host=p_key)
    or (p_mode='reporter' and n.own_mentioned and not n.unresolved and
      n.source = v_media and exists(select 1 from jsonb_array_elements(n.authors) a where a->>'name'=v_name));
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
    select n.* from public.media_registry_articles n
    where (p_mode='media' and n.own_mentioned and not n.unresolved and n.source=p_key)
    or (p_mode='unknown' and n.unresolved and n.host=p_key)
    or (p_mode='reporter' and n.own_mentioned and not n.unresolved and
      n.source = v_media and exists(select 1 from jsonb_array_elements(n.authors) a where a->>'name'=v_name))
    order by n.pub_date desc nulls last,n.article_hash limit 30 offset p_offset
  ) t;
  return jsonb_build_object('rows',v_rows,'total',v_total,'offset',p_offset,'page_size',30);
end;
$$;
