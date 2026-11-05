-- Дневник дня: утренний план и вечерний итог, настроение и энергия. Одна запись на пользователя и день.
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  plan text not null default '' check (length(plan) <= 2000),
  review text not null default '' check (length(review) <= 2000),
  lesson text not null default '' check (length(lesson) <= 500),
  followed_plan boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create index diary_entries_user_day on public.diary_entries (user_id, day desc);
alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from anon, authenticated;
grant select, delete on public.diary_entries to authenticated;
grant insert (user_id, day, mood, energy, plan, review, lesson, followed_plan) on public.diary_entries to authenticated;
grant update (mood, energy, plan, review, lesson, followed_plan, updated_at) on public.diary_entries to authenticated;
create policy "diary: select own" on public.diary_entries for select to authenticated using (user_id = auth.uid());
create policy "diary: insert own" on public.diary_entries for insert to authenticated with check (user_id = auth.uid());
create policy "diary: update own" on public.diary_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "diary: delete own" on public.diary_entries for delete to authenticated using (user_id = auth.uid());
create policy "mfa required" on public.diary_entries as restrictive to authenticated using (public.aal_ok()) with check (public.aal_ok());

create or replace function public.diary_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger diary_entries_touch before update on public.diary_entries for each row execute function public.diary_touch();
