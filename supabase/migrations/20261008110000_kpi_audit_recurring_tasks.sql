-- 1. KPI audit trail: who approved/graded, with which percentages and any
--    manual amount override. 2. A mid-month KPI check-in reminder kind.
-- 3. Recurring tasks: a template the deadline cron turns into real tasks.
begin;

create table if not exists kpi_audit (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references kpi_plans(id) on delete cascade,
  actor      uuid references profiles(id) on delete set null,
  action     text not null check (action in ('review', 'grade')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists kpi_audit_plan_idx on kpi_audit (plan_id, created_at);

alter table kpi_reminders drop constraint if exists kpi_reminders_kind_check;
alter table kpi_reminders add constraint kpi_reminders_kind_check
  check (kind in ('early', 'last', 'digest', 'midmonth'));

create table if not exists task_recurrences (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 200),
  description   text,
  assigned_to   uuid not null references profiles(id) on delete cascade,
  assigned_by   uuid references profiles(id) on delete set null,
  every         text not null check (every in ('weekly', 'monthly')),
  -- Tashkent wall-clock time of each deadline, 'HH:MM'.
  due_time      text not null check (due_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  -- The deadline day of the most recently created instance (Tashkent date).
  last_due      date not null,
  star_reward   integer not null default 0 check (star_reward >= 0),
  star_penalty  integer not null default 0 check (star_penalty >= 0),
  requires_proof boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists task_recurrences_active_idx on task_recurrences (active, last_due);

commit;
