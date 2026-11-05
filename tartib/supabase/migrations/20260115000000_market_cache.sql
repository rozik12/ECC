-- Кэш рыночных данных: бесплатные источники (календарь, CoinGecko) не отвечают серверам сайта, поэтому их раз в 10 минут
-- загружает функция бота (из другой сети) и кладёт сюда. Читать могут все вошедшие, писать только сервис.
create table public.market_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.market_cache enable row level security;
revoke all on public.market_cache from anon, authenticated;
grant select on public.market_cache to authenticated;
create policy "market_cache: read" on public.market_cache for select to authenticated using (true);

select cron.schedule(
  'market-refresh',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://rwmhsjznrlgsxqgclbbl.supabase.co/functions/v1/telegram-bot/refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.bot_config where key = 'cron_secret')),
    body := '{}'::jsonb
  );
  $job$
);
