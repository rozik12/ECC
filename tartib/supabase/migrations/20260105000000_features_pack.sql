-- Пакет возможностей: стратегии и скриншоты сделок, чек-лист, панель владельца, правило дневного убытка.

-- Стратегия и скриншот сделки
alter table public.trades add column strategy text not null default '';
alter table public.trades add column screenshot_path text;
create index trades_strategy_idx on public.trades (user_id, strategy);

-- Профиль: чек-лист перед сделкой и признак владельца
alter table public.profiles add column checklist_enabled boolean not null default true;
alter table public.profiles add column checklist jsonb;
alter table public.profiles add column is_admin boolean not null default false;

-- Пользователь может менять в своём профиле только эти поля (is_admin менять нельзя)
revoke update on public.profiles from authenticated;
grant update (name, language, timezone, currency, onboarded, checklist_enabled, checklist) on public.profiles to authenticated;

-- Хранилище скриншотов: у каждого пользователя своя папка
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-screenshots', 'trade-screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "screenshots: read own" on storage.objects for select to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "screenshots: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "screenshots: update own" on storage.objects for update to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "screenshots: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- Функции панели владельца: работают только для профилей с is_admin = true
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'onboarded', (select count(*) from public.profiles where onboarded),
    'active7d', (select count(distinct user_id) from public.trades where created_at > now() - interval '7 days'),
    'pro', (select count(*) from public.subscriptions where plan = 'pro' and status = 'active'),
    'trades', (select count(*) from public.trades),
    'trades7d', (select count(*) from public.trades where created_at > now() - interval '7 days'),
    'rules', (select count(*) from public.rules)
  );
end;
$$;

create or replace function public.admin_recent_users()
returns table (email text, created_at timestamptz, plan text, trades bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'forbidden';
  end if;
  return query
    select u.email::text, u.created_at, coalesce(s.plan, 'free')::text,
           (select count(*) from public.trades t where t.user_id = u.id)
      from auth.users u
      left join public.subscriptions s on s.user_id = u.id
     order by u.created_at desc
     limit 30;
end;
$$;

create or replace function public.admin_set_plan(target_email text, new_plan text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'forbidden';
  end if;
  if new_plan not in ('free', 'pro') then
    raise exception 'bad_plan';
  end if;
  update public.subscriptions
     set plan = new_plan, status = 'active', expires_at = null
   where user_id = (select id from auth.users where lower(email) = lower(target_email));
  if not found then
    raise exception 'user_not_found';
  end if;
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_recent_users() from public, anon;
revoke execute on function public.admin_set_plan(text, text) from public, anon;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_recent_users() to authenticated;
grant execute on function public.admin_set_plan(text, text) to authenticated;

-- Новый тип правила: дневной лимит убытка
alter table public.rules drop constraint rules_rule_type_check;
alter table public.rules add constraint rules_rule_type_check check (rule_type in (
  'max_risk_percent', 'min_risk_reward', 'max_leverage',
  'require_stop_loss', 'max_trades_per_day', 'max_daily_loss_percent', 'custom'
));
