alter table public.monitor_keywords
  drop constraint if exists monitor_keywords_category_check;

alter table public.monitor_keywords
  add constraint monitor_keywords_category_check
  check (category in ('own', 'regulation', 'competitor', 'industry', 'other', 'exclude'));

do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'monitor_keywords_pkey'
       and conrelid = 'public.monitor_keywords'::regclass
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (keyword)'
  ) then
    alter table public.monitor_keywords drop constraint monitor_keywords_pkey;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'monitor_keywords_pkey'
       and conrelid = 'public.monitor_keywords'::regclass
  ) then
    alter table public.monitor_keywords
      add constraint monitor_keywords_pkey primary key (keyword, category);
  end if;
end $$;
