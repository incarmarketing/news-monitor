-- Evidence is independent of news upserts and private CRM contact information.
create table public.article_byline_evidence (
  article_hash text primary key references public.news_articles(article_hash) on delete cascade,
  authors jsonb not null default '[]'::jsonb check (jsonb_typeof(authors) = 'array'),
  status text not null check (status in ('verified','not_found','needs_original','fetch_failed')),
  evidence_url text not null default '',
  checked_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  parser_version text not null default 'byline-v1'
);
create table public.article_publisher_overrides (
  article_hash text primary key references public.news_articles(article_hash) on delete cascade,
  press_name text not null check (length(trim(press_name)) between 1 and 100),
  updated_at timestamptz not null default now()
);
alter table public.article_byline_evidence enable row level security;
alter table public.article_publisher_overrides enable row level security;
revoke all on public.article_byline_evidence, public.article_publisher_overrides from anon, authenticated;
grant all on public.article_byline_evidence, public.article_publisher_overrides to service_role;
alter table public.reporters add column auto_key text unique;
create index reporters_media_name_idx on public.reporters(media, name);
create index news_articles_own_registry_idx on public.news_articles(source, pub_date desc, article_hash) where own_mentioned is true;

create function public.media_publisher_unknown(p_name text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(trim(p_name),'') = '' or lower(trim(p_name)) in
    ('언론사 확인 필요','미확인','unknown','google','구글','naver','네이버','daum','다음','nate','네이트')
    or trim(p_name) ~ '^(https?://)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/?$';
$$;
create function public.media_portal_host(p_host text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(p_host,'') = '' or lower(p_host) ~ '(^|\.)(google\.[a-z.]+|naver\.com|daum\.net|nate\.com|googleusercontent\.com|bing\.com|yahoo\.com)$';
$$;
create function public.media_article_host(p_link text, p_raw jsonb) returns text
language sql immutable security invoker set search_path = '' as $$
  select regexp_replace(lower(coalesce(substring(coalesce(
    nullif(p_raw->>'_original_url',''), nullif(p_raw->>'originallink',''),
    nullif(p_raw->>'original_link',''), p_link) from '^https?://([^/:?#]+)'),'')), '^www\.', '');
$$;
create index news_articles_registry_host_idx on public.news_articles(public.media_article_host(link,raw));

create function public.apply_article_publisher_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_name text; v_host text;
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
    new.raw := coalesce(new.raw,'{}'::jsonb) || jsonb_build_object('source',v_name);
  end if;
  return new;
end;
$$;
create trigger apply_article_publisher_registry before insert or update of source,raw,link
on public.news_articles for each row execute function public.apply_article_publisher_registry();

create function public.seed_article_media_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.own_mentioned is true and not public.media_publisher_unknown(new.source)
     and new.source not in ('금융위원회','금융감독원','한국은행','보험개발원','생명보험협회','손해보험협회') then
    insert into public.media_relations(name,memo)
    values(new.source,'당사 직접 언급 기사 이력으로 자동 등록') on conflict(name) do nothing;
  end if;
  return new;
end;
$$;
create trigger seed_article_media_registry after insert or update of source,own_mentioned
on public.news_articles for each row execute function public.seed_article_media_registry();

create function public.propagate_publisher_resolution() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if public.media_publisher_unknown(new.press_name) then raise exception 'verified_press_name_required'; end if;
  if tg_table_name = 'press_aliases' then
    if new.host <> lower(trim(new.host)) or new.host !~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$'
       or public.media_portal_host(new.host) then raise exception 'portal_requires_article_resolution'; end if;
    update public.news_articles set source = new.press_name
    where public.media_article_host(link,raw) = new.host and source is distinct from new.press_name;
  else
    update public.news_articles set source = new.press_name where article_hash = new.article_hash;
  end if;
  return new;
end;
$$;
create trigger propagate_press_alias after insert or update on public.press_aliases
for each row execute function public.propagate_publisher_resolution();
create trigger propagate_article_publisher after insert or update on public.article_publisher_overrides
for each row execute function public.propagate_publisher_resolution();

create function public.seed_verified_reporters() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_media text; v_author jsonb;
begin
  select source into v_media from public.news_articles where article_hash = new.article_hash and own_mentioned is true;
  if v_media is null or public.media_publisher_unknown(v_media) or new.status <> 'verified' then return new; end if;
  for v_author in select value from jsonb_array_elements(new.authors) loop
    if length(trim(v_author->>'name')) between 2 and 80 then
      insert into public.reporters(name,media,email,memo,auto_key)
      select v_author->>'name',v_media,nullif(v_author->>'email',''),
        '기사 바이라인에서 확인. 작성 이력과 확인 출처는 당사 보도 매체에서 조회.',
        md5(v_media || chr(31) || (v_author->>'name'))
      where not exists(select 1 from public.reporters where media=v_media and name=v_author->>'name')
      on conflict(auto_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
create trigger seed_verified_reporters after insert or update on public.article_byline_evidence
for each row execute function public.seed_verified_reporters();

-- A safe projection: no email, phone, internal notes or article bodies.
create view public.media_registry_articles with (security_invoker=true) as
select n.article_hash,n.source,n.title,n.link,n.pub_date,n.own_mentioned,n.tone,
  public.media_article_host(n.link,n.raw) as host,
  public.media_publisher_unknown(n.source) as unresolved,
  coalesce(e.status,'pending') as byline_status,e.checked_at,e.evidence_url,
  coalesce((select jsonb_agg(jsonb_build_object('name',a->>'name','method',a->>'method'))
    from jsonb_array_elements(e.authors) a),'[]'::jsonb) as authors
from public.news_articles n left join public.article_byline_evidence e using(article_hash)
where n.own_mentioned is true or public.media_publisher_unknown(n.source);
revoke all on public.media_registry_articles from anon, authenticated;
grant select on public.media_registry_articles to service_role;

create function public.get_media_registry(p_mode text default 'summary', p_key text default '', p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_rows jsonb; v_total integer; v_media text; v_name text;
begin
  if p_mode = 'summary' then
    return jsonb_build_object('as_of',now(),
      'own_articles',(select count(*) from public.news_articles where own_mentioned is true),
      'byline_pending',(select count(*) from public.media_registry_articles where own_mentioned and byline_status='pending'),
      'media',coalesce((select jsonb_agg(to_jsonb(m) order by m.article_count desc,m.name) from (
        select source as name,count(*) as article_count,min(pub_date) as first_at,max(pub_date) as last_at,
          count(*) filter(where byline_status='verified') as verified_count,
          count(*) filter(where tone='negative') as negative_count
        from public.media_registry_articles where own_mentioned and not unresolved group by source
      ) m),'[]'::jsonb),
      'unknown',coalesce((select jsonb_agg(to_jsonb(u) order by u.article_count desc,u.host) from (
        select host,public.media_portal_host(host) as portal,count(*) as article_count,
          count(*) filter(where own_mentioned) as own_count,max(pub_date) as last_at
        from public.media_registry_articles where unresolved group by host
      ) u),'[]'::jsonb),
      'reporters',coalesce((select jsonb_agg(to_jsonb(r) order by r.article_count desc,r.name) from (
        select n.source as media,a->>'name' as name,count(distinct n.article_hash) as article_count,
          max(n.pub_date) as last_at
        from public.media_registry_articles n cross join lateral jsonb_array_elements(n.authors) a
        where n.own_mentioned and not n.unresolved and n.byline_status='verified'
        group by n.source,a->>'name'
      ) r),'[]'::jsonb));
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

create function public.get_media_byline_candidates(p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from (
    select n.article_hash,n.link,n.source,n.title,n.raw->>'_original_url' as original_url,coalesce(e.attempts,0) as attempts
    from public.news_articles n left join public.article_byline_evidence e using(article_hash)
    where n.own_mentioned is true and (e.article_hash is null or
      (e.status='fetch_failed' and e.attempts < 3 and e.checked_at < now()-interval '1 day'))
    order by e.checked_at nulls first,n.pub_date desc nulls last,n.article_hash limit least(greatest(p_limit,1),1000)
  ) c;
$$;

insert into public.media_relations(name,memo)
select distinct source,'당사 직접 언급 기사 이력으로 자동 등록' from public.news_articles
where own_mentioned is true and not public.media_publisher_unknown(source)
  and source not in ('금융위원회','금융감독원','한국은행','보험개발원','생명보험협회','손해보험협회')
on conflict(name) do nothing;

revoke all on function public.media_publisher_unknown(text),public.media_portal_host(text),public.media_article_host(text,jsonb),
 public.apply_article_publisher_registry(),public.seed_article_media_registry(),public.propagate_publisher_resolution(),
 public.seed_verified_reporters(),public.get_media_registry(text,text,integer),public.get_media_byline_candidates(integer)
 from public,anon,authenticated;
grant execute on function public.media_publisher_unknown(text),public.media_portal_host(text),public.media_article_host(text,jsonb),
 public.apply_article_publisher_registry(),public.seed_article_media_registry(),public.propagate_publisher_resolution(),
 public.seed_verified_reporters(),public.get_media_registry(text,text,integer),public.get_media_byline_candidates(integer) to service_role;
