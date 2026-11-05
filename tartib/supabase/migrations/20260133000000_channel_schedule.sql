-- Расписание постов канала: у поста можно задать время (scheduled_at), задача каждые 10 минут отправляет то, что пора.
-- Пока есть посты с расписанием, ежедневная отправка по очереди ждёт.
alter table public.channel_posts add column if not exists scheduled_at timestamptz;
-- (функции send_due_channel_post и send_channel_post и задача channel-post-due применены в базе; расписание задаётся запросом update ... scheduled_at)
