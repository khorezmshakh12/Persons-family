-- Warnings had no "seen" tracking or realtime wiring at all, so a staff
-- member issued a warning never got any live signal — mirrors the same
-- read-tracking + Realtime pattern already used for tasks/issues
-- (20260720090000_read_tracking_for_nav_badges.sql,
-- 20260806090000_realtime_tasks_company_news.sql).
alter table staff_warnings add column is_seen boolean not null default false;

create or replace function public.mark_warnings_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update staff_warnings set is_seen = true where staff_id = auth.uid() and is_seen = false;
$$;

grant execute on function public.mark_warnings_seen() to authenticated;

alter table staff_warnings replica identity full;
alter publication supabase_realtime add table staff_warnings;
