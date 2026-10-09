-- Список наблюдения и ценовые алерты. Проверка алертов раз в минуту (pg_cron → функция бота), сработавший алерт создаёт уведомление.

create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{4,24}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table public.watchlist enable row level security;
revoke all on public.watchlist from anon, authenticated;
grant select, insert, delete on public.watchlist to authenticated;
create policy "watchlist: select own" on public.watchlist for select to authenticated using (user_id = auth.uid());
create policy "watchlist: insert own" on public.watchlist for insert to authenticated with check (user_id = auth.uid());
create policy "watchlist: delete own" on public.watchlist for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.watchlist as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{4,24}$'),
  direction text not null check (direction in ('above', 'below')),
  price numeric(28, 10) not null check (price > 0),
  note text not null default '' check (length(note) <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price numeric(28, 10)
);
create index price_alerts_active on public.price_alerts (symbol) where active;
create index price_alerts_user on public.price_alerts (user_id, created_at desc);
alter table public.price_alerts enable row level security;
revoke all on public.price_alerts from anon, authenticated;
grant select, delete on public.price_alerts to authenticated;
grant insert (user_id, symbol, direction, price, note) on public.price_alerts to authenticated;
create policy "price_alerts: select own" on public.price_alerts for select to authenticated using (user_id = auth.uid());
create policy "price_alerts: insert own" on public.price_alerts for insert to authenticated with check (user_id = auth.uid());
create policy "price_alerts: delete own" on public.price_alerts for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.price_alerts as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

-- Лимиты: 30 пар в списке наблюдения, 20 действующих алертов, 100 записей алертов всего
create or replace function public.market_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'watchlist' then
    if (select count(*) from public.watchlist where user_id = new.user_id) >= 30 then raise exception 'limit_watchlist'; end if;
  else
    if (select count(*) from public.price_alerts where user_id = new.user_id and active) >= 20 then raise exception 'limit_alerts'; end if;
    delete from public.price_alerts
     where user_id = new.user_id and not active
       and id in (select id from public.price_alerts where user_id = new.user_id and not active order by created_at desc offset 80);
  end if;
  return new;
end;
$$;
create trigger watchlist_limits before insert on public.watchlist for each row execute function public.market_limits();
create trigger price_alerts_limits before insert on public.price_alerts for each row execute function public.market_limits();

-- Новый вид уведомления
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('achievement', 'violation', 'goal', 'report', 'announcement', 'price_alert'));

-- Раз в минуту база будит бота, но только когда есть действующие алерты
select cron.schedule(
  'price-alerts',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://rwmhsjznrlgsxqgclbbl.supabase.co/functions/v1/telegram-bot/alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.bot_config where key = 'cron_secret')),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.price_alerts where active);
  $job$
);
