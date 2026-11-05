-- Для команды бота /messages: сколько непрочитанных сообщений мессенджера у пользователя (считает не больше 99 на чат).
create or replace function public.bot_chat_unread(p_user uuid) returns table (total integer, chats integer)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.n), 0)::integer, (count(*) filter (where t.n > 0))::integer
  from (
    select (select count(*) from (select 1 from public.chat_messages x where x.chat_id = m.chat_id and x.created_at > m.last_read_at and x.sender_id is distinct from p_user and x.deleted_at is null limit 99) q) as n
    from (select chat_id, last_read_at from public.chat_members where user_id = p_user and not muted limit 100) m
  ) t;
$$;
revoke all on function public.bot_chat_unread(uuid) from public, anon, authenticated;
grant execute on function public.bot_chat_unread(uuid) to service_role;
