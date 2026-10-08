-- Strategy v2: OKRs wired to the work and run on a cadence.
--  * a key result can be driven by the strategy tasks linked to it
--    (metric 'linked_tasks' = % of linked tasks done);
--  * weekly check-ins (value + confidence + note) per key result;
--  * objectives belong to a quarter and are closed with a 0–1 score;
--  * task dependencies for the Gantt (critical path, cascade shifts);
--  * Jev's "will it land?" verdict per key result.
begin;

alter table strategy_objectives
  add column if not exists quarter text check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  add column if not exists status text not null default 'active' check (status in ('active', 'closed')),
  add column if not exists final_score numeric check (final_score between 0 and 1),
  add column if not exists retro text check (char_length(retro) <= 1000),
  add column if not exists closed_at timestamptz;

alter table strategy_key_results
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists jev_verdict text check (jev_verdict in ('likely', 'risk', 'unlikely')),
  add column if not exists jev_at timestamptz;

alter table strategy_key_results drop constraint if exists strategy_key_results_metric_check;
alter table strategy_key_results add constraint strategy_key_results_metric_check check (metric in (
  'manual', 'linked_tasks', 'leads_month', 'enrolled_month', 'conversion_month', 'students_total',
  'revenue_month', 'strategy_done_pct', 'tasks_done_month', 'issues_resolved_month', 'staff_active'));

create table if not exists strategy_kr_tasks (
  kr_id   uuid not null references strategy_key_results(id) on delete cascade,
  task_id uuid not null references strategy_tasks(id) on delete cascade,
  primary key (kr_id, task_id)
);
create index if not exists strategy_kr_tasks_task_idx on strategy_kr_tasks (task_id);

create table if not exists strategy_checkins (
  id         uuid primary key default gen_random_uuid(),
  kr_id      uuid not null references strategy_key_results(id) on delete cascade,
  week       date not null,
  value      numeric,
  confidence text not null check (confidence in ('on', 'risk', 'off')),
  note       text check (char_length(note) <= 500),
  author_id  uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kr_id, week)
);

create table if not exists strategy_task_deps (
  task_id    uuid not null references strategy_tasks(id) on delete cascade,
  depends_on uuid not null references strategy_tasks(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);
create index if not exists strategy_task_deps_dep_idx on strategy_task_deps (depends_on);

-- Friday OKR check-in nudge reuses the KPI reminder ledger (month = week's Monday).
alter table kpi_reminders drop constraint if exists kpi_reminders_kind_check;
alter table kpi_reminders add constraint kpi_reminders_kind_check
  check (kind in ('early', 'last', 'digest', 'midmonth', 'okr_checkin'));

commit;
