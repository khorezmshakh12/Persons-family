-- Strategy OKRs: objectives per strategy space, each with measurable key
-- results. A key result either tracks a live company metric (computed in
-- src/lib/strategy-okr-data.ts from leads, courses, the journal, tasks,
-- issues…) or a value typed in by hand (metric = 'manual').
begin;

create table if not exists strategy_objectives (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references strategy_spaces(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  owner_id    uuid references profiles(id) on delete set null,
  sort_order  integer not null default 0,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists strategy_objectives_space_idx on strategy_objectives (space_id, sort_order);

create table if not exists strategy_key_results (
  id            uuid primary key default gen_random_uuid(),
  objective_id  uuid not null references strategy_objectives(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  metric        text not null default 'manual' check (metric in (
                  'manual', 'leads_month', 'enrolled_month', 'conversion_month', 'students_total',
                  'revenue_month', 'strategy_done_pct', 'tasks_done_month', 'issues_resolved_month', 'staff_active')),
  start_value   numeric not null default 0,
  target_value  numeric not null,
  current_value numeric not null default 0,
  unit          text not null default '' check (char_length(unit) <= 20),
  sort_order    integer not null default 0,
  updated_at    timestamptz not null default now()
);
create index if not exists strategy_key_results_objective_idx on strategy_key_results (objective_id, sort_order);

commit;
