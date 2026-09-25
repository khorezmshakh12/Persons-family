-- ==========================================================================
-- TypeSafe (Jev) AI judgments, stored next to the records they describe.
-- Written only by lib/ai-triage.ts after an issue / lead is saved; the app
-- works unchanged when TYPESAFE_API_KEY is absent (rows simply never appear).
-- Additive / IF NOT EXISTS, safe to re-run.
-- ==========================================================================

begin;

create table if not exists issue_ai (
  issue_id             uuid primary key references issues(id) on delete cascade,
  category             text,
  category_confidence  numeric,
  urgency              numeric,        -- 0..3 probability-weighted level
  urgency_confidence   numeric,
  it_bug               numeric,        -- 0..1 probability it is a software bug
  model                text not null default '',
  checked_at           timestamptz not null default now()
);

alter table ops_leads add column if not exists ai_intent numeric;             -- 0..3
alter table ops_leads add column if not exists ai_intent_confidence numeric;
alter table ops_leads add column if not exists ai_hot numeric;                -- 0..1
alter table ops_leads add column if not exists ai_checked_at timestamptz;

commit;
