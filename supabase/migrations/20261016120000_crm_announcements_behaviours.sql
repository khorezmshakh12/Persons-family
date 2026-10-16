-- CRM: e'lonlar, xulq (behaviours) va markaz nomi (2026-10-16).
begin;

-- E'lonlar / bildirishnomalar
create table if not exists crm_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists crm_announcements_created_idx on crm_announcements (created_at desc);

-- O'quvchi xulqi / rag'bati (positive/negative, ballar bilan)
create table if not exists crm_behaviours (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  kind text not null check (kind in ('positive', 'negative')),
  points int not null default 0,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_behaviours_student_idx on crm_behaviours (student_id, created_at desc);

-- Markaz nomi (sozlamalar)
alter table crm_settings add column if not exists center_name text;

commit;
