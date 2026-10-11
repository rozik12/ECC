-- Крипто: фандинг и тип рынка у сделки, учёт портфеля (покупки и продажи монет).
alter table public.trades add column funding numeric not null default 0 check (funding > -1000000000 and funding < 1000000000);
alter table public.trades add column crypto_kind text check (crypto_kind in ('spot', 'perp'));

create table public.portfolio_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{2,20}$'),
  side text not null check (side in ('buy', 'sell')),
  amount numeric not null check (amount > 0 and amount < 1000000000000),
  price numeric not null check (price >= 0 and price < 1000000000000),
  fee numeric not null default 0 check (fee >= 0 and fee < 1000000000),
  note text not null default '' check (length(note) <= 200),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index portfolio_lots_user on public.portfolio_lots (user_id, symbol, occurred_at);
alter table public.portfolio_lots enable row level security;
revoke all on public.portfolio_lots from anon, authenticated;
grant select, delete on public.portfolio_lots to authenticated;
grant insert (user_id, symbol, side, amount, price, fee, note, occurred_at) on public.portfolio_lots to authenticated;
create policy "portfolio_lots: select own" on public.portfolio_lots for select to authenticated using (user_id = auth.uid());
create policy "portfolio_lots: insert own" on public.portfolio_lots for insert to authenticated with check (user_id = auth.uid());
create policy "portfolio_lots: delete own" on public.portfolio_lots for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.portfolio_lots as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create or replace function public.portfolio_lots_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.portfolio_lots where user_id = new.user_id) >= 3000 then raise exception 'limit_portfolio'; end if;
  return new;
end;
$$;
create trigger portfolio_lots_limit before insert on public.portfolio_lots for each row execute function public.portfolio_lots_limit();
