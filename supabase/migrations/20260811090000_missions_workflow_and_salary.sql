-- Missions overhaul: from a flat self-toggle checklist to a real workflow
-- with a CEO-set deadline + optional cash bonus, an assignee-driven
-- start/submit flow, and CEO approval before it counts as done. Short vs
-- Long Term is never stored — it's derived from days-until-deadline at
-- render time (see src/lib/missions.ts), so a Long Term mission reads as
-- Short Term the moment it crosses the 30-day mark with no migration or
-- background job needed.
alter table missions
  add column deadline_date date not null default (current_date + interval '30 days'),
  add column status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'submitted', 'approved', 'rejected')),
  add column bonus_amount numeric(14, 2),
  add column started_at timestamptz,
  add column submitted_at timestamptz,
  add column submission_note text,
  add column approved_at timestamptz,
  add column rejection_note text;

update missions set status = case when is_completed then 'approved' else 'pending' end;

alter table missions drop column is_completed, drop column completed_at;
-- The default above only exists to satisfy `not null` while backfilling
-- existing rows in this same migration — every mission from here on must
-- have a CEO-chosen deadline.
alter table missions alter column deadline_date drop default;

-- Mission management (assign/delete, and now approve/reject) is CEO-only —
-- narrower than the general public.is_admin() (ceo+it_developer) used
-- elsewhere. Viewing is unchanged (admin or the assignee).
drop policy "missions_insert_admin" on missions;
create policy "missions_insert_ceo"
  on missions for insert
  to authenticated
  with check (public.current_role() = 'ceo');

drop policy "missions_delete_admin" on missions;
create policy "missions_delete_ceo"
  on missions for delete
  to authenticated
  using (public.current_role() = 'ceo');

-- The update policy itself stays broad (ceo or the assignee) — the trigger
-- below is what enforces which fields/transitions each side may actually
-- make within that.
create or replace function public.protect_mission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'ceo' then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.staff_id is distinct from old.staff_id
      or new.deadline_date is distinct from old.deadline_date
      or new.bonus_amount is distinct from old.bonus_amount
    then
      raise exception 'Only the CEO can change this field';
    end if;

    if auth.uid() <> new.staff_id then
      raise exception 'Only the assignee can change this mission''s status';
    end if;

    if new.status is distinct from old.status then
      if old.status = 'pending' and new.status = 'in_progress' then
        new.started_at := now();
      elsif old.status = 'in_progress' and new.status = 'submitted' then
        if new.submission_note is null then
          raise exception 'A submission note is required';
        end if;
        new.submitted_at := now();
      else
        raise exception 'Not a valid status change for the assignee';
      end if;
    end if;
  else
    if new.status is distinct from old.status then
      if old.status = 'submitted' and new.status = 'approved' then
        new.approved_at := now();
      elsif old.status = 'submitted' and new.status = 'rejected' then
        -- Rejecting immediately reopens the mission for resubmission rather
        -- than leaving it in a dead-end 'rejected' state.
        new.status := 'in_progress';
        new.submitted_at := null;
      else
        raise exception 'Not a valid status change for the CEO';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- self_development: an optional CEO-set cash bonus tied to a rated
-- submission, which (once set) contributes to the Salary Total on
-- /finance/[id] alongside the ledger, bonuses/penalties, and approved
-- mission bonuses.
alter table self_development add column bonus_amount numeric(14, 2);

-- staff_salary_notes: the single freeform comment CEO can attach to a
-- staff member's Salary Total — not a history log, just the current note,
-- hence a staff_id primary key rather than an append-only table.
create table staff_salary_notes (
  staff_id uuid primary key references profiles (id) on delete cascade,
  comment text not null,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table staff_salary_notes enable row level security;

create policy "staff_salary_notes_select"
  on staff_salary_notes for select
  to authenticated
  using (public.current_role() = 'ceo' or staff_id = auth.uid());

create policy "staff_salary_notes_upsert_ceo"
  on staff_salary_notes for insert
  to authenticated
  with check (public.current_role() = 'ceo');

create policy "staff_salary_notes_update_ceo"
  on staff_salary_notes for update
  to authenticated
  using (public.current_role() = 'ceo')
  with check (public.current_role() = 'ceo');
