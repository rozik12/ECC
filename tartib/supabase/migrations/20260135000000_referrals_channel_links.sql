-- Рост без спама: реферальные коды, учёт приглашённых и ссылки-приглашения в канал по источникам.
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users (id) on delete set null;

create or replace function public.make_ref_code() returns text
language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = c);
  end loop;
  return c;
end $$;
revoke all on function public.make_ref_code() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = public.make_ref_code() where id = r.id;
  end loop;
end $$;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);
create index if not exists profiles_referred_by on public.profiles (referred_by) where referred_by is not null;

-- Регистрация: код приглашения приходит в метаданных (raw_user_meta_data.ref), ставится один раз и позже не меняется
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  select id into inviter from public.profiles
    where referral_code = upper(coalesce(new.raw_user_meta_data ->> 'ref', '')) and id <> new.id limit 1;
  insert into public.profiles (id, name, referral_code, referred_by)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), public.make_ref_code(), inviter);
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  return new;
end $$;

create or replace function public.referral_stats() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.profiles where referred_by = auth.uid();
$$;
revoke all on function public.referral_stats() from public, anon;
grant execute on function public.referral_stats() to authenticated;

-- Ссылки-приглашения в Telegram-канал по источникам (site, bot, friends, chats, blog, ads, partners).
-- Сами ссылки создаются через Telegram (createChatInviteLink) и добавляются в таблицу отдельно; в репозитории их нет.
create table if not exists public.channel_links (
  source text primary key,
  url text not null check (url like 'https://t.me/%'),
  created_at timestamptz not null default now()
);
alter table public.channel_links enable row level security;
revoke all on public.channel_links from anon, authenticated;

create or replace function public.channel_link(p_src text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select url from public.channel_links where source = lower(left(p_src, 32))), 'https://t.me/tartibuk');
$$;
revoke all on function public.channel_link(text) from public;
grant execute on function public.channel_link(text) to anon, authenticated;
