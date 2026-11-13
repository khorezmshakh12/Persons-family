-- ==========================================================================
-- Section access v2 (owner 2026-11-13): role-level overrides of sections and
-- of functions inside them. A row opens (allow = true) or closes one key for
-- everyone working in that role; a per-person row in section_access still
-- wins. No row = the code default (src/lib/permissions.ts). Set by CEO / COO.
-- platform_changes.target becomes nullable so role changes can be journaled
-- (key = 'role|key'). Additive / idempotent.
-- ==========================================================================

begin;

create table if not exists role_access (
  role    text not null,
  key     text not null,
  allow   boolean not null,
  set_by  uuid references profiles(id) on delete set null,
  set_at  timestamptz not null default now(),
  primary key (role, key)
);

alter table platform_changes alter column target drop not null;

-- HR: hammaning self-development hisobotini ko'rish + checklist shablonlari.
insert into role_access (role, key, allow) values
  ('hr_manager', 'selfDev.viewAll', true),
  ('hr_manager', 'checklist.manage', true)
on conflict (role, key) do nothing;

commit;
