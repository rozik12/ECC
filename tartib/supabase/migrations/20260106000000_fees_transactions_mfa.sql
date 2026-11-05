-- Комиссии сделок, пополнения и выводы, двухфакторная защита на уровне базы.

-- Комиссии и своп сделки (P&L в базе остаётся чистым: после комиссий)
alter table public.trades add column fees numeric(18, 2) not null default 0 check (fees >= 0);

-- Пополнения и выводы средств по счёту
create table public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.trading_accounts (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric(18, 2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index account_transactions_user_idx on public.account_transactions (user_id, occurred_at desc);
create index account_transactions_account_idx on public.account_transactions (account_id);
alter table public.account_transactions enable row level security;
create policy "transactions: own" on public.account_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Баланс = начальный баланс + P&L сделок + пополнения - выводы
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.starting_balance,
  a.starting_balance
    + coalesce((select sum(t.pnl) from public.trades t where t.account_id = a.id), 0)
    + coalesce((select sum(case when x.kind = 'deposit' then x.amount else -x.amount end)
                  from public.account_transactions x where x.account_id = a.id), 0) as balance
from public.trading_accounts a;

-- Если у пользователя включена двухфакторная защита, данные доступны только после ввода кода (сессия aal2)
create or replace function public.aal_ok()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke execute on function public.aal_ok() from public, anon;
grant execute on function public.aal_ok() to authenticated;

create policy "mfa required" on public.profiles as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.trading_accounts as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.rules as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.trades as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.trade_rule_violations as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.subscriptions as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.weekly_reports as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "mfa required" on public.account_transactions as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());
create policy "screenshots: mfa required" on storage.objects as restrictive to authenticated
  using (bucket_id <> 'trade-screenshots' or public.aal_ok())
  with check (bucket_id <> 'trade-screenshots' or public.aal_ok());

-- Владелец может отключить 2FA пользователю, потерявшему телефон (фактор помечается как неподтверждённый)
create or replace function public.admin_reset_mfa(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'forbidden';
  end if;
  update auth.mfa_factors
     set status = 'unverified'
   where user_id = (select id from auth.users where lower(email) = lower(target_email));
end;
$$;
revoke execute on function public.admin_reset_mfa(text) from public, anon;
grant execute on function public.admin_reset_mfa(text) to authenticated;
