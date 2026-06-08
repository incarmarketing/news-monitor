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
  ('샘플회사', true),
  ('샘플서비스', true),
  ('샘플회사 브랜드평판', true),
  ('경쟁사명', true),
  ('경쟁사 서비스명', true),
  ('업계 키워드', true),
  ('시장 동향', true),
  ('고객 리뷰', true),
  ('정책 규제 키워드', true),
  ('감독기관', true),
  ('무관 스포츠', true)
on conflict (keyword) do nothing;
