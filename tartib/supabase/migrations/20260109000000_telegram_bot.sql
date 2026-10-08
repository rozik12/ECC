-- Telegram-бот: привязка аккаунта, одноразовые коды, служебные настройки бота

-- Служебные настройки (токен бота, секреты). Читает только сервис бота, пользователям доступа нет.
create table public.bot_config (
  key text primary key,
  value text not null
);
alter table public.bot_config enable row level security;
revoke all on public.bot_config from anon, authenticated;

create table public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id bigint not null unique,
  reminders boolean not null default true,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
revoke all on public.telegram_links from anon, authenticated;
grant select, delete on public.telegram_links to authenticated;
grant update (reminders) on public.telegram_links to authenticated;

create policy "telegram_links: select own" on public.telegram_links for select to authenticated using (user_id = auth.uid());
create policy "telegram_links: delete own" on public.telegram_links for delete to authenticated using (user_id = auth.uid());
create policy "telegram_links: update own" on public.telegram_links for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mfa required" on public.telegram_links as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

-- Одноразовые коды привязки. Прямого доступа нет, только через функцию ниже.
create table public.telegram_link_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;

create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null or not public.aal_ok() then
    raise exception 'forbidden';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  -- Один активный код на пользователя: новый заменяет старый
  insert into public.telegram_link_codes (user_id, code, expires_at) values (auth.uid(), v_code, now() + interval '15 minutes')
  on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return v_code;
end;
$$;
revoke execute on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;
