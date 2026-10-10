-- Sections v8-A (2026-10-10): Murojaatlar markazi + in-app notifications.
--
-- Issues keep their coarse `status` (open / in_progress / done) — the
-- dashboard, reports, OKR metrics and nav badges all read it — and gain the
-- service-desk layer on top: kind, priority with response/resolve deadlines,
-- acceptance, reporter confirmation (closed_at), reopen count, a linked task,
-- root cause and anonymous ideas. Stage is derived:
--   new         status = 'open'        and accepted_at is null
--   accepted    status = 'open'        and accepted_at is not null
--   in_progress status = 'in_progress'
--   resolved    status = 'done'        and closed_at is null   (awaiting the reporter)
--   closed      status = 'done'        and closed_at is not null
begin;

-- The issues table predates the migrations folder (created in Supabase), so
-- a same-named column from that era may already exist with another type or
-- values. Park any such column as <name>_legacy instead of colliding.
do $$
declare c text;
begin
  foreach c in array array['kind', 'priority', 'anonymous', 'accepted_at', 'respond_by', 'resolve_by', 'closed_at',
                           'confirmed', 'rating', 'reopen_count', 'task_id', 'root_cause', 'sla_warned']
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issues' and column_name = c) then
      execute format('alter table issues rename column %I to %I', c, c || '_legacy');
    end if;
  end loop;
end $$;

alter table issues
  add column if not exists kind text not null default 'problem',
  add column if not exists priority text not null default 'normal',
  add column if not exists anonymous boolean not null default false,
  add column if not exists accepted_at timestamptz,
  add column if not exists respond_by timestamptz,
  add column if not exists resolve_by timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists confirmed boolean,
  add column if not exists rating smallint,
  add column if not exists reopen_count int not null default 0,
  add column if not exists task_id uuid references tasks(id) on delete set null,
  add column if not exists root_cause text,
  add column if not exists sla_warned text;

alter table issues drop constraint if exists issues_kind_check;
alter table issues add constraint issues_kind_check check (kind in ('problem', 'request', 'idea'));
alter table issues drop constraint if exists issues_priority_check;
alter table issues add constraint issues_priority_check check (priority in ('urgent', 'high', 'normal'));
alter table issues drop constraint if exists issues_rating_check;
alter table issues add constraint issues_rating_check check (rating is null or rating between 1 and 5);
alter table issues drop constraint if exists issues_anonymous_check;
alter table issues add constraint issues_anonymous_check check (not anonymous or kind = 'idea');

-- History: everything already resolved counts as closed (nobody is asked to
-- confirm months-old work); work already started counts as accepted.
update issues set closed_at = coalesce(resolved_at, now()) where status = 'done' and closed_at is null;
update issues set accepted_at = created_at where status = 'in_progress' and accepted_at is null;

create index if not exists issues_task_idx on issues (task_id) where task_id is not null;
create index if not exists issues_resolved_open_idx on issues (resolved_at) where status = 'done' and closed_at is null;

create table if not exists issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  kind text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists issue_events_issue_idx on issue_events (issue_id, created_at);

-- One row per person per event; the bell reads these, Telegram mirrors them.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  action boolean not null default false,
  ref text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;

commit;
