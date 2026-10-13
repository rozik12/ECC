-- Личные ключи для роботов и скриптов: они записывают сделки в журнал через адрес /api/v1/trades.
-- В базе хранится только хэш ключа; сам ключ показывается один раз при создании.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  prefix text not null check (length(prefix) between 4 and 16),
  token_hash text not null unique check (length(token_hash) = 64),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index api_tokens_user on public.api_tokens (user_id, created_at desc);
alter table public.api_tokens enable row level security;
revoke all on public.api_tokens from anon, authenticated;
grant select (id, user_id, name, prefix, created_at, last_used_at), delete on public.api_tokens to authenticated;
grant insert (user_id, name, prefix, token_hash) on public.api_tokens to authenticated;
create policy "api_tokens: select own" on public.api_tokens for select to authenticated using (user_id = auth.uid());
create policy "api_tokens: insert own" on public.api_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "api_tokens: delete own" on public.api_tokens for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.api_tokens as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create or replace function public.api_tokens_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.api_tokens where user_id = new.user_id) >= 5 then raise exception 'limit_tokens'; end if;
  return new;
end;
$$;
create trigger api_tokens_limit before insert on public.api_tokens for each row execute function public.api_tokens_limit();

-- Запись сделки по ключу. Функция доступна без входа, но делает что-то только при верном ключе (256 бит случайности) и записывает сделку ровно тому, кому ключ принадлежит.
-- Проверка торговых правил здесь не выполняется: сделка помечается как соответствующая правилам, поэтому такие записи видны по тегу «api».
create or replace function public.api_log_trade(p_token text, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_token uuid;
  v_account uuid;
  v_instrument text;
  v_market text;
  v_direction text;
  v_entry numeric;
  v_exit numeric;
  v_size numeric;
  v_fees numeric;
  v_funding numeric;
  v_leverage numeric;
  v_at timestamptz;
  v_closed timestamptz;
  v_pnl numeric;
  v_id uuid;
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 200 then raise exception 'invalid_token'; end if;
  select id, user_id into v_token, v_user from public.api_tokens where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_user is null then raise exception 'invalid_token'; end if;
  if (select count(*) from public.trades where user_id = v_user and created_at > now() - interval '1 minute') >= 300 then raise exception 'rate_limited'; end if;

  begin
    v_instrument := upper(btrim(p->>'instrument'));
    v_market := coalesce(p->>'market', 'crypto');
    v_direction := lower(p->>'direction');
    v_entry := (p->>'entry_price')::numeric;
    v_exit := nullif(p->>'exit_price', '')::numeric;
    v_size := (p->>'position_size')::numeric;
    v_fees := coalesce(nullif(p->>'fees', '')::numeric, 0);
    v_funding := coalesce(nullif(p->>'funding', '')::numeric, 0);
    v_leverage := coalesce(nullif(p->>'leverage', '')::numeric, 1);
    v_at := coalesce(nullif(p->>'traded_at', '')::timestamptz, now());
    v_closed := nullif(p->>'closed_at', '')::timestamptz;
  exception when others then
    raise exception 'invalid_payload';
  end;
  if v_instrument is null or length(v_instrument) not between 1 and 30 then raise exception 'invalid_payload'; end if;
  if v_market not in ('crypto', 'forex', 'stocks', 'futures', 'options', 'metals') then raise exception 'invalid_payload'; end if;
  if v_direction not in ('long', 'short') then raise exception 'invalid_payload'; end if;
  if v_entry is null or v_entry <= 0 or v_entry >= 1e12 then raise exception 'invalid_payload'; end if;
  if v_exit is not null and (v_exit <= 0 or v_exit >= 1e12) then raise exception 'invalid_payload'; end if;
  if v_size is null or v_size <= 0 or v_size >= 1e12 then raise exception 'invalid_payload'; end if;
  if v_fees < 0 or v_fees >= 1e9 or abs(v_funding) >= 1e9 or v_leverage < 1 or v_leverage > 1000 then raise exception 'invalid_payload'; end if;
  if v_at > now() + interval '1 day' or v_at < timestamptz '2010-01-01' then raise exception 'invalid_payload'; end if;
  if v_closed is not null and v_closed < v_at then raise exception 'invalid_payload'; end if;

  if nullif(p->>'account', '') is not null then
    select id into v_account from public.trading_accounts where user_id = v_user and name = p->>'account' limit 1;
  else
    select id into v_account from public.trading_accounts where user_id = v_user order by created_at limit 1;
  end if;
  if v_account is null then raise exception 'no_account'; end if;

  if nullif(p->>'pnl', '') is not null then
    v_pnl := (p->>'pnl')::numeric;
  elsif v_exit is not null then
    v_pnl := (case when v_direction = 'long' then v_exit - v_entry else v_entry - v_exit end) * v_size - v_fees - v_funding;
  else
    v_pnl := -v_fees - v_funding;
  end if;

  insert into public.trades (user_id, account_id, instrument, market, direction, entry_price, exit_price, position_size, leverage, pnl, fees, funding, emotion, rules_followed, strategy, comment, traded_at, closed_at, tags)
  values (v_user, v_account, v_instrument, v_market, v_direction, v_entry, v_exit, v_size, v_leverage, round(v_pnl, 2), v_fees, v_funding, 'other', true, left(coalesce(p->>'strategy', ''), 40), left(coalesce(p->>'comment', ''), 2000), v_at, case when v_exit is null then null else v_closed end, array['api'])
  returning id into v_id;

  update public.api_tokens set last_used_at = now() where id = v_token;
  return v_id;
end;
$$;
revoke all on function public.api_log_trade(text, jsonb) from public;
grant execute on function public.api_log_trade(text, jsonb) to anon, authenticated;
