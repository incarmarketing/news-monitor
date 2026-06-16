update public.notification_sends
set dedupe_key = null
where dedupe_key = '';

drop index if exists public.idx_notification_sends_dedupe_key;

create unique index if not exists idx_notification_sends_dedupe_key
on public.notification_sends (dedupe_key);
