alter table public.media_relations
  add column if not exists url text,
  add column if not exists beat text,
  add column if not exists lead_reporter text,
  add column if not exists email text,
  add column if not exists phone text;

alter table public.reporters
  add column if not exists beat text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists request text;
