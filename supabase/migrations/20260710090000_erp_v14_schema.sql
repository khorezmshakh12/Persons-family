-- Persons ERP v1.4 — schema expansions.

-- profiles: teacher leveling ------------------------------------------------
create type teacher_level as enum ('C', 'C+', 'C++', 'B', 'B+', 'B++', 'A', 'A+', 'A++');

alter table profiles
  add column teacher_level teacher_level not null default 'C',
  add column level_updated_at timestamptz not null default now();

-- Level changes are exclusively a CEO/Admin action (via the Self-Development
-- page), never something a staff member sets on themselves — same
-- protection as role/phone/date_of_birth/is_active.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
      or new.phone is distinct from old.phone
      or new.date_of_birth is distinct from old.date_of_birth
      or new.is_active is distinct from old.is_active
      or new.teacher_level is distinct from old.teacher_level
      or new.level_updated_at is distinct from old.level_updated_at
    then
      raise exception 'Only an admin can change this field';
    end if;
  end if;
  return new;
end;
$$;

-- course_lessons: offline game notes + online game link ---------------------
alter table course_lessons
  add column description text,
  add column game_link text;

-- groups: structured schedule + course name for the redesigned board --------
create type schedule_type as enum ('odd', 'even');

alter table groups
  add column schedule_type schedule_type,
  add column course_name text;

-- staff_chats: read receipts -------------------------------------------------
alter table staff_chats add column is_read boolean not null default false;

-- Marking a message read is exposed as a function rather than a broad
-- UPDATE RLS policy: a plain "receiver_id = auth.uid()" UPDATE policy would
-- let a DM recipient rewrite the sender's message_text too (RLS is row-level,
-- not column-level) — this function only ever touches is_read, for a row
-- where the caller is genuinely the receiver.
create or replace function public.mark_staff_chat_read(message_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update staff_chats
  set is_read = true
  where id = message_id and receiver_id = auth.uid();
$$;

grant execute on function public.mark_staff_chat_read(uuid) to authenticated;

-- self_development ------------------------------------------------------------
create table self_development (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  month date not null,
  achievements text,
  value_added text,
  ceo_rating text,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table self_development enable row level security;

create policy "self_development_select"
  on self_development for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "self_development_insert_self"
  on self_development for insert
  to authenticated
  with check (user_id = auth.uid());

-- Only CEO/Admin can update a submission (set the rating) — the submitter's
-- own words become read-only once sent, matching "CEO/Admin can View/Update
-- rating" with no mention of the creator being able to edit afterward.
create policy "self_development_update_admin"
  on self_development for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- roadmap_goals — CEO/Admin only, end to end ---------------------------------
create type roadmap_timeframe as enum ('weekly', 'monthly', 'quarterly');
create type roadmap_status as enum ('pending', 'done', 'failed');

create table roadmap_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  timeframe roadmap_timeframe not null,
  status roadmap_status not null default 'pending',
  progress_percentage int not null default 0 check (progress_percentage between 0 and 100),
  failure_reason text,
  solution text,
  created_at timestamptz not null default now()
);

alter table roadmap_goals enable row level security;

create policy "roadmap_goals_all_admin"
  on roadmap_goals for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- future_projects — CEO/Admin only, end to end -------------------------------
create table future_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  initial_steps jsonb not null default '[]'::jsonb,
  estimated_budget numeric,
  created_at timestamptz not null default now()
);

alter table future_projects enable row level security;

create policy "future_projects_all_admin"
  on future_projects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Indexes for the new hot query paths ----------------------------------------
create index self_development_user_id_idx on self_development (user_id);
create index self_development_created_at_idx on self_development (created_at);
create index roadmap_goals_created_at_idx on roadmap_goals (created_at);
create index future_projects_created_at_idx on future_projects (created_at);

-- Closing two real gaps found while auditing existing hot tables: issues has
-- indexes on status but not on the two columns its own RLS policy and the
-- board's default sort actually filter/order by. course_lessons.lesson_date
-- is new — the Calendar rebuild queries lessons by date range.
create index issues_created_by_idx on issues (created_by);
create index issues_assigned_to_idx on issues (assigned_to);
create index issues_created_at_idx on issues (created_at);
create index course_lessons_lesson_date_idx on course_lessons (lesson_date);
