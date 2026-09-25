-- Operatsiya HQ: the inputs the prototype hard-coded, now editable real data.
--   ops_settings        growth plan (target, deadline, 3 scenarios: churn,
--                       lead→trial, lead→pay, CPL, CTR) — no seeded numbers.
--   ops_rooms           room register (title, seat capacity, note) keyed by
--                       the same text as groups.configuration->>'room'.
--   ops_group_enrollment current head-count per group (seats taken).
--   ops_slot_holds      trial-lesson / lean-buffer reservations of free cells.
-- Additive and idempotent.
begin;

create table if not exists ops_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists ops_rooms (
  code      text primary key check (char_length(code) between 1 and 60),
  title     text not null default '' check (char_length(title) <= 80),
  capacity  int not null default 14 check (capacity between 1 and 200),
  note      text not null default '' check (char_length(note) <= 200),
  sort      int not null default 0
);

create table if not exists ops_group_enrollment (
  group_id    uuid primary key references groups(id) on delete cascade,
  enrolled    int not null default 0 check (enrolled between 0 and 500),
  updated_at  timestamptz not null default now()
);

create table if not exists ops_slot_holds (
  id          uuid primary key default gen_random_uuid(),
  room        text not null check (char_length(room) between 1 and 60),
  slot_time   text not null check (char_length(slot_time) between 1 and 20),
  cohort      text not null check (cohort in ('odd', 'even')),
  kind        text not null check (kind in ('trial', 'buffer')),
  title       text not null default '' check (char_length(title) <= 120),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (room, slot_time, cohort)
);

commit;
