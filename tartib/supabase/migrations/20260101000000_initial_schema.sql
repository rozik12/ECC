-- Tartib: начальная схема базы данных

-- ───────────── Таблицы ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  language text not null default 'ru' check (language in ('ru', 'uz', 'en')),
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  starting_balance numeric(18, 2) not null check (starting_balance >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  rule_type text not null check (rule_type in (
    'max_risk_percent', 'min_risk_reward', 'max_leverage',
    'require_stop_loss', 'max_trades_per_day', 'custom'
  )),
  value numeric(18, 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.trading_accounts (id) on delete cascade,
  instrument text not null,
  market text not null check (market in ('crypto', 'forex', 'stocks', 'futures')),
  direction text not null check (direction in ('long', 'short')),
  entry_price numeric(24, 8) not null,
  exit_price numeric(24, 8),
  stop_loss numeric(24, 8),
  take_profit numeric(24, 8),
  position_size numeric(24, 8) not null,
  leverage numeric(10, 2) not null default 1,
  risk_percent numeric(8, 4),
  risk_amount numeric(18, 2),
  potential_profit numeric(18, 2),
  potential_loss numeric(18, 2),
  pnl numeric(18, 2) not null default 0,
  emotion text not null default 'other' check (emotion in (
    'calm', 'fear', 'greed', 'fomo', 'revenge', 'confident', 'uncertain', 'other'
  )),
  rules_followed boolean not null default true,
  reason text not null default '',
  plan text not null default '',
  comment text not null default '',
  traded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.trade_rule_violations (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  rule_id uuid not null references public.rules (id) on delete cascade,
  unique (trade_id, rule_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────────── Индексы ─────────────
create index trading_accounts_user_id_idx on public.trading_accounts (user_id);
create index rules_user_id_idx on public.rules (user_id);
create index trades_user_id_idx on public.trades (user_id);
create index trades_user_traded_at_idx on public.trades (user_id, traded_at desc);
create index trades_account_id_idx on public.trades (account_id);
create index trade_rule_violations_trade_id_idx on public.trade_rule_violations (trade_id);
create index trade_rule_violations_rule_id_idx on public.trade_rule_violations (rule_id);
create index weekly_reports_user_id_idx on public.weekly_reports (user_id, period_start desc);

-- ───────────── Защита строк (RLS) ─────────────
alter table public.profiles enable row level security;
alter table public.trading_accounts enable row level security;
alter table public.rules enable row level security;
alter table public.trades enable row level security;
alter table public.trade_rule_violations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.weekly_reports enable row level security;

-- Профиль: видеть и менять только свой. Создаёт его триггер.
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Счета, правила, сделки, отчёты: полный доступ только к своим строкам.
create policy "accounts: own" on public.trading_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rules: own" on public.rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trades: own" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_reports: own" on public.weekly_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Подписка: пользователь только читает. Менять её сможет лишь сервер (после оплаты).
create policy "subscriptions: select own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Нарушения правил: доступ через владельца сделки, и правило тоже должно быть своим.
create policy "violations: own" on public.trade_rule_violations
  for all
  using (exists (select 1 from public.trades t where t.id = trade_id and t.user_id = auth.uid()))
  with check (
    exists (select 1 from public.trades t where t.id = trade_id and t.user_id = auth.uid())
    and exists (select 1 from public.rules r where r.id = rule_id and r.user_id = auth.uid())
  );

-- ───────────── Регистрация: профиль и подписка FREE ─────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
