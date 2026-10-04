-- Strategy ↔ Tasks: a strategy task with an assignee gets a mirror row in
-- `tasks`, so the assignee (who usually can't open /strategy) sees it on
-- their Tasks board and gets the usual Telegram notice. The mirror is
-- written by src/lib/strategy-sync.ts; the trigger below carries every
-- status change on the Tasks side (drag, submit, approve, proof upload,
-- crons) back to the strategy task, whichever code path made it.
begin;

alter table tasks
  add column if not exists strategy_task_id uuid references strategy_tasks(id) on delete set null;

create unique index if not exists tasks_strategy_task_id_key
  on tasks (strategy_task_id) where strategy_task_id is not null;

create or replace function sync_strategy_task_from_mirror() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  v_status := case new.status
    when 'pending' then 'todo'
    when 'in_progress' then 'progress'
    when 'submitted' then 'review'
    when 'awaiting_upload' then 'review'
    when 'done' then 'done'
  end;
  if v_status is null then
    return new;
  end if;
  update strategy_tasks set
    status = v_status,
    progress = case v_status
      when 'done' then 100
      when 'review' then greatest(progress, 80)
      when 'progress' then greatest(progress, 10)
      else progress
    end,
    done_at = case when v_status = 'done' then coalesce(done_at, now()) else null end,
    updated_at = now()
  where id = new.strategy_task_id and status is distinct from v_status;
  return new;
end;
$$;

drop trigger if exists tasks_sync_strategy on tasks;
create trigger tasks_sync_strategy
  after update of status on tasks
  for each row
  when (new.strategy_task_id is not null and new.status is distinct from old.status)
  execute function sync_strategy_task_from_mirror();

-- Backfill: open strategy tasks that already have an assignee get their
-- mirror now (no Telegram for these — it would be a burst of old news).
insert into tasks (title, description, assigned_to, assigned_by, deadline, status, strategy_task_id)
select st.title, nullif(st.description, ''), st.assignee_id, coalesce(st.created_by, st.assignee_id),
       (st.end_date + time '18:00') at time zone 'Asia/Tashkent',
       (case st.status when 'progress' then 'in_progress' when 'review' then 'submitted' else 'pending' end)::task_status,
       st.id
from strategy_tasks st
join profiles p on p.id = st.assignee_id and p.is_active
where st.assignee_id is not null
  and st.status <> 'done'
  and not exists (select 1 from tasks t where t.strategy_task_id = st.id);

commit;
