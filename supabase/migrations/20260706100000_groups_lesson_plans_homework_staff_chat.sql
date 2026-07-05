-- Group management, weekly lesson plans, role-tabbed comments, homework
-- tracking, and a separate Teacher/TA-only staff chat.
--
-- The old `lesson_plans` table and `lesson-files` storage bucket are left
-- in place untouched — real teacher data already lives there (an uploaded
-- lesson plan file). Only the code path is being replaced in this phase;
-- the old table/bucket can be dropped later in a dedicated cleanup
-- migration once confirmed nothing needs preserving.

create table groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index groups_teacher_idx on groups (teacher_id);

-- Server-side cap: a teacher can have at most 50 groups.
create or replace function public.enforce_group_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from groups where teacher_id = new.teacher_id) >= 50 then
    raise exception 'Group limit reached: a teacher can have at most 50 groups';
  end if;
  return new;
end;
$$;

create trigger enforce_group_limit_trigger
  before insert on groups
  for each row execute function public.enforce_group_limit();

-- Reusable helper mirroring is_admin()/current_role(): is the caller the
-- owning teacher of this group? Used by every child table's RLS below.
create or replace function public.is_group_owner(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from groups where id = target_group_id and teacher_id = auth.uid()
  )
$$;

grant execute on function public.is_group_owner(uuid) to authenticated;

alter table groups enable row level security;

create policy "groups_select"
  on groups for select
  to authenticated
  using (public.is_admin() or teacher_id = auth.uid() or public.current_role() = 'assistant');

create policy "groups_insert_teacher"
  on groups for insert
  to authenticated
  with check (public.current_role() = 'teacher' and teacher_id = auth.uid());

create policy "groups_update"
  on groups for update
  to authenticated
  using (public.is_admin() or teacher_id = auth.uid())
  with check (public.is_admin() or teacher_id = auth.uid());

create policy "groups_delete"
  on groups for delete
  to authenticated
  using (public.is_admin() or teacher_id = auth.uid());

-- weekly_lesson_plans ---------------------------------------------------------
create table weekly_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create index weekly_lesson_plans_group_idx on weekly_lesson_plans (group_id);

alter table weekly_lesson_plans enable row level security;

create policy "weekly_lesson_plans_select"
  on weekly_lesson_plans for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.current_role() = 'assistant');

create policy "weekly_lesson_plans_insert"
  on weekly_lesson_plans for insert
  to authenticated
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "weekly_lesson_plans_update"
  on weekly_lesson_plans for update
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id))
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "weekly_lesson_plans_delete"
  on weekly_lesson_plans for delete
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id));

-- lesson_plan_days ------------------------------------------------------------
-- Normalized instead of a JSONB array (deliberate deviation, see plan):
-- lesson_plan_comments needs a real, indexable foreign key per day.
create type weekday as enum ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

create table lesson_plan_days (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_lesson_plans (id) on delete cascade,
  weekday weekday not null,
  topic text,
  notes text,
  unique (weekly_plan_id, weekday)
);

alter table lesson_plan_days enable row level security;

create policy "lesson_plan_days_select"
  on lesson_plan_days for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'assistant'
    or exists (
      select 1 from weekly_lesson_plans wlp
      where wlp.id = weekly_plan_id and public.is_group_owner(wlp.group_id)
    )
  );

create policy "lesson_plan_days_insert"
  on lesson_plan_days for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from weekly_lesson_plans wlp
      where wlp.id = weekly_plan_id and public.is_group_owner(wlp.group_id)
    )
  );

create policy "lesson_plan_days_update"
  on lesson_plan_days for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from weekly_lesson_plans wlp
      where wlp.id = weekly_plan_id and public.is_group_owner(wlp.group_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from weekly_lesson_plans wlp
      where wlp.id = weekly_plan_id and public.is_group_owner(wlp.group_id)
    )
  );

-- lesson_plan_comments --------------------------------------------------------
-- No stored `role` column — the commenter's role is read live via a join
-- to profiles.role, so it can never go stale relative to the real role.
create table lesson_plan_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_day_id uuid not null references lesson_plan_days (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index lesson_plan_comments_day_idx on lesson_plan_comments (lesson_plan_day_id);

alter table lesson_plan_comments enable row level security;

create policy "lesson_plan_comments_select"
  on lesson_plan_comments for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'assistant'
    or exists (
      select 1 from lesson_plan_days d
      join weekly_lesson_plans wlp on wlp.id = d.weekly_plan_id
      where d.id = lesson_plan_day_id and public.is_group_owner(wlp.group_id)
    )
  );

-- Only CEO/Admin/assistant ("authorized roles") can comment — teachers
-- read their own plan's feedback but don't comment on it themselves.
create policy "lesson_plan_comments_insert"
  on lesson_plan_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_admin() or public.current_role() = 'assistant')
  );

create policy "lesson_plan_comments_delete_own"
  on lesson_plan_comments for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- homework_students (lightweight roster, no login) ---------------------------
create table homework_students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create index homework_students_group_idx on homework_students (group_id);

alter table homework_students enable row level security;

create policy "homework_students_select"
  on homework_students for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.current_role() = 'assistant');

create policy "homework_students_insert"
  on homework_students for insert
  to authenticated
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "homework_students_update"
  on homework_students for update
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id))
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "homework_students_delete"
  on homework_students for delete
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id));

-- homework_assignments ---------------------------------------------------------
create table homework_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  created_at timestamptz not null default now()
);

create index homework_assignments_group_idx on homework_assignments (group_id);

alter table homework_assignments enable row level security;

create policy "homework_assignments_select"
  on homework_assignments for select
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id) or public.current_role() = 'assistant');

create policy "homework_assignments_insert"
  on homework_assignments for insert
  to authenticated
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "homework_assignments_update"
  on homework_assignments for update
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id))
  with check (public.is_admin() or public.is_group_owner(group_id));

create policy "homework_assignments_delete"
  on homework_assignments for delete
  to authenticated
  using (public.is_admin() or public.is_group_owner(group_id));

-- homework_submissions ---------------------------------------------------------
create type homework_status as enum ('pending', 'submitted', 'graded', 'missing');

create table homework_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references homework_assignments (id) on delete cascade,
  student_id uuid not null references homework_students (id) on delete cascade,
  status homework_status not null default 'pending',
  grade text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

alter table homework_submissions enable row level security;

create policy "homework_submissions_select"
  on homework_submissions for select
  to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'assistant'
    or exists (
      select 1 from homework_assignments a
      where a.id = assignment_id and public.is_group_owner(a.group_id)
    )
  );

create policy "homework_submissions_insert"
  on homework_submissions for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from homework_assignments a
      where a.id = assignment_id and public.is_group_owner(a.group_id)
    )
  );

create policy "homework_submissions_update"
  on homework_submissions for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from homework_assignments a
      where a.id = assignment_id and public.is_group_owner(a.group_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from homework_assignments a
      where a.id = assignment_id and public.is_group_owner(a.group_id)
    )
  );

-- staff_chat_messages -----------------------------------------------------
-- Teachers and Assistants only — CEO/Admin are deliberately excluded, even
-- from select. One table serves both chat surfaces via conversation_id: a
-- fixed constant for the sidebar's global Teacher/TA room, and each
-- group's own id for that group's staff-chat snippet.
create table staff_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index staff_chat_messages_conversation_idx on staff_chat_messages (conversation_id, created_at);

alter table staff_chat_messages enable row level security;

create policy "staff_chat_messages_select"
  on staff_chat_messages for select
  to authenticated
  using (public.current_role() in ('teacher', 'assistant'));

create policy "staff_chat_messages_insert"
  on staff_chat_messages for insert
  to authenticated
  with check (public.current_role() in ('teacher', 'assistant') and user_id = auth.uid());

-- Simplified controls (no pin/admin-delete/disable, unlike the general
-- chat) — self-delete only.
create policy "staff_chat_messages_delete_own"
  on staff_chat_messages for delete
  to authenticated
  using (user_id = auth.uid());

alter table staff_chat_messages replica identity full;
alter publication supabase_realtime add table staff_chat_messages;
