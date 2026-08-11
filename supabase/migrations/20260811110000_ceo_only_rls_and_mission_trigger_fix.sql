-- Two fixes found in a code audit:
--
-- 1. Managing KPI metrics/entries and the Income Roadmap was tightened to
--    CEO-only at the app layer (requireCeo() in kpi.ts/income-roadmap.ts)
--    but the RLS policies on these four tables were never updated to match
--    — they still used public.is_admin() (ceo+it_developer), so an IT
--    Developer calling the underlying Supabase REST API directly (bypassing
--    the server actions) could still write to them. RLS is now the actual
--    enforcement layer; the app-layer check was the only thing stopping it.
drop policy "kpi_metrics_insert_admin" on kpi_metrics;
create policy "kpi_metrics_insert_ceo" on kpi_metrics for insert to authenticated
  with check (public.current_role() = 'ceo');
drop policy "kpi_metrics_update_admin" on kpi_metrics;
create policy "kpi_metrics_update_ceo" on kpi_metrics for update to authenticated
  using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');
drop policy "kpi_metrics_delete_admin" on kpi_metrics;
create policy "kpi_metrics_delete_ceo" on kpi_metrics for delete to authenticated
  using (public.current_role() = 'ceo');

drop policy "kpi_entries_insert_admin" on kpi_entries;
create policy "kpi_entries_insert_ceo" on kpi_entries for insert to authenticated
  with check (public.current_role() = 'ceo');
drop policy "kpi_entries_update_admin" on kpi_entries;
create policy "kpi_entries_update_ceo" on kpi_entries for update to authenticated
  using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');
drop policy "kpi_entries_delete_admin" on kpi_entries;
create policy "kpi_entries_delete_ceo" on kpi_entries for delete to authenticated
  using (public.current_role() = 'ceo');

drop policy "staff_income_plans_insert_admin" on staff_income_plans;
create policy "staff_income_plans_insert_ceo" on staff_income_plans for insert to authenticated
  with check (public.current_role() = 'ceo');
drop policy "staff_income_plans_update_admin" on staff_income_plans;
create policy "staff_income_plans_update_ceo" on staff_income_plans for update to authenticated
  using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');
drop policy "staff_income_plans_delete_admin" on staff_income_plans;
create policy "staff_income_plans_delete_ceo" on staff_income_plans for delete to authenticated
  using (public.current_role() = 'ceo');

drop policy "income_roadmap_steps_insert_admin" on income_roadmap_steps;
create policy "income_roadmap_steps_insert_ceo" on income_roadmap_steps for insert to authenticated
  with check (public.current_role() = 'ceo');
drop policy "income_roadmap_steps_update_admin" on income_roadmap_steps;
create policy "income_roadmap_steps_update_ceo" on income_roadmap_steps for update to authenticated
  using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');
drop policy "income_roadmap_steps_delete_admin" on income_roadmap_steps;
create policy "income_roadmap_steps_delete_ceo" on income_roadmap_steps for delete to authenticated
  using (public.current_role() = 'ceo');

-- 2. protect_mission_fields()'s assignee-transition checks
--    (pending->in_progress, in_progress->submitted) also allowed
--    `current_role() = 'ceo'` as an alternative to being the assignee. That
--    was meant to unblock a CEO who self-assigns a mission, but since
--    auth.uid() = new.staff_id already holds in that case on its own, the
--    "or ceo" clause was unnecessary — and its actual effect was letting
--    the CEO start/submit *any* staff member's mission on their behalf,
--    which was never the intent (only the assignee should start/submit).
create or replace function public.protect_mission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.staff_id is distinct from old.staff_id
    or new.deadline_date is distinct from old.deadline_date
    or new.bonus_amount is distinct from old.bonus_amount
  ) and public.current_role() <> 'ceo' then
    raise exception 'Only the CEO can change this field';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'in_progress' then
      if auth.uid() <> new.staff_id then
        raise exception 'Only the assignee can start this mission';
      end if;
      new.started_at := now();
    elsif old.status = 'in_progress' and new.status = 'submitted' then
      if auth.uid() <> new.staff_id then
        raise exception 'Only the assignee can submit this mission';
      end if;
      if new.submission_note is null then
        raise exception 'A submission note is required';
      end if;
      new.submitted_at := now();
    elsif old.status = 'submitted' and new.status = 'approved' then
      if public.current_role() <> 'ceo' then
        raise exception 'Only the CEO can approve a mission';
      end if;
      new.approved_at := now();
    elsif old.status = 'submitted' and new.status = 'rejected' then
      if public.current_role() <> 'ceo' then
        raise exception 'Only the CEO can reject a mission';
      end if;
      new.status := 'in_progress';
      new.submitted_at := null;
    else
      raise exception 'Not a valid status change';
    end if;
  end if;

  return new;
end;
$$;
