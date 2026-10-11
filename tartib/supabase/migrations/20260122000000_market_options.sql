-- Рынок «Опционы»: цена сделки — премия, размер — число контрактов на множитель (обычно 100).
alter table public.trades drop constraint trades_market_check;
alter table public.trades add constraint trades_market_check check (market = any (array['crypto', 'forex', 'stocks', 'futures', 'options']));
