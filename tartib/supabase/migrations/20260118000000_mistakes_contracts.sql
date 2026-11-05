-- Разбор ошибок: пояснение «из-за чего это случилось». Торговля контрактами: число контрактов и размер одного контракта.
alter table public.trades add column mistake_note text not null default '' check (length(mistake_note) <= 2000);
alter table public.trades add column contracts numeric check (contracts > 0 and contracts < 1000000000);
alter table public.trades add column contract_size numeric check (contract_size > 0 and contract_size < 1000000000);
alter table public.trades add constraint trades_contracts_pair check ((contracts is null) = (contract_size is null));
