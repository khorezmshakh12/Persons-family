-- ==========================================================================
-- Task completion → CEO approval → proof-upload workflow.
--
-- "Done" stops being something the assignee can reach on their own. Moving a
-- task to done now parks it at `submitted` (pending CEO review); the CEO
-- either approves it (→ `done`, or → `awaiting_upload` when the task was
-- flagged `requires_proof`) or rejects it with a mandatory written reason
-- (→ back to `in_progress`, and the task's `star_penalty` is charged there
-- and then).
--
-- Applied by `npm run migrate` (scripts/migrate.ts). Self-contained
-- transaction, additive / IF NOT EXISTS throughout, safe to re-run.
-- ==========================================================================

begin;

-- gen_random_uuid() — already ensured by the baseline, repeated so this file
-- stands on its own.
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. The two new statuses.
--
--    `tasks.status` predates the migration runner (it is part of the
--    pre-baseline schema), so this file does not get to assume how it was
--    declared. It handles both shapes:
--
--      * a Postgres enum  -> ALTER TYPE ... ADD VALUE IF NOT EXISTS
--        (allowed inside a transaction block since PG12, as long as the new
--        label is not *used* in the same transaction — it isn't, the
--        backfill below only touches existing labels).
--      * plain text + CHECK -> drop every CHECK on `tasks` whose definition
--        mentions `status`, then install one that spells out all five.
--        Mirrors the baseline migration's ceo_score constraint sweep.
--
--    Either way the resulting domain is:
--      pending | in_progress | submitted | awaiting_upload | done
-- --------------------------------------------------------------------------
do $$
declare
  v_typname text;
  v_typtype char;
  v_conname text;
begin
  select t.typname, t.typtype
    into v_typname, v_typtype
    from pg_attribute a
    join pg_class     c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type      t on t.oid = a.atttypid
   where n.nspname = 'public'
     and c.relname = 'tasks'
     and a.attname = 'status'
     and a.attnum > 0
     and not a.attisdropped;

  if v_typname is null then
    raise exception 'tasks.status column not found — refusing to continue';
  end if;

  if v_typtype = 'e' then
    execute format('alter type public.%I add value if not exists %L', v_typname, 'submitted');
    execute format('alter type public.%I add value if not exists %L', v_typname, 'awaiting_upload');
  else
    for v_conname in
      select con.conname
        from pg_constraint con
        join pg_class     c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'tasks'
         and con.contype = 'c'
         and pg_get_constraintdef(con.oid) ilike '%status%'
    loop
      execute format('alter table public.tasks drop constraint %I', v_conname);
    end loop;

    alter table public.tasks
      add constraint tasks_status_check
      check (status in ('pending', 'in_progress', 'submitted', 'awaiting_upload', 'done'));
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2. Proof requirement + the review record.
--
--    Kept as columns on `tasks` rather than a `task_reviews` history table:
--    a task carries exactly one *current* review verdict, the board and the
--    card read it on every render, and the append-only history that does
--    matter (who was charged what, and why) already lives in
--    `star_transactions`.
-- --------------------------------------------------------------------------
alter table tasks add column if not exists requires_proof    boolean not null default false;
alter table tasks add column if not exists submitted_at      timestamptz;
alter table tasks add column if not exists reviewed_by       uuid references profiles(id);
alter table tasks add column if not exists reviewed_at       timestamptz;
alter table tasks add column if not exists rejection_reason  text;

-- The CEO's review queue ("everything waiting on me"), and the assignee's
-- "waiting on my upload" list.
create index if not exists tasks_review_status_idx on tasks (status, submitted_at);

-- --------------------------------------------------------------------------
-- 3. Attachments.
--
--    Two flavours in one table:
--      * ordinary attachments — added by the CEO at create/edit time or by
--        the assignee when they submit.
--      * the proof file (`is_proof`) — the one the assignee must upload
--        while the task sits at `awaiting_upload`.
--
--    `object_path` is a Cloud Storage object path, never a signed URL: URLs
--    expire, paths don't, so reads are re-signed on demand (same rule as
--    issues.voice_url and staff_chat_messages media).
-- --------------------------------------------------------------------------
create table if not exists task_attachments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  uploader_id uuid not null references profiles(id),
  kind        text not null default 'file' check (kind in ('file', 'audio')),
  is_proof    boolean not null default false,
  object_path text not null,
  file_name   text,
  mime_type   text,
  created_at  timestamptz not null default now()
);
create index if not exists task_attachments_task_idx on task_attachments (task_id, created_at);

commit;
