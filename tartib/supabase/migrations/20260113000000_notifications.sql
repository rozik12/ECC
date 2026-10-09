-- Уведомления: центр уведомлений на сайте и пуш в Telegram.
-- Текст не хранится: храним вид события и параметры, а тексты берутся из словарей на языке пользователя.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('achievement', 'violation', 'goal', 'report', 'announcement')),
  params jsonb not null default '{}'::jsonb check (pg_column_size(params) < 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Когда отправлено в Telegram. Заполнено при создании — значит, отправлять не нужно (бот сам уже показал событие).
  pushed_at timestamptz
);
create index notifications_user_created on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
-- Пользователь может создать только свои обычные уведомления и поменять только отметку «прочитано»
grant insert (user_id, kind, params) on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "notifications: select own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications: insert own" on public.notifications for insert to authenticated with check (user_id = auth.uid() and kind <> 'announcement');
create policy "notifications: update own" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.notifications as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

-- В Telegram можно отключить пуш-уведомления отдельно от напоминаний
alter table public.telegram_links add column notify boolean not null default true;
grant update (notify) on public.telegram_links to authenticated;

-- Хранится не больше 200 последних уведомлений на человека
create or replace function public.trim_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
   where n.user_id = new.user_id
     and n.id in (select id from public.notifications where user_id = new.user_id order by created_at desc offset 200);
  return null;
end;
$$;
create trigger notifications_trim after insert on public.notifications for each row execute function public.trim_notifications();

-- Новое уведомление → бот присылает его в Telegram (если привязан и пуш включён). Секрет читается из закрытой таблицы bot_config.
create or replace function public.notify_telegram()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.pushed_at is null and exists (select 1 from public.telegram_links where user_id = new.user_id and notify) then
    begin
      perform net.http_post(
        url := 'https://rwmhsjznrlgsxqgclbbl.supabase.co/functions/v1/telegram-bot/notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.bot_config where key = 'cron_secret')),
        body := jsonb_build_object('id', new.id)
      );
    exception when others then
      null; -- сбой отправки не должен мешать сохранению
    end;
  end if;
  return null;
end;
$$;
create trigger notifications_push after insert on public.notifications for each row execute function public.notify_telegram();

-- Объявление всем пользователям (только владелец)
create or replace function public.admin_broadcast(p_title text, p_body text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) or not public.aal_ok() then
    raise exception 'forbidden';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(trim(coalesce(p_body, ''))) < 2 then
    raise exception 'invalid';
  end if;
  insert into public.notifications (user_id, kind, params)
    select id, 'announcement', jsonb_build_object('title', left(trim(p_title), 80), 'body', left(trim(p_body), 500)) from auth.users;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.admin_broadcast(text, text) from public, anon;
grant execute on function public.admin_broadcast(text, text) to authenticated;
