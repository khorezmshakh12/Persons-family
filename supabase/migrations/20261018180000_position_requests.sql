-- HR roadmap: xodim o'ziga lavozim so'raydi, CEO tasdiqlaydi (2026-10-18).
-- Tasdiqlanganda profile_roles'ga yoziladi (lavozim tirik bo'ladi). CEO lavozimi
-- so'ralmaydi (check). Bir (user, role) uchun bitta ochiq so'rov.
begin;

create table if not exists position_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role staff_role not null check (role <> 'ceo'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists position_requests_pending_uq on position_requests (user_id, role) where status = 'pending';
create index if not exists position_requests_status_idx on position_requests (status, created_at desc);

commit;
