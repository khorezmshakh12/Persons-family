-- ==========================================================================
-- Perforce v2 — "Loyihalar nazorati markazi".
--
--   * strategy_spaces.owner_id — the project's responsible person (weekly
--     status reminders go to them).
--   * pf_change_requests become "Qarorlar": kind, current → proposed value,
--     impact, decision note. Statuses simplified to
--     draft → review → approved | rejected
--     (old: needs → review, submitted (= applied) → approved + applied_at).
--   * pf_status_updates: the system's suggested RAG and the reason when the
--     owner picks another colour; edits allowed for 24 h (updated_at).
--   * pf_settings: workload weights (days per item, weekly capacity).
--   * pf_reminders: one row per sent reminder so crons never repeat.
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

alter table strategy_spaces add column if not exists owner_id uuid references profiles(id) on delete set null;

alter table pf_change_requests drop constraint if exists pf_change_requests_status_check;
alter table pf_change_requests add column if not exists applied_at timestamptz;
update pf_change_requests set applied_at = coalesce(applied_at, decided_at, now()) where status = 'submitted';
update pf_change_requests set status = 'approved' where status = 'submitted';
update pf_change_requests set status = 'review' where status = 'needs';
alter table pf_change_requests add constraint pf_change_requests_status_check
  check (status in ('draft', 'review', 'approved', 'rejected'));
alter table pf_change_requests alter column status set default 'review';
alter table pf_change_requests add column if not exists kind text not null default 'other';
alter table pf_change_requests drop constraint if exists pf_change_requests_kind_check;
alter table pf_change_requests add constraint pf_change_requests_kind_check
  check (kind in ('deadline', 'budget', 'scope', 'people', 'other'));
alter table pf_change_requests add column if not exists current_value  text not null default '';
alter table pf_change_requests add column if not exists proposed_value text not null default '';
alter table pf_change_requests add column if not exists impact         text not null default '';
alter table pf_change_requests add column if not exists decision_note  text;

alter table pf_status_updates add column if not exists suggested     text;
alter table pf_status_updates add column if not exists override_note text;
alter table pf_status_updates add column if not exists updated_at    timestamptz;

create table if not exists pf_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists pf_reminders (
  kind text not null,
  ref  uuid not null,
  day  date not null,
  primary key (kind, ref, day)
);

commit;
