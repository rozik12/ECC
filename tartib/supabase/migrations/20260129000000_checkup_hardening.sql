-- Проверка сайта: быстрее политики доступа, закрыты лишние вызовы, индексы.

-- 1. Политики RLS: auth.uid() считался заново для каждой строки. Оборачиваем в (select ...), результат считается один раз на запрос.
do $$
declare
  p record;
  q text;
  w text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual;
    w := p.with_check;
    if (q is not null and q ~ 'auth\.uid\(\)' and q !~ 'SELECT auth\.uid\(\)') or (w is not null and w ~ 'auth\.uid\(\)' and w !~ 'SELECT auth\.uid\(\)') then
      if q is not null then q := replace(q, 'auth.uid()', '(select auth.uid())'); end if;
      if w is not null then w := replace(w, 'auth.uid()', '(select auth.uid())'); end if;
      execute format('alter policy %I on %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
        case when q is not null then ' using (' || q || ')' else '' end,
        case when w is not null then ' with check (' || w || ')' else '' end);
    end if;
  end loop;
end $$;

-- 2. Функции-триггеры не должны вызываться снаружи через /rest/v1/rpc (триггеры работают и без этого права)
revoke execute on function public.api_tokens_limit() from public, anon, authenticated;
revoke execute on function public.market_limits() from public, anon, authenticated;
revoke execute on function public.notify_telegram() from public, anon, authenticated;
revoke execute on function public.portfolio_lots_limit() from public, anon, authenticated;
revoke execute on function public.prop_challenges_limit() from public, anon, authenticated;
revoke execute on function public.support_limits() from public, anon, authenticated;
revoke execute on function public.support_notify() from public, anon, authenticated;
revoke execute on function public.trade_templates_limit() from public, anon, authenticated;
revoke execute on function public.trim_notifications() from public, anon, authenticated;

-- 3. Фиксированный путь поиска у двух функций
alter function public.validate_trade_journal() set search_path = public;
alter function public.diary_touch() set search_path = public;

-- 4. Индексы под внешние ключи
create index if not exists prop_challenges_account_id_idx on public.prop_challenges (account_id);
create index if not exists telegram_links_active_account_id_idx on public.telegram_links (active_account_id);
