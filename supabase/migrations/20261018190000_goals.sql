-- Shaxsiy maqsadlar: kunlik / haftalik / oylik (2026-10-18).
-- scope = 'day'|'week'|'month'; period_key = kun/hafta(dushanba sanasi)/oy kaliti.
begin;

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  scope text not null check (scope in ('day', 'week', 'month')),
  period_key text not null,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on goals (user_id, scope, period_key);

commit;
