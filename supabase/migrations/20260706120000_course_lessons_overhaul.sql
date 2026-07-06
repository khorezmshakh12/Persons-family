-- Overhaul: replace the rolling 7-day weekly lesson plan with a fixed
-- 24-lesson course structure per group (2-month course, 3 lessons/week),
-- with per-lesson file attachments and comments.
--
-- The old weekly_lesson_plans / lesson_plan_days / lesson_plan_comments
-- tables are left in place untouched (same precedent as the earlier
-- lesson_plans/lesson-files deprecation) — they currently hold only empty,
-- auto-generated scaffolding for the one real group in production (no
-- topics, notes, or comments were ever entered), so nothing of value is
-- lost by no longer writing to them, and leaving them costs nothing.

-- lesson_materials storage bucket -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson_materials', 'lesson_materials', false, 50 * 1024 * 1024, null)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored under `${group_id}/${lesson_id}/${filename}` so
-- storage RLS can reuse is_group_owner() against the first path segment,
-- matching the course_lessons table's own access model exactly.
create policy "lesson_materials_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (
      public.is_admin()
      or public.current_role() = 'assistant'
      or public.is_group_owner((storage.foldername(name))[1]::uuid)
    )
  );

create policy "lesson_materials_teacher_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson_materials'
    and public.is_group_owner((storage.foldername(name))[1]::uuid)
  );

-- Update/delete also allow the CEO specifically (not admin_manager) so they
-- can clear a file even if the owning teacher is unavailable.
create policy "lesson_materials_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  )
  with check (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  );

create policy "lesson_materials_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson_materials'
    and (public.is_group_owner((storage.foldername(name))[1]::uuid) or public.current_role() = 'ceo')
  );

-- course_lessons -------------------------------------------------------------
create table course_lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  lesson_number smallint not null check (lesson_number between 1 and 24),
  lesson_date date,
  topic text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, lesson_number)
);

create index course_lessons_group_idx on course_lessons (group_id);

-- Auto-generate all 24 fixed lesson rows the moment a group is created.
create or replace function public.create_course_lessons()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into course_lessons (group_id, lesson_number)
  select new.id, gs from generate_series(1, 24) gs;
  return new;
end;
$$;

create trigger create_course_lessons_trigger
  after insert on groups
  for each row execute function public.create_course_lessons();

-- Backfill the one group that already existed before this migration (the
-- trigger above only fires for new group inserts going forward).
insert into course_lessons (group_id, lesson_number)
select g.id, gs
from groups g, generate_series(1, 24) gs
where not exists (select 1 from course_lessons cl where cl.group_id = g.id);

alter table course_lessons enable row level security;

create policy "course_lessons_select"
  on course_lessons for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.current_role() = 'assistant');

-- Only the owning teacher sets dates/topics/attachments day-to-day; the CEO
-- can additionally update (used to clear/delete an attachment) even though
-- they're not the owning teacher. Admin managers and assistants get neither.
create policy "course_lessons_update"
  on course_lessons for update
  to authenticated
  using (public.is_group_owner(group_id) or public.current_role() = 'ceo')
  with check (public.is_group_owner(group_id) or public.current_role() = 'ceo');

-- No insert/delete policy: the 24 rows are fixed for the lifetime of the
-- group (created by the trigger/backfill above, removed only via the
-- groups cascade when a group itself is deleted).

-- lesson_comments -------------------------------------------------------------
-- No stored `role` column, same reasoning as lesson_plan_comments: the
-- commenter's role is read live via a join to profiles.role.
create table lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references course_lessons (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index lesson_comments_lesson_idx on lesson_comments (lesson_id);

alter table lesson_comments enable row level security;

create policy "lesson_comments_select"
  on lesson_comments for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'assistant'
    or exists (
      select 1 from course_lessons cl where cl.id = lesson_id and public.is_group_owner(cl.group_id)
    )
  );

-- Only CEO/Admin/assistant can comment — the owning teacher reads feedback
-- on their own lessons but doesn't post here themselves, same convention as
-- the earlier day-comments feature.
create policy "lesson_comments_insert"
  on lesson_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_admin() or public.current_role() = 'assistant')
  );

create policy "lesson_comments_delete_own"
  on lesson_comments for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());
