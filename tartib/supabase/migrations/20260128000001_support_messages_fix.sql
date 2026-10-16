-- Исправление: имена столбцов результата совпадали с именами столбцов таблицы («неоднозначная ссылка»)
create or replace function public.admin_support_open(p_user uuid)
returns table (id uuid, from_admin boolean, body text, created_at timestamptz, email text)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  update public.support_messages sm set read_at = now() where sm.user_id = p_user and not sm.from_admin and sm.read_at is null;
  return query select m.id, m.from_admin, m.body, m.created_at, (select u.email::text from auth.users u where u.id = p_user)
    from public.support_messages m where m.user_id = p_user order by m.created_at limit 500;
end $$;

create or replace function public.admin_support_threads()
returns table (user_id uuid, email text, last_body text, last_at timestamptz, last_from_admin boolean, unread integer)
language plpgsql security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin) or not public.aal_ok() then raise exception 'forbidden'; end if;
  return query
    select m.user_id, u.email::text, m.body, m.created_at, m.from_admin,
      (select count(*)::integer from public.support_messages x where x.user_id = m.user_id and not x.from_admin and x.read_at is null)
    from (select distinct on (s.user_id) s.* from public.support_messages s order by s.user_id, s.created_at desc) m
    join auth.users u on u.id = m.user_id
    order by m.created_at desc limit 200;
end $$;
