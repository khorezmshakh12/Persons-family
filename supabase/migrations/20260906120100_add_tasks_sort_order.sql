-- Manual board ordering for the tasks kanban (Move up / Move down).
-- Additive and idempotent: existing rows all start at 0, which keeps the
-- previous `order by created_at desc` result intact until someone actually
-- reorders a column (see reorderTaskAction, which renumbers a status'
-- siblings 0..n-1 on the first move).
begin;

alter table tasks add column if not exists sort_order integer not null default 0;

commit;
