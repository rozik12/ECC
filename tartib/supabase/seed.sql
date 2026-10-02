-- Демо-данные для разработки.
-- Создаёт пользователя demo@tartib.app (пароль: demo12345), счёт на 5000 $, 5 правил и 21 сделку за последние 30 дней.
-- Запуск: Supabase → SQL Editor → вставить файл → Run. Повторный запуск ничего не делает, если демо-пользователь уже есть.
-- Не запускай на боевой базе с настоящими пользователями.

do $$
declare
  uid uuid;
  acc uuid;
  t record;
  trade_id uuid;
  vtype text;
  sign int;
  risk numeric;
begin
  select id into uid from auth.users where email = 'demo@tartib.app';
  if uid is not null then
    raise notice 'Демо-пользователь уже существует, пропускаю.';
    return;
  end if;

  uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'demo@tartib.app',
    extensions.crypt('demo12345', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Demo"}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'demo@tartib.app'), 'email', now(), now(), now());

  -- Профиль и подписку FREE уже создал триггер handle_new_user
  update public.profiles set name = 'Demo', onboarded = true, timezone = 'Asia/Tashkent' where id = uid;

  -- Демо-пользователю открыт PRO, чтобы были видны недельные отчёты
  update public.subscriptions set plan = 'pro' where user_id = uid;

  insert into public.trading_accounts (user_id, name, starting_balance, currency)
  values (uid, 'Основной счёт', 5000, 'USD') returning id into acc;

  insert into public.rules (user_id, name, description, rule_type, value) values
    (uid, 'Риск не более 1% на сделку', 'Не рискую больше 1% баланса в одной сделке.', 'max_risk_percent', 1),
    (uid, 'R:R не ниже 2', 'Беру сделки, где потенциальная прибыль минимум вдвое больше риска.', 'min_risk_reward', 2),
    (uid, 'Плечо не выше 10', 'Не использую слишком большое плечо.', 'max_leverage', 10),
    (uid, 'Стоп-лосс обязателен', 'Без стоп-лосса в сделку не вхожу.', 'require_stop_loss', null),
    (uid, 'Не больше 3 сделок в день', 'Ограничиваю число сделок, чтобы не торговать на эмоциях.', 'max_trades_per_day', 3);

  for t in
    select * from (values
      -- days_ago, hour, instrument, market, direction, entry, exit, stop, tp, size, leverage, emotion, violated_rule_types
      (29, 9,  'BTC/USDT', 'crypto',  'long',  60000,  60500,  59500,  61000,  0.1,   5,  'calm',      '{}'::text[]),
      (28, 10, 'ETH/USDT', 'crypto',  'short', 2500,   2450,   2550,   2400,   1,     3,  'confident', '{}'),
      (27, 11, 'EUR/USD',  'forex',   'long',  1.1000, 1.1030, 1.0980, 1.1060, 25000, 10, 'calm',      '{}'),
      (26, 12, 'AAPL',     'stocks',  'long',  190,    188,    188,    196,    25,    1,  'uncertain', '{}'),
      (25, 13, 'NQ',       'futures', 'long',  20000,  20080,  19950,  20150,  1,     5,  'calm',      '{}'),
      (24, 9,  'BTC/USDT', 'crypto',  'long',  61000,  60100,  60500,  62000,  0.2,   5,  'fomo',      '{max_risk_percent}'),
      (22, 10, 'ETH/USDT', 'crypto',  'long',  2520,   2570,   2480,   2600,   1.25,  3,  'calm',      '{}'),
      (21, 14, 'EUR/USD',  'forex',   'short', 1.1050, 1.1080, 1.1070, 1.1000, 30000, 10, 'revenge',   '{max_risk_percent}'),
      (20, 9,  'BTC/USDT', 'crypto',  'short', 62000,  61400,  62400,  61000,  0.12,  5,  'calm',      '{}'),
      (18, 15, 'AAPL',     'stocks',  'short', 195,    192,    197,    190,    25,    1,  'confident', '{}'),
      (17, 16, 'NQ',       'futures', 'short', 20150,  20230,  20180,  null,   3,     20, 'greed',      '{max_risk_percent,max_leverage}'),
      (15, 10, 'ETH/USDT', 'crypto',  'long',  2600,   2660,   2560,   2700,   1.25,  3,  'calm',      '{}'),
      (14, 11, 'BTC/USDT', 'crypto',  'long',  63000,  62500,  null,   null,   0.1,   5,  'fomo',      '{require_stop_loss}'),
      (12, 12, 'EUR/USD',  'forex',   'long',  1.0950, 1.0985, 1.0930, 1.1010, 25000, 10, 'confident', '{}'),
      (10, 13, 'NQ',       'futures', 'long',  20300,  20420,  20250,  20450,  1,     5,  'calm',      '{}'),
      (8,  9,  'BTC/USDT', 'crypto',  'short', 64000,  64400,  64400,  63000,  0.12,  5,  'uncertain', '{}'),
      (6,  14, 'ETH/USDT', 'crypto',  'long',  2700,   2640,   2650,   2800,   1.4,   3,  'fomo',      '{max_risk_percent}'),
      (4,  10, 'AAPL',     'stocks',  'long',  198,    201,    196,    204,    25,    1,  'calm',      '{}'),
      (2,  11, 'EUR/USD',  'forex',   'short', 1.1100, 1.1060, 1.1120, 1.1050, 25000, 10, 'confident', '{}'),
      (1,  12, 'NQ',       'futures', 'long',  20500,  20440,  20450,  null,   1,     5,  'uncertain', '{}'),
      (0,  8,  'BTC/USDT', 'crypto',  'long',  65000,  65300,  64500,  66000,  0.1,   5,  'calm',      '{}')
    ) as v(days_ago, hr, instrument, market, direction, entry, exit_p, stop_p, tp_p, size, lev, emotion, violated)
  loop
    sign := case when t.direction = 'long' then 1 else -1 end;
    risk := case when t.stop_p is null then null else round(abs(t.entry - t.stop_p) * t.size, 2) end;

    insert into public.trades (
      user_id, account_id, instrument, market, direction, entry_price, exit_price, stop_loss, take_profit,
      position_size, leverage, risk_percent, risk_amount, potential_profit, potential_loss, pnl, emotion,
      rules_followed, reason, traded_at
    ) values (
      uid, acc, t.instrument, t.market, t.direction, t.entry, t.exit_p, t.stop_p, t.tp_p,
      t.size, t.lev,
      case when risk is null then null else round(risk / 5000 * 100, 4) end,
      risk,
      case when t.tp_p is null then null else round(abs(t.tp_p - t.entry) * t.size, 2) end,
      risk,
      round((t.exit_p - t.entry) * t.size * sign, 2),
      t.emotion,
      coalesce(array_length(t.violated, 1), 0) = 0,
      'Демо-сделка',
      least(now() - interval '5 minutes',
            date_trunc('day', now()) - (t.days_ago || ' days')::interval + (t.hr || ' hours')::interval)
    ) returning id into trade_id;

    foreach vtype in array t.violated loop
      insert into public.trade_rule_violations (trade_id, rule_id)
      select trade_id, id from public.rules where user_id = uid and rule_type = vtype;
    end loop;
  end loop;
end $$;
