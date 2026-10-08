-- Раз в час база вызывает бота; он сам решает, кому и когда напомнить (дневное время пользователя, не чаще раза в 3 дня).
-- Секрет читается из закрытой таблицы bot_config, в коде его нет.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule(
  'telegram-reminders',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://rwmhsjznrlgsxqgclbbl.supabase.co/functions/v1/telegram-bot/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.bot_config where key = 'cron_secret')),
    body := '{}'::jsonb
  );
  $job$
);
