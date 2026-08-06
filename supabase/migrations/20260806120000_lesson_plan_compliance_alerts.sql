-- Daily automated compliance check (see the /api/cron/lesson-plan-check
-- route) flags teachers who haven't fully written a scheduled group's
-- lesson plan by the 23:59 deadline. One row per day the check finds at
-- least one gap — a fully-compliant day inserts nothing, so the CEO's bell
-- only lights up when there's actually something to review. Mirrors
-- staff_warnings' is_seen tracking + Realtime pattern
-- (20260806100000_warning_seen_tracking_and_realtime.sql), but there's no
-- staff_id here: this is a CEO-only broadcast, not a per-staff record, so
-- visibility is scoped entirely by the SELECT policy below rather than a
-- recipient column.
create table lesson_plan_compliance_alerts (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  summary text not null,
  created_at timestamptz not null default now(),
  is_seen boolean not null default false
);

create index lesson_plan_compliance_alerts_report_date_idx on lesson_plan_compliance_alerts (report_date);

alter table lesson_plan_compliance_alerts enable row level security;

-- Insert only ever happens from the cron route via the service-role admin
-- client, which bypasses RLS entirely — no INSERT policy needed for
-- `authenticated`. CEO is the only role that should ever see these.
create policy "lesson_plan_compliance_alerts_select_ceo"
  on lesson_plan_compliance_alerts for select
  to authenticated
  using (public.current_role() = 'ceo');

create or replace function public.mark_lesson_plan_alerts_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'ceo' then
    return;
  end if;
  update lesson_plan_compliance_alerts set is_seen = true where is_seen = false;
end;
$$;

grant execute on function public.mark_lesson_plan_alerts_seen() to authenticated;

alter table lesson_plan_compliance_alerts replica identity full;
alter publication supabase_realtime add table lesson_plan_compliance_alerts;
