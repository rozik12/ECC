-- Портфель: кроме монет, можно вести акции, ETF и золото (символы вида BRK-B, GC=F, ^NDX).
alter table public.portfolio_lots drop constraint portfolio_lots_symbol_check;
alter table public.portfolio_lots add constraint portfolio_lots_symbol_check check (symbol ~ '^[A-Z0-9.^=-]{1,20}$');
