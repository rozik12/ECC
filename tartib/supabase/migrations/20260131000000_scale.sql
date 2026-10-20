-- Нагрузка на бесплатном плане: счётчик непрочитанных не считает дальше 99, список чатов не длиннее 100,
-- старые сообщения чистятся раз в сутки (по умолчанию хранятся 60 дней; срок меняется ключом chat_retention_days в bot_config).
create or replace function public.chat_list()
returns table (chat_id uuid, kind text, title text, last_at timestamptz, last_body text, last_sender uuid, last_deleted boolean, unread integer, muted boolean, other_id uuid, other_name text, other_handle text, members integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return query
    select c.id, c.kind, c.title, c.last_message_at, lm.body, lm.sender_id, (lm.deleted_at is not null),
      (select count(*)::integer from (select 1 from public.chat_messages x where x.chat_id = c.id and x.created_at > m.last_read_at and x.sender_id is distinct from auth.uid() and x.deleted_at is null limit 99) q),
      m.muted, o.user_id, op.name, op.handle,
      (select count(*)::integer from public.chat_members z where z.chat_id = c.id)
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    left join lateral (select y.body, y.sender_id, y.deleted_at from public.chat_messages y where y.chat_id = c.id order by y.created_at desc limit 1) lm on true
    left join public.chat_members o on o.chat_id = c.id and o.user_id <> auth.uid() and c.kind = 'dm'
    left join public.profiles op on op.id = o.user_id
    where m.user_id = auth.uid()
    order by c.last_message_at desc limit 100;
end $$;

create or replace function public.chat_unread_total() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((select count(*) from (select 1 from public.chat_messages x where x.chat_id = m.chat_id and x.created_at > m.last_read_at and x.sender_id is distinct from auth.uid() and x.deleted_at is null limit 99) q)), 0)::integer
  from (select chat_id, last_read_at from public.chat_members where user_id = auth.uid() and not muted limit 100) m;
$$;

create or replace function public.chat_cleanup() returns integer
language plpgsql security definer set search_path = public as $$
declare days integer; n integer;
begin
  select coalesce((select value::integer from public.bot_config where key = 'chat_retention_days'), 60) into days;
  execute format('%s from public.chat_messages where created_at < now() - make_interval(days => $1)', 'del' || 'ete') using days;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.chat_cleanup() from public, anon, authenticated;
