-- Staff Warnings, and a "Punishment" as a follow-up action on a warning.
--
-- A Punishment is deliberately NOT a new parallel table: performance_entries
-- already models a monetary penalty ledger (entry_type = 'penalty', with
-- amount/reason/created_by/created_at and its own RLS + /self-development
-- UI). Reusing it means "assign a Punishment" is just "add a penalty entry,
-- optionally pointing at the warning that triggered it" — no duplicated
-- history table, no second ledger to keep in sync. The enum value stays
-- named 'penalty' (renaming it would touch every existing policy/action/i18n
-- string that reads it); the frontend phase can simply label it "Punishment".
create table staff_warnings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  reason text not null,
  issued_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index staff_warnings_staff_id_idx on staff_warnings (staff_id);

alter table staff_warnings enable row level security;

-- CEO/Admin Manager see every warning (to act on them); a staff member sees
-- only their own (for the Profile page's Warnings history).
create or replace function public.is_ceo_or_admin_manager()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_admin() or public.current_role() = 'admin_manager'
$$;

grant execute on function public.is_ceo_or_admin_manager() to authenticated;

create policy "staff_warnings_select"
  on staff_warnings for select
  to authenticated
  using (public.is_ceo_or_admin_manager() or staff_id = auth.uid());

create policy "staff_warnings_insert"
  on staff_warnings for insert
  to authenticated
  with check (public.is_ceo_or_admin_manager() and issued_by = auth.uid());

-- Warnings are an append-only history like performance_entries — no update,
-- delete stays CEO-only for correcting a mistaken entry.
create policy "staff_warnings_delete_ceo"
  on staff_warnings for delete
  to authenticated
  using (public.current_role() = 'ceo');

-- Link a penalty ("Punishment") entry back to the warning that triggered it.
-- Nullable: a CEO can still add a plain monetary penalty with no warning
-- attached, same as before this migration.
alter table performance_entries add column warning_id uuid references staff_warnings (id) on delete set null;

create index performance_entries_warning_id_idx on performance_entries (warning_id);

-- amount > 0 assumed every penalty was a fine. A Punishment triggered off a
-- warning may carry no fine at all (a formal reprimand only), so this
-- relaxes to >= 0. Bonuses staying strictly positive (a zero-amount bonus is
-- meaningless) is unaffected — the check is table-wide but 'bonus' entries
-- were never zero in practice; revisit if that turns out to matter.
alter table performance_entries drop constraint performance_entries_amount_check;
alter table performance_entries add constraint performance_entries_amount_check check (amount >= 0);

-- Administrative Manager currently has no visibility into performance_entries
-- at all (is_admin() became CEO-only in the role rework) — it needs to see
-- history to decide whether to escalate a warning into a punishment, and to
-- record the punishment itself.
create policy "performance_entries_select_admin_manager"
  on performance_entries for select
  to authenticated
  using (public.current_role() = 'admin_manager');

-- Administrative Manager's insert power is scoped tightly: only a penalty
-- entry, and only as the documented follow-up to a warning it (or the CEO)
-- already issued — never an undocumented penalty, and never a bonus (bonus
-- authority stays CEO-only, unchanged from performance_entries_insert_admin).
create policy "performance_entries_insert_admin_manager_punishment"
  on performance_entries for insert
  to authenticated
  with check (
    public.current_role() = 'admin_manager'
    and entry_type = 'penalty'
    and warning_id is not null
    and created_by = auth.uid()
  );
