-- ==========================================================================
-- Platform upgrade — Stars + Persons Market, task comments, task completion
-- tracking, weekly task reports, unlimited self-development score.
--
-- There is no migration runner in this project. Apply manually against the
-- Cloud SQL "app" database, e.g. through the Cloud SQL Auth Proxy:
--
--   cloud-sql-proxy persons-staff-b01a83bd:europe-west3:persons-staff-db --port 5433 &
--   psql "postgres://postgres:PASSWORD@127.0.0.1:5433/app" \
--        -f supabase/migrations/20260901000000_stars_market_task_comments_reports.sql
--
-- Every statement is additive / IF NOT EXISTS, so it is safe to re-run.
-- ==========================================================================

begin;

-- gen_random_uuid() is built in on PG13+, but make sure.
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. Task comments (spec #1)
--    The task's assignee and its assigner (CEO) can comment.
-- --------------------------------------------------------------------------
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid not null references profiles(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_id_idx on task_comments (task_id, created_at);

-- --------------------------------------------------------------------------
-- 2. Task completion tracking (spec #5 monthly archive, #6 weekly bot)
--    `updated_at` was never written after insert, so it could not stand in
--    for "when was this finished" — a dedicated column instead.
-- --------------------------------------------------------------------------
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists star_reward   integer not null default 0;
alter table tasks add column if not exists star_awarded_at timestamptz;

-- Backfill existing done rows so the monthly archive has history to show.
update tasks
   set completed_at = coalesce(updated_at, created_at)
 where status = 'done' and completed_at is null;

create index if not exists tasks_completed_at_idx on tasks (completed_at);
create index if not exists tasks_deadline_idx     on tasks (deadline);

-- --------------------------------------------------------------------------
-- 3. Stars ledger (spec #3 earn, #4 CEO award / deduct)
--    Append-only. balance(user) = sum(delta). delta may be negative
--    (CEO deduction, or a Market purchase).
-- --------------------------------------------------------------------------
create table if not exists star_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id),
  delta       integer not null,
  reason      text,
  source_type text not null check (source_type in
                ('self_development','task','manual','purchase','refund','penalty')),
  source_id   uuid,                                   -- self_development.id / tasks.id / market_orders.id
  created_by  uuid references profiles(id),           -- CEO who awarded; null = system (cron)
  created_at  timestamptz not null default now()
);
create index if not exists star_transactions_user_idx        on star_transactions (user_id, created_at);
create index if not exists star_transactions_source_idx      on star_transactions (source_type, source_id);

-- --------------------------------------------------------------------------
-- 4. Persons Market (spec #3)
--    CEO curates items; employees redeem accumulated stars for real
--    goods / services; CEO approves or rejects (reject refunds the stars).
-- --------------------------------------------------------------------------
create table if not exists market_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  star_cost   integer not null check (star_cost > 0),
  stock       integer,                                -- null = unlimited
  is_active   boolean not null default true,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists market_items_active_idx on market_items (is_active, created_at);

create table if not exists market_orders (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references market_items(id),
  user_id     uuid not null references profiles(id),
  star_cost   integer not null,                       -- snapshot at order time
  status      text not null default 'pending' check (status in
                ('pending','approved','rejected','fulfilled')),
  note        text,
  decided_by  uuid references profiles(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists market_orders_user_idx   on market_orders (user_id, created_at);
create index if not exists market_orders_status_idx on market_orders (status, created_at);

-- --------------------------------------------------------------------------
-- 5. Weekly task reports (spec #6)
--    One row per employee per ISO-ish week (Mon–Sun, Asia/Tashkent).
-- --------------------------------------------------------------------------
create table if not exists weekly_task_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id),
  week_start     date not null,                       -- Monday (Asia/Tashkent)
  week_end       date not null,                       -- Sunday
  total_due      integer not null default 0,
  done_on_time   integer not null default 0,
  done_late      integer not null default 0,
  not_done       integer not null default 0,
  efficiency_pct integer not null default 0,          -- round(done_on_time / total_due * 100)
  warned         boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_task_reports_week_idx on weekly_task_reports (week_start);

-- --------------------------------------------------------------------------
-- 6. Unlimited self-development score (spec #8)
--    Drop any CHECK constraint that caps ceo_score (e.g. 1..100).
-- --------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'self_development'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) ilike '%ceo_score%'
  loop
    execute format('alter table self_development drop constraint %I', c);
  end loop;
end $$;

commit;
