create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.dashboard_users (
  employee_no text primary key,
  display_name text,
  password_hash text not null,
  enabled boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_dashboard_users_updated_at on public.dashboard_users;
create trigger set_dashboard_users_updated_at
before update on public.dashboard_users
for each row execute function public.set_updated_at();

alter table public.dashboard_users enable row level security;

revoke all on public.dashboard_users from anon;
revoke all on public.dashboard_users from authenticated;

create or replace function private.verify_dashboard_login_impl(
  p_employee_no text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  user_row public.dashboard_users%rowtype;
  expires_at timestamptz := now() + interval '12 hours';
begin
  select *
    into user_row
    from public.dashboard_users
   where employee_no = trim(p_employee_no)
     and enabled = true;

  if not found
     or user_row.password_hash is null
     or extensions.crypt(p_password, user_row.password_hash) <> user_row.password_hash then
    return jsonb_build_object(
      'ok', false,
      'message', '사번 또는 비밀번호가 일치하지 않습니다.'
    );
  end if;

  update public.dashboard_users
     set last_login_at = now()
   where employee_no = user_row.employee_no;

  return jsonb_build_object(
    'ok', true,
    'employee_no', user_row.employee_no,
    'display_name', coalesce(nullif(user_row.display_name, ''), user_row.employee_no),
    'session_expires_at', expires_at
  );
end;
$$;

revoke all on function private.verify_dashboard_login_impl(text, text) from public;
grant usage on schema private to anon;
grant execute on function private.verify_dashboard_login_impl(text, text) to anon;

create or replace function public.verify_dashboard_login(
  p_employee_no text,
  p_password text
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.verify_dashboard_login_impl(p_employee_no, p_password);
$$;

revoke all on function public.verify_dashboard_login(text, text) from public;
grant execute on function public.verify_dashboard_login(text, text) to anon;
