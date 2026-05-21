create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.monitor_keywords (
  keyword text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_monitor_keywords_updated_at on public.monitor_keywords;
create trigger set_monitor_keywords_updated_at
before update on public.monitor_keywords
for each row execute function public.set_updated_at();

alter table public.monitor_keywords enable row level security;

grant select, insert, update, delete on public.monitor_keywords to anon;

drop policy if exists "public dashboard manage monitor keywords" on public.monitor_keywords;
create policy "public dashboard manage monitor keywords"
on public.monitor_keywords
for all
to anon
using (true)
with check (true);

insert into public.monitor_keywords (keyword, enabled)
values
  ('인카금융', true),
  ('인카금융서비스', true),
  ('보험 마케팅', true),
  ('생명보험', true),
  ('손해보험', true),
  ('보험 프로모션', true),
  ('GA 보험', true),
  ('보험설계사', true),
  ('보험대리점 브랜드평판', true),
  ('GA 브랜드평판', true),
  ('인카금융서비스 브랜드평판', true)
on conflict (keyword) do nothing;
