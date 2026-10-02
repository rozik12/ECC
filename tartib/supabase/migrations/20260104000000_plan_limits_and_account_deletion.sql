-- 1) Лимиты тарифа FREE на уровне базы: так их нельзя обойти даже одновременными запросами.
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_count int;
begin
  -- Блокировка на пользователя: две одновременные вставки не смогут обойти лимит
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  select case when s.plan = 'pro' and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
              then 'pro' else 'free' end
    into v_plan
    from public.subscriptions s
   where s.user_id = new.user_id;

  if coalesce(v_plan, 'free') = 'pro' then
    return new;
  end if;

  if tg_table_name = 'trades' then
    select count(*) into v_count from public.trades where user_id = new.user_id;
    if v_count >= 30 then
      raise exception 'plan_limit_trades';
    end if;
  elsif tg_table_name = 'rules' then
    select count(*) into v_count from public.rules where user_id = new.user_id;
    if v_count >= 5 then
      raise exception 'plan_limit_rules';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_plan_limits() from public, anon, authenticated;

create trigger trades_plan_limit before insert on public.trades
  for each row execute function public.enforce_plan_limits();
create trigger rules_plan_limit before insert on public.rules
  for each row execute function public.enforce_plan_limits();

-- 2) Удаление собственного аккаунта вместе со всеми данными (профиль, счета, правила, сделки, отчёты).
--    Работает только для вошедшего пользователя и только для его собственной записи.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
