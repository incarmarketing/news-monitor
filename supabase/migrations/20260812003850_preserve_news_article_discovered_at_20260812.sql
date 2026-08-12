update public.news_articles
set discovered_at = created_at
where created_at is not null
  and discovered_at > created_at + interval '5 minutes';

create schema if not exists private;

create or replace function private.preserve_news_article_discovered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.discovered_at is not null then
    new.discovered_at := old.discovered_at;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_news_article_discovered_at() from public;

drop trigger if exists preserve_news_article_discovered_at on public.news_articles;
create trigger preserve_news_article_discovered_at
before update of discovered_at on public.news_articles
for each row
execute function private.preserve_news_article_discovered_at();
