-- Текущий баланс счёта = начальный баланс + сумма P&L всех его сделок.
-- security_invoker: view подчиняется RLS, каждый видит только свои счета.
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.starting_balance,
  a.starting_balance + coalesce(sum(t.pnl), 0) as balance
from public.trading_accounts a
left join public.trades t on t.account_id = a.id
group by a.id;
