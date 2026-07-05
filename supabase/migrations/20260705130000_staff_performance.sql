-- Staff rating & performance tracking. Kept in its own table (not columns on
-- profiles) because profiles is readable by every authenticated staff member
-- today — cramming rating/bonus/penalty into it would leak everyone's HR
-- data to everyone. This table has its own, tighter RLS.
create table staff_performance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references profiles (id) on delete cascade,
  rating numeric(2,1) check (rating between 0 and 5),
  bonus numeric(12,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  notes text,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table staff_performance enable row level security;

create policy "staff_performance_select"
  on staff_performance for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "staff_performance_insert_admin"
  on staff_performance for insert
  to authenticated
  with check (public.is_admin());

create policy "staff_performance_update_admin"
  on staff_performance for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
