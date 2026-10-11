-- Проп-челлендж: цель по прибыли, дневной лимит убытка и общая просадка по сделкам из журнала.
create table public.prop_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.trading_accounts (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  start_balance numeric not null check (start_balance > 0 and start_balance < 1000000000000),
  profit_target_pct numeric not null check (profit_target_pct > 0 and profit_target_pct <= 1000),
  max_daily_loss_pct numeric not null check (max_daily_loss_pct > 0 and max_daily_loss_pct <= 100),
  max_total_loss_pct numeric not null check (max_total_loss_pct > 0 and max_total_loss_pct <= 100),
  trailing_dd boolean not null default false,
  min_trading_days int not null default 0 check (min_trading_days between 0 and 365),
  start_date date not null default current_date,
  end_date date check (end_date is null or end_date >= start_date),
  created_at timestamptz not null default now()
);
create index prop_challenges_user on public.prop_challenges (user_id, created_at desc);
alter table public.prop_challenges enable row level security;
revoke all on public.prop_challenges from anon, authenticated;
grant select, delete on public.prop_challenges to authenticated;
grant insert (user_id, account_id, name, start_balance, profit_target_pct, max_daily_loss_pct, max_total_loss_pct, trailing_dd, min_trading_days, start_date, end_date) on public.prop_challenges to authenticated;
create policy "prop_challenges: select own" on public.prop_challenges for select to authenticated using (user_id = auth.uid());
create policy "prop_challenges: insert own" on public.prop_challenges for insert to authenticated with check (user_id = auth.uid() and (account_id is null or exists (select 1 from public.trading_accounts a where a.id = account_id and a.user_id = auth.uid())));
create policy "prop_challenges: delete own" on public.prop_challenges for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.prop_challenges as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create or replace function public.prop_challenges_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.prop_challenges where user_id = new.user_id) >= 20 then raise exception 'limit_prop'; end if;
  return new;
end;
$$;
create trigger prop_challenges_limit before insert on public.prop_challenges for each row execute function public.prop_challenges_limit();
