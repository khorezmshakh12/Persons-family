-- ==========================================================================
-- Per-person section access (Platform settings → "Bo'lim ruxsatlari",
-- owner 2026-09-30). A row overrides the role matrix for one person and one
-- section: allow = true opens it, false closes it. No row = role default
-- (src/lib/permissions.ts). Set by CEO / COO. Additive / idempotent.
-- ==========================================================================

begin;

create table if not exists section_access (
  user_id  uuid not null references profiles(id) on delete cascade,
  section  text not null,
  allow    boolean not null,
  set_by   uuid references profiles(id) on delete set null,
  set_at   timestamptz not null default now(),
  primary key (user_id, section)
);

commit;
