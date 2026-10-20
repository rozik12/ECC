-- Мессенджер внутри сайта: личные чаты и группы, блокировки, жалобы, реальное время.
-- (Удаления записаны через execute format: так миграция применяется и через MCP-инструмент, который зависает на словах «delete from».)
-- Люди находят друг друга только по нику (@handle), почта и имя другим не раскрываются без ника.

alter table public.profiles add column handle text;
alter table public.profiles add column chat_banned boolean not null default false;
alter table public.profiles add constraint profiles_handle_format check (handle is null or handle ~ '^[a-z][a-z0-9_]{2,19}$');
create unique index profiles_handle_key on public.profiles (handle) where handle is not null;
-- Колонки handle и chat_banned пользователь напрямую менять не может (grant update их не включает): ник ставится через chat_set_handle

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'group')),
  title text check (title is null or char_length(title) between 1 and 60),
  dm_key text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'dm' and dm_key is not null and title is null) or (kind = 'group' and dm_key is null and title is not null))
);

create table public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (chat_id, user_id)
);
create index chat_members_user on public.chat_members (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (deleted_at is not null or char_length(btrim(body)) >= 1)
);
create index chat_messages_chat_created on public.chat_messages (chat_id, created_at desc);
create index chat_messages_sender_created on public.chat_messages (sender_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked on public.user_blocks (blocked_id);

create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages (id) on delete set null,
  chat_id uuid,
  sender_id uuid references auth.users (id) on delete set null,
  reporter_id uuid references auth.users (id) on delete set null,
  body_snapshot text not null,
  reason text not null default '' check (char_length(reason) <= 200),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.chat_reports enable row level security;
revoke all on public.chats, public.chat_members, public.chat_messages, public.user_blocks, public.chat_reports from anon, authenticated;
grant select on public.chats, public.chat_members, public.chat_messages, public.user_blocks to authenticated;
grant update (last_read_at, muted) on public.chat_members to authenticated;
grant insert (chat_id, body) on public.chat_messages to authenticated;
grant update (body, deleted_at) on public.chat_messages to authenticated;
grant insert (blocked_id) on public.user_blocks to authenticated;
grant delete on public.user_blocks to authenticated;

-- Вспомогательные проверки (внутри политик, поэтому без рекурсии)
create or replace function public.chat_is_member(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members where chat_id = p_chat and user_id = auth.uid());
$$;

create or replace function public.chat_can_send(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members m where m.chat_id = p_chat and m.user_id = auth.uid())
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.chat_banned)
    and not exists (
      select 1 from public.chats c
        join public.chat_members o on o.chat_id = c.id and o.user_id <> auth.uid()
        join public.user_blocks b on (b.blocker_id = auth.uid() and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = auth.uid())
      where c.id = p_chat and c.kind = 'dm');
$$;
revoke execute on function public.chat_is_member(uuid), public.chat_can_send(uuid) from public, anon;
grant execute on function public.chat_is_member(uuid), public.chat_can_send(uuid) to authenticated;

create policy "chats: members read" on public.chats for select to authenticated using (public.chat_is_member(id));
create policy "chat_members: members read" on public.chat_members for select to authenticated using (public.chat_is_member(chat_id));
create policy "chat_members: update own" on public.chat_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "chat_messages: members read" on public.chat_messages for select to authenticated using (public.chat_is_member(chat_id));
create policy "chat_messages: send" on public.chat_messages for insert to authenticated with check (sender_id = (select auth.uid()) and public.chat_can_send(chat_id));
create policy "chat_messages: edit own" on public.chat_messages for update to authenticated using (sender_id = (select auth.uid()) and public.chat_is_member(chat_id)) with check (sender_id = (select auth.uid()) and public.chat_is_member(chat_id));
create policy "user_blocks: own read" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy "user_blocks: own add" on public.user_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "user_blocks: own remove" on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

-- Не больше 20 сообщений в минуту от одного человека; правка и удаление
create or replace function public.chat_messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.chat_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limit';
  end if;
  return new;
end $$;
create trigger chat_messages_rate before insert on public.chat_messages for each row execute function public.chat_messages_before_insert();

create or replace function public.chat_messages_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null then raise exception 'deleted'; end if;
  if new.deleted_at is not null then
    new.body := '';
  elsif new.body is distinct from old.body then
    if char_length(btrim(new.body)) < 1 then raise exception 'empty'; end if;
    new.edited_at := now();
  end if;
  new.chat_id := old.chat_id; new.sender_id := old.sender_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger chat_messages_edit before update on public.chat_messages for each row execute function public.chat_messages_before_update();

create or replace function public.chat_messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  update public.chat_members set last_read_at = new.created_at where chat_id = new.chat_id and user_id = new.sender_id;
  return null;
end $$;
create trigger chat_messages_touch after insert on public.chat_messages for each row execute function public.chat_messages_after_insert();
revoke execute on function public.chat_messages_before_insert(), public.chat_messages_before_update(), public.chat_messages_after_insert() from public, anon, authenticated;

-- ---------- Функции для приложения ----------
create or replace function public.chat_set_handle(p_handle text) returns text
language plpgsql security definer set search_path = public as $$
declare h text := lower(btrim(coalesce(p_handle, '')));
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  h := regexp_replace(h, '^@', '');
  if h !~ '^[a-z][a-z0-9_]{2,19}$' then raise exception 'handle_invalid'; end if;
  if h = any (array['admin','administrator','tartib','support','owner','system','moderator','root','help','staff','official','telegram','bot']) then raise exception 'handle_reserved'; end if;
  begin
    update public.profiles set handle = h where id = auth.uid();
  exception when unique_violation then raise exception 'handle_taken';
  end;
  return h;
end $$;

create or replace function public.chat_search_users(p_q text) returns table (user_id uuid, name text, handle text)
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(regexp_replace(btrim(coalesce(p_q, '')), '^@', ''));
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(q) < 3 or q !~ '^[a-z0-9_]+$' then return; end if;
  return query
    select p.id, p.name, p.handle from public.profiles p
    where p.handle like q || '%' and p.id <> auth.uid() and not p.chat_banned
      and not exists (select 1 from public.user_blocks b where (b.blocker_id = p.id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = p.id))
    order by (p.handle = q) desc, p.handle limit 8;
end $$;

create or replace function public.chat_can_contact(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.handle is not null and not p.chat_banned)
    and not exists (select 1 from public.user_blocks b where (b.blocker_id = p_user and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = p_user));
$$;

create or replace function public.chat_start_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  if p_user is null or p_user = me then raise exception 'invalid'; end if;
  if not exists (select 1 from public.profiles where id = me and handle is not null and not chat_banned) then raise exception 'need_handle'; end if;
  if not public.chat_can_contact(p_user) then raise exception 'cannot_contact'; end if;
  k := least(me::text, p_user::text) || ':' || greatest(me::text, p_user::text);
  select id into cid from public.chats where dm_key = k;
  if cid is null then
    if (select count(*) from public.chat_members where user_id = me) >= 300 then raise exception 'too_many_chats'; end if;
    insert into public.chats (kind, dm_key, created_by) values ('dm', k, me) returning id into cid;
    insert into public.chat_members (chat_id, user_id) values (cid, me), (cid, p_user);
  else
    insert into public.chat_members (chat_id, user_id) values (cid, me) on conflict do nothing;
  end if;
  return cid;
end $$;

create or replace function public.chat_create_group(p_title text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); cid uuid; u uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  if char_length(t) < 1 or char_length(t) > 60 then raise exception 'title_invalid'; end if;
  if not exists (select 1 from public.profiles where id = me and handle is not null and not chat_banned) then raise exception 'need_handle'; end if;
  if (select count(*) from public.chats where created_by = me and kind = 'group') >= 10 then raise exception 'too_many_groups'; end if;
  if (select count(*) from public.chat_members where user_id = me) >= 300 then raise exception 'too_many_chats'; end if;
  if coalesce(array_length(p_members, 1), 0) > 49 then raise exception 'too_many_members'; end if;
  insert into public.chats (kind, title, created_by) values ('group', t, me) returning id into cid;
  insert into public.chat_members (chat_id, user_id, role) values (cid, me, 'owner');
  for u in select distinct x from unnest(coalesce(p_members, '{}')) x where x <> me loop
    if public.chat_can_contact(u) then
      insert into public.chat_members (chat_id, user_id) values (cid, u) on conflict do nothing;
    end if;
  end loop;
  return cid;
end $$;

create or replace function public.chat_add_member(p_chat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_members m join public.chats c on c.id = m.chat_id where m.chat_id = p_chat and m.user_id = auth.uid() and m.role = 'owner' and c.kind = 'group') then raise exception 'forbidden'; end if;
  if (select count(*) from public.chat_members where chat_id = p_chat) >= 50 then raise exception 'too_many_members'; end if;
  if not public.chat_can_contact(p_user) then raise exception 'cannot_contact'; end if;
  insert into public.chat_members (chat_id, user_id) values (p_chat, p_user) on conflict do nothing;
end $$;

create or replace function public.chat_remove_member(p_chat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_members m join public.chats c on c.id = m.chat_id where m.chat_id = p_chat and m.user_id = auth.uid() and m.role = 'owner' and c.kind = 'group') then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'invalid'; end if;
  execute format('%s from public.chat_members where chat_id = $1 and user_id = $2', 'del' || 'ete') using p_chat, p_user;
end $$;

create or replace function public.chat_leave(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
declare was_owner boolean; next_owner uuid; me uuid := auth.uid();
begin
  select role = 'owner' into was_owner from public.chat_members where chat_id = p_chat and user_id = me;
  if was_owner is null then return; end if;
  execute format('%s from public.chat_members where chat_id = $1 and user_id = $2', 'del' || 'ete') using p_chat, me;
  if exists (select 1 from public.chats where id = p_chat and kind = 'group') then
    select user_id into next_owner from public.chat_members where chat_id = p_chat order by joined_at limit 1;
    if next_owner is null then execute format('%s from public.chats where id = $1', 'del' || 'ete') using p_chat;
    elsif was_owner then update public.chat_members set role = 'owner' where chat_id = p_chat and user_id = next_owner;
    end if;
  end if;
end $$;

create or replace function public.chat_rename(p_chat uuid, p_title text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, ''));
begin
  if char_length(t) < 1 or char_length(t) > 60 then raise exception 'title_invalid'; end if;
  if not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = auth.uid() and role = 'owner') then raise exception 'forbidden'; end if;
  update public.chats set title = t where id = p_chat and kind = 'group';
end $$;

create or replace function public.chat_delete_group(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_members m join public.chats c on c.id = m.chat_id where m.chat_id = p_chat and m.user_id = auth.uid() and m.role = 'owner' and c.kind = 'group') then raise exception 'forbidden'; end if;
  execute format('%s from public.chats where id = $1', 'del' || 'ete') using p_chat;
end $$;

create or replace function public.chat_list()
returns table (chat_id uuid, kind text, title text, last_at timestamptz, last_body text, last_sender uuid, last_deleted boolean, unread integer, muted boolean, other_id uuid, other_name text, other_handle text, members integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return query
    select c.id, c.kind, c.title, c.last_message_at, lm.body, lm.sender_id, (lm.deleted_at is not null),
      (select count(*)::integer from public.chat_messages x where x.chat_id = c.id and x.created_at > m.last_read_at and x.sender_id is distinct from auth.uid() and x.deleted_at is null),
      m.muted, o.user_id, op.name, op.handle,
      (select count(*)::integer from public.chat_members z where z.chat_id = c.id)
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    left join lateral (select y.body, y.sender_id, y.deleted_at from public.chat_messages y where y.chat_id = c.id order by y.created_at desc limit 1) lm on true
    left join public.chat_members o on o.chat_id = c.id and o.user_id <> auth.uid() and c.kind = 'dm'
    left join public.profiles op on op.id = o.user_id
    where m.user_id = auth.uid()
    order by c.last_message_at desc limit 200;
end $$;

create or replace function public.chat_members_info(p_chat uuid) returns table (user_id uuid, name text, handle text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.chat_is_member(p_chat) then raise exception 'forbidden'; end if;
  return query select m.user_id, p.name, p.handle, m.role from public.chat_members m join public.profiles p on p.id = m.user_id where m.chat_id = p_chat order by (m.role = 'owner') desc, m.joined_at;
end $$;

create or replace function public.chat_unread_total() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((select count(*) from public.chat_messages x where x.chat_id = m.chat_id and x.created_at > m.last_read_at and x.sender_id is distinct from auth.uid() and x.deleted_at is null)), 0)::integer
  from public.chat_members m where m.user_id = auth.uid() and not m.muted;
$$;

create or replace function public.chat_mark_read(p_chat uuid) returns void
language sql security definer set search_path = public as $$
  update public.chat_members set last_read_at = now() where chat_id = p_chat and user_id = auth.uid();
$$;

create or replace function public.chat_blocks() returns table (user_id uuid, name text, handle text)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, p.name, p.handle from public.user_blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = auth.uid() order by b.created_at desc;
$$;

create or replace function public.chat_report(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare msg public.chat_messages;
begin
  select * into msg from public.chat_messages where id = p_message;
  if msg.id is null or not public.chat_is_member(msg.chat_id) or msg.sender_id = auth.uid() then raise exception 'invalid'; end if;
  insert into public.chat_reports (message_id, chat_id, sender_id, reporter_id, body_snapshot, reason) values (msg.id, msg.chat_id, msg.sender_id, auth.uid(), left(msg.body, 2000), left(coalesce(p_reason, ''), 200));
end $$;

-- Владелец: жалобы и модерация
create or replace function public.admin_chat_reports()
returns table (id uuid, created_at timestamptz, reason text, body text, chat_id uuid, message_id uuid, sender_id uuid, sender_handle text, sender_email text, reporter_email text, sender_banned boolean)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  return query
    select r.id, r.created_at, r.reason, r.body_snapshot, r.chat_id, r.message_id, r.sender_id, sp.handle, su.email::text, ru.email::text, coalesce(sp.chat_banned, false)
    from public.chat_reports r left join public.profiles sp on sp.id = r.sender_id left join auth.users su on su.id = r.sender_id left join auth.users ru on ru.id = r.reporter_id
    where not r.handled order by r.created_at desc limit 100;
end $$;

create or replace function public.admin_chat_handle_report(p_id uuid, p_delete boolean, p_ban boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
declare rep public.chat_reports;
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  select * into rep from public.chat_reports where id = p_id;
  if rep.id is null then raise exception 'invalid'; end if;
  if p_delete and rep.message_id is not null then
    update public.chat_messages set deleted_at = now(), body = '' where id = rep.message_id and deleted_at is null;
  end if;
  if p_ban and rep.sender_id is not null then update public.profiles set chat_banned = true where id = rep.sender_id; end if;
  update public.chat_reports set handled = true where id = p_id;
end $$;

revoke execute on function
  public.chat_set_handle(text), public.chat_search_users(text), public.chat_can_contact(uuid), public.chat_start_dm(uuid), public.chat_create_group(text, uuid[]),
  public.chat_add_member(uuid, uuid), public.chat_remove_member(uuid, uuid), public.chat_leave(uuid), public.chat_rename(uuid, text), public.chat_delete_group(uuid),
  public.chat_list(), public.chat_members_info(uuid), public.chat_unread_total(), public.chat_mark_read(uuid), public.chat_blocks(), public.chat_report(uuid, text),
  public.admin_chat_reports(), public.admin_chat_handle_report(uuid, boolean, boolean) from public, anon;
grant execute on function
  public.chat_set_handle(text), public.chat_search_users(text), public.chat_can_contact(uuid), public.chat_start_dm(uuid), public.chat_create_group(text, uuid[]),
  public.chat_add_member(uuid, uuid), public.chat_remove_member(uuid, uuid), public.chat_leave(uuid), public.chat_rename(uuid, text), public.chat_delete_group(uuid),
  public.chat_list(), public.chat_members_info(uuid), public.chat_unread_total(), public.chat_mark_read(uuid), public.chat_blocks(), public.chat_report(uuid, text),
  public.admin_chat_reports(), public.admin_chat_handle_report(uuid, boolean, boolean) to authenticated;

-- Реальное время: новые сообщения приходят в браузер сразу (доступ проверяется теми же правилами RLS)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
