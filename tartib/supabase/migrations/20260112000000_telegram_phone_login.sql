-- Вход и регистрация по номеру телефона через Telegram-бота.
-- Сайт создаёт одноразовый код, человек подтверждает номер в боте, бот отмечает код подтверждённым, сайт забирает вход.

create table public.telegram_logins (
  token text primary key,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'used')),
  token_hash text,
  created_at timestamptz not null default now()
);
alter table public.telegram_logins enable row level security;
revoke all on public.telegram_logins from anon, authenticated;

-- Новый код входа (действует 10 минут). Вызывается с сайта до входа, поэтому ограничено общим числом за 10 минут.
create or replace function public.create_telegram_login()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if (select count(*) from public.telegram_logins where created_at > now() - interval '10 minutes') > 300 then
    raise exception 'busy';
  end if;
  delete from public.telegram_logins where expires_at < now() - interval '1 hour';
  v := replace(gen_random_uuid()::text, '-', '');
  insert into public.telegram_logins (token, expires_at) values (v, now() + interval '10 minutes');
  return v;
end;
$$;

-- Сайт опрашивает код. Подтверждённый код отдаёт данные для входа один раз.
create or replace function public.check_telegram_login(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.telegram_logins;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into r from public.telegram_logins where token = p_token;
  if not found or r.expires_at < now() or r.status = 'used' then
    return jsonb_build_object('status', 'expired');
  end if;
  if r.status = 'approved' then
    update public.telegram_logins set status = 'used', token_hash = null where token = p_token;
    return jsonb_build_object('status', 'approved', 'token_hash', r.token_hash);
  end if;
  return jsonb_build_object('status', 'pending');
end;
$$;

revoke execute on function public.create_telegram_login() from public;
revoke execute on function public.check_telegram_login(text) from public;
grant execute on function public.create_telegram_login() to anon, authenticated;
grant execute on function public.check_telegram_login(text) to anon, authenticated;

-- Поиск пользователя по номеру (цифры без плюса). Только для сервиса бота.
create or replace function public.find_user_by_phone(p_phone text)
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email::text from auth.users u where u.phone = p_phone limit 1;
$$;
revoke execute on function public.find_user_by_phone(text) from public, anon, authenticated;
