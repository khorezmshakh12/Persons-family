-- ==========================================================================
-- Issue comment threads: the CEO writes a comment / instruction on an issue,
-- the person who raised it (and its assignee) reply. Mirrors task_comments,
-- except the author FK is `on delete set null` so removing a staff profile
-- never trips over their comment history (see lib/staff-removal.ts).
--
-- Additive / IF NOT EXISTS, safe to re-run.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists issue_comments (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references issues(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists issue_comments_issue_id_idx on issue_comments (issue_id, created_at);

commit;
