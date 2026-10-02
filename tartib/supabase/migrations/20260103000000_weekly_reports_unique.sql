-- Один отчёт на один период: повторное формирование обновляет существующий.
create unique index weekly_reports_user_period_key on public.weekly_reports (user_id, period_start, period_end);
