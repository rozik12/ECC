-- Сообщения владельцу: у каждого пользователя одна личная переписка. Отвечает владелец отдельно каждому.
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_admin boolean not null default false,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index support_messages_user_created on public.support_messages (user_id, created_at);
create index support_messages_unread on public.support_messages (user_id, from_admin) where read_at is null;

alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
-- Пользователь может написать только от своего имени (признак «от владельца» поставить нельзя)
grant insert (body) on public.support_messages to authenticated;
alter table public.support_messages alter column user_id set default auth.uid();
grant insert (user_id) on public.support_messages to authenticated;
create policy "support: select own" on public.support_messages for select to authenticated using (user_id = auth.uid());
create policy "support: insert own" on public.support_messages for insert to authenticated with check (user_id = auth.uid() and from_admin = false);

-- Не больше 20 сообщений в сутки от одного пользователя
create or replace function public.support_limits() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.from_admin and (select count(*) from public.support_messages where user_id = new.user_id and not from_admin and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many messages';
  end if;
  return new;
end $$;
create trigger support_messages_limits before insert on public.support_messages for each row execute function public.support_limits();

-- Новый вид уведомления: ответ владельца
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('achievement', 'violation', 'goal', 'report', 'announcement', 'price_alert', 'support_reply'));

-- После нового сообщения: владельцу приходит уведомление в колокольчик, пользователю после ответа тоже. В Telegram не дублируется (pushed_at заполнен).
create or replace function public.support_notify() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.from_admin then
    insert into public.notifications (user_id, kind, params, pushed_at) values (new.user_id, 'support_reply', '{}'::jsonb, now());
  else
    insert into public.notifications (user_id, kind, params, pushed_at)
      select p.id, 'announcement', jsonb_build_object('title', 'Новое сообщение от пользователя', 'body', left((select email from auth.users where id = new.user_id) || ': ' || new.body, 500)), now()
      from public.profiles p where p.is_admin;
  end if;
  return null;
end $$;
create trigger support_messages_notify after insert on public.support_messages for each row execute function public.support_notify();

-- Пользователь отмечает ответы владельца прочитанными
create or replace function public.support_mark_read() returns void language sql security definer set search_path = public as $$
  update public.support_messages set read_at = now() where user_id = auth.uid() and from_admin and read_at is null;
$$;
revoke execute on function public.support_mark_read() from public, anon;
grant execute on function public.support_mark_read() to authenticated;

-- Владелец: список переписок
create or replace function public.admin_support_threads()
returns table (user_id uuid, email text, last_body text, last_at timestamptz, last_from_admin boolean, unread integer)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  return query
    select m.user_id, u.email::text, m.body, m.created_at, m.from_admin,
      (select count(*)::integer from public.support_messages x where x.user_id = m.user_id and not x.from_admin and x.read_at is null)
    from (select distinct on (s.user_id) s.* from public.support_messages s order by s.user_id, s.created_at desc) m
    join auth.users u on u.id = m.user_id
    order by m.created_at desc limit 200;
end $$;
revoke execute on function public.admin_support_threads() from public, anon;
grant execute on function public.admin_support_threads() to authenticated;

-- Владелец: открыть переписку (сообщения пользователя отмечаются прочитанными)
create or replace function public.admin_support_open(p_user uuid)
returns table (id uuid, from_admin boolean, body text, created_at timestamptz, email text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  update public.support_messages set read_at = now() where user_id = p_user and not from_admin and read_at is null;
  return query select m.id, m.from_admin, m.body, m.created_at, (select u.email::text from auth.users u where u.id = p_user)
    from public.support_messages m where m.user_id = p_user order by m.created_at limit 500;
end $$;
revoke execute on function public.admin_support_open(uuid) from public, anon;
grant execute on function public.admin_support_open(uuid) to authenticated;

-- Владелец: ответить конкретному пользователю
create or replace function public.admin_support_reply(p_user uuid, p_body text) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 or length(p_body) > 2000 then raise exception 'invalid'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'invalid'; end if;
  insert into public.support_messages (user_id, from_admin, body) values (p_user, true, trim(p_body));
end $$;
revoke execute on function public.admin_support_reply(uuid, text) from public, anon;
grant execute on function public.admin_support_reply(uuid, text) to authenticated;

-- Владелец: число непрочитанных сообщений
create or replace function public.admin_support_unread() returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) or not public.aal_ok() then return 0; end if;
  return (select count(*)::integer from public.support_messages where not from_admin and read_at is null);
end $$;
revoke execute on function public.admin_support_unread() from public, anon;
grant execute on function public.admin_support_unread() to authenticated;
