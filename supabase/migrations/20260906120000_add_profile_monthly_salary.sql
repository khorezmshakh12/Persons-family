-- Editable monthly salary per staff member, set from the Edit Staff dialog.
-- Additive and idempotent: existing rows default to 0 rather than null so
-- every consumer can treat it as a plain number (db/client.ts parses
-- `numeric` straight to a JS number).
begin;

alter table profiles add column if not exists monthly_salary numeric not null default 0;

commit;
