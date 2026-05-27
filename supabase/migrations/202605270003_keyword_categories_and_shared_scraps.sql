alter table public.monitor_keywords
  add column if not exists category text not null default 'other';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'monitor_keywords_category_check'
       and conrelid = 'public.monitor_keywords'::regclass
  ) then
    alter table public.monitor_keywords
      add constraint monitor_keywords_category_check
      check (category in ('own', 'regulation', 'competitor', 'industry', 'other'));
  end if;
end $$;

update public.monitor_keywords
   set category = case
     when keyword in ('인카금융', '인카금융서비스', '인카금융서비스 브랜드평판') then 'own'
     when keyword like '%브랜드평판%' or keyword in ('보험 마케팅', '보험 프로모션', 'GA 보험', '보험설계사') then 'industry'
     when keyword in ('생명보험', '손해보험') then 'competitor'
     else category
   end
 where category = 'other';

create index if not exists idx_monitor_keywords_category
  on public.monitor_keywords (category, created_at);

create table if not exists public.article_scraps (
  article_hash text primary key,
  article_snapshot jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_article_scraps_updated_at on public.article_scraps;
create trigger set_article_scraps_updated_at
before update on public.article_scraps
for each row execute function public.set_updated_at();

alter table public.article_scraps enable row level security;

revoke all on public.article_scraps from anon, authenticated;
