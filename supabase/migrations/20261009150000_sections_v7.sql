-- ==========================================================================
-- Sections v7: Perforce project status updates, accounting period close,
-- Market stock alerts.
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

-- Perforce: weekly RAG status per project (Asana-style status updates).
create table if not exists pf_status_updates (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references strategy_spaces(id) on delete cascade,
  rag        text not null check (rag in ('green', 'amber', 'red')),
  summary    text not null check (char_length(summary) between 1 and 2000),
  next_steps text not null default '',
  author_id  uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pf_status_space on pf_status_updates (space_id, created_at desc);

commit;
