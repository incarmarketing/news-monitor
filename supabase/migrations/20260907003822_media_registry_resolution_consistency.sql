create or replace function public.apply_article_publisher_registry() returns trigger
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
    new.raw := coalesce(new.raw,'{}'::jsonb) || jsonb_build_object('source',v_name,
      'publisher_manual_override',v_name);
  end if;
  return new;
end;
$$;
create function public.refresh_article_reporter_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.source is distinct from old.source or new.own_mentioned is distinct from old.own_mentioned then
    update public.article_byline_evidence set article_hash=new.article_hash where article_hash=new.article_hash;
  end if;
  return new;
end;
$$;
create trigger refresh_article_reporter_registry after update of source,own_mentioned on public.news_articles
for each row execute function public.refresh_article_reporter_registry();
revoke all on function public.refresh_article_reporter_registry() from public,anon,authenticated;
grant execute on function public.refresh_article_reporter_registry() to service_role;
