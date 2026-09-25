-- ==========================================================================
-- Persons Staff Core v2 (owner's Claude-designed workspace, served 1:1 from
-- src/core/core.html). Its whole data model is one JSON document `S`; the
-- shared (non-UI) part lives here instead of each browser's localStorage.
-- Staff come from `profiles` and tasks from `tasks` at load time; this row
-- only keeps Core-specific data: leads/KPI/HR/settings/ACL and per-staff
-- metadata (department, boss, title) in data->'staffMeta'.
-- Additive / idempotent.
-- ==========================================================================

begin;

create table if not exists core_state (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

insert into core_state (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

commit;
