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
    new.raw := coalesce(new.raw,'{}'::jsonb) || jsonb_build_object('source',v_name,
      'publisher_manual_override',v_name);
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
       and not public.media_portal_host(v_evidence->>'host') then
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
