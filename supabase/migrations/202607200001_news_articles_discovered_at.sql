alter table if exists public.news_articles
  add column if not exists discovered_at timestamptz not null default now();

create index if not exists idx_news_articles_discovered_at
  on public.news_articles (discovered_at desc);
