-- Настройки бота и состояние диалога (мастер новой сделки, ожидание ответа, защита от спама)
alter table public.telegram_links
  add column active_account_id uuid references public.trading_accounts (id) on delete set null,
  add column daily_summary boolean not null default false,
  add column weekly_report boolean not null default true,
  add column last_daily_at timestamptz,
  add column last_weekly_at timestamptz;

create table public.telegram_state (
  chat_id bigint primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.telegram_state enable row level security;
revoke all on public.telegram_state from anon, authenticated;
