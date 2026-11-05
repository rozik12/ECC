-- Платных тарифов больше нет: ограничения на число сделок и правил сняты у всех.
-- Триггеры trades_plan_limit и rules_plan_limit оставлены, но функция ничего не проверяет.
create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;
