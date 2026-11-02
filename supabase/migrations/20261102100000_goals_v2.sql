-- Maqsadlar v2 (2026-11-02): muddat, muhimlik, ko'chish hisobi, eslatma.
-- due_date/due_time: ixtiyoriy muddat (kunlikda sana = o'sha kun, soat bilan).
-- carry_count: necha marta keyingi davrga o'tgani (avto yoki qo'lda).
-- moved_from: qo'lda ko'chirilganda eski period_key — «Qaytarish» uchun.
-- reminded_at: muddat eslatmasi yuborilgan payt (bir marta).
begin;

alter table goals add column if not exists due_date date;
alter table goals add column if not exists due_time text;
alter table goals add column if not exists priority boolean not null default false;
alter table goals add column if not exists carry_count int not null default 0;
alter table goals add column if not exists moved_from text;
alter table goals add column if not exists reminded_at timestamptz;

alter table goals drop constraint if exists goals_due_time_check;
alter table goals add constraint goals_due_time_check check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create index if not exists goals_due_idx on goals (due_date) where not done and due_date is not null;

commit;
