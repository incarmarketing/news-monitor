alter table if exists public.notification_sends
  alter column channel set default 'slack';
