-- Рынок «Золото и металлы» в журнале: лоты по 100 унций, режим контрактов; запись по API принимает этот рынок.
alter table public.trades drop constraint trades_market_check;
alter table public.trades add constraint trades_market_check check (market = any (array['crypto', 'forex', 'stocks', 'futures', 'options', 'metals']));
-- Функция api_log_trade обновлена (список рынков): см. миграцию 20260125, единственное отличие — 'metals' в проверке рынка.
