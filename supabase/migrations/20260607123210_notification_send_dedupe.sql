alter table public.notification_sends
  add column if not exists dedupe_key text;

with ranked as (
  select
    id,
    message_type,
    coalesce(title, '') as title,
    row_number() over (
      partition by message_type, coalesce(title, ''), status
      order by sent_at desc, id desc
    ) as rn
  from public.notification_sends
  where status = 'success'
    and dedupe_key is null
)
update public.notification_sends n
set dedupe_key = case
  when ranked.rn = 1 then ranked.message_type || ':' || ranked.title
  else ranked.message_type || ':' || ranked.title || ':legacy-duplicate:' || ranked.id::text
end
from ranked
where n.id = ranked.id;

create unique index if not exists idx_notification_sends_dedupe_key
on public.notification_sends (dedupe_key);

create index if not exists idx_notification_sends_type_title_status
on public.notification_sends (message_type, title, status);
