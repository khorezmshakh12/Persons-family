-- Persons ERP v1.5 — individual bonus/penalty ledger, extracted out of the
-- single running-total staff_performance.bonus/penalty columns so history
-- (who, when, why) is visible on the new /performance page. The old
-- bonus/penalty columns on staff_performance are left in place (not
-- dropped) — they simply stop being written to from the app — so no
-- existing data is lost.
create type performance_entry_type as enum ('bonus', 'penalty');

create table performance_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  entry_type performance_entry_type not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index performance_entries_staff_id_idx on performance_entries (staff_id);

alter table performance_entries enable row level security;

create policy "performance_entries_select"
  on performance_entries for select
  to authenticated
  using (public.is_admin() or staff_id = auth.uid());

create policy "performance_entries_insert_admin"
  on performance_entries for insert
  to authenticated
  with check (public.is_admin());

create policy "performance_entries_delete_admin"
  on performance_entries for delete
  to authenticated
  using (public.is_admin());
