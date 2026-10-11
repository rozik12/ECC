-- Профиль трейдера: срок удержания сделок и рынки. По ним главная показывает нужные ярлыки.
alter table public.profiles add column trader_horizon text check (trader_horizon in ('scalper', 'day', 'swing', 'position'));
alter table public.profiles add column trader_markets text[] not null default '{}' check (trader_markets <@ array['crypto', 'forex', 'stocks', 'futures', 'options', 'commodities']::text[] and cardinality(trader_markets) <= 6);
grant update (trader_horizon, trader_markets) on public.profiles to authenticated;
