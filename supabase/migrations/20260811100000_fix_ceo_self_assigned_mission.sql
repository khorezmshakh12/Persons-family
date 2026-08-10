-- Bug found via real usage: the CEO self-assigned a mission ("ITEP
-- sentabrda boshlash") to themselves. protect_mission_fields() branched
-- purely on `public.current_role() = 'ceo'`, so a CEO who is also the
-- assignee always took the CEO branch — which only permits
-- submitted -> approved/rejected — meaning they could never click Start on
-- their own mission (pending -> in_progress is only reachable from the
-- non-CEO/assignee branch). Rewritten to check each transition on its own
-- terms: pending->in_progress and in_progress->submitted require being the
-- assignee OR the CEO; submitted->approved/rejected require the CEO. A CEO
-- who is also the assignee now qualifies for both.
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
      if auth.uid() <> new.staff_id and public.current_role() <> 'ceo' then
        raise exception 'Only the assignee can start this mission';
      end if;
      new.started_at := now();
    elsif old.status = 'in_progress' and new.status = 'submitted' then
      if auth.uid() <> new.staff_id and public.current_role() <> 'ceo' then
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
      -- Rejecting reopens the mission for resubmission rather than leaving
      -- it in a dead-end state.
      new.status := 'in_progress';
      new.submitted_at := null;
    else
      raise exception 'Not a valid status change';
    end if;
  end if;

  return new;
end;
$$;
