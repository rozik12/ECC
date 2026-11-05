-- Журнал сделок: теги, оценка исполнения, категории ошибок, время закрытия и шаблоны сделок.
alter table public.trades add column tags text[] not null default '{}';
alter table public.trades add column grade text check (grade in ('A', 'B', 'C', 'D'));
alter table public.trades add column mistakes text[] not null default '{}';
alter table public.trades add column closed_at timestamptz;
create index trades_tags_gin on public.trades using gin (tags);

-- Проверка содержимого: не больше 10 тегов по 30 знаков, ошибки только из списка, закрытие не раньше открытия
create or replace function public.validate_trade_journal()
returns trigger
language plpgsql
as $$
declare
  t text;
begin
  if cardinality(new.tags) > 10 then raise exception 'invalid_tags'; end if;
  foreach t in array new.tags loop
    if length(btrim(t)) = 0 or length(t) > 30 then raise exception 'invalid_tags'; end if;
  end loop;
  if cardinality(new.mistakes) > 10 then raise exception 'invalid_mistakes'; end if;
  foreach t in array new.mistakes loop
    if t not in ('fomo_entry', 'moved_stop', 'oversize', 'early_exit', 'late_exit', 'no_plan', 'revenge', 'overtrading', 'chased', 'no_stop') then
      raise exception 'invalid_mistakes';
    end if;
  end loop;
  if new.closed_at is not null and new.closed_at < new.traded_at then raise exception 'invalid_closed_at'; end if;
  return new;
end;
$$;
create trigger trades_validate_journal before insert or update on public.trades for each row execute function public.validate_trade_journal();

-- Шаблоны сделок: набор полей без цен, который подставляется в новую сделку
create table public.trade_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  data jsonb not null check (pg_column_size(data) < 2000),
  created_at timestamptz not null default now()
);
create index trade_templates_user on public.trade_templates (user_id, created_at desc);
alter table public.trade_templates enable row level security;
revoke all on public.trade_templates from anon, authenticated;
grant select, delete on public.trade_templates to authenticated;
grant insert (user_id, name, data) on public.trade_templates to authenticated;
create policy "trade_templates: select own" on public.trade_templates for select to authenticated using (user_id = auth.uid());
create policy "trade_templates: insert own" on public.trade_templates for insert to authenticated with check (user_id = auth.uid());
create policy "trade_templates: delete own" on public.trade_templates for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.trade_templates as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create or replace function public.trade_templates_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.trade_templates where user_id = new.user_id) >= 20 then raise exception 'limit_templates'; end if;
  return new;
end;
$$;
create trigger trade_templates_limit before insert on public.trade_templates for each row execute function public.trade_templates_limit();
