-- Цель по дисциплине и публичная карточка результата

alter table public.profiles
  add column discipline_goal integer not null default 80 check (discipline_goal between 10 and 100),
  add column share_token uuid unique;

grant update (discipline_goal, share_token) on public.profiles to authenticated;

-- Публичная карточка: только проценты и серия, без сумм, сделок и инструментов.
-- Доступна лишь тому, у кого есть ссылка (случайный токен); владелец может выключить её в любой момент.
create or replace function public.public_share_stats(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_name text;
  v_total int;
  v_followed int;
  v_streak int;
  v_all int;
begin
  if p_token is null then return null; end if;
  select id, split_part(trim(name), ' ', 1) into v_user, v_name from public.profiles where share_token = p_token;
  if v_user is null then return null; end if;

  select count(*), count(*) filter (where rules_followed)
    into v_total, v_followed
    from public.trades where user_id = v_user and traded_at >= now() - interval '30 days';

  select count(*) into v_all from public.trades where user_id = v_user;

  select count(*) into v_streak from public.trades
    where user_id = v_user
      and traded_at > coalesce((select max(traded_at) from public.trades where user_id = v_user and not rules_followed), '-infinity'::timestamptz);

  return jsonb_build_object(
    'name', coalesce(nullif(v_name, ''), ''),
    'trades30', v_total,
    'followed30', v_followed,
    'streak', v_streak,
    'trades', v_all
  );
end;
$$;

revoke execute on function public.public_share_stats(uuid) from public;
grant execute on function public.public_share_stats(uuid) to anon, authenticated;
