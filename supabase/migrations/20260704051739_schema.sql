-- Core schema for the Persons Education Company internal platform.
create extension if not exists pgcrypto;

create type staff_role as enum ('ceo', 'admin_manager', 'teacher', 'assistant');
create type issue_status as enum ('open', 'in_progress', 'done');

-- Profiles (1:1 with auth.users). auth.users holds the synthetic email +
-- password; this table holds everything the app actually cares about.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique not null,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  avatar_url text,
  role staff_role not null default 'teacher',
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index profiles_role_idx on profiles (role);

-- Attendance
create table attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  work_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- At most one open (not yet clocked out) session per staff member per day.
create unique index attendance_one_open_session_per_day
  on attendance (user_id, work_date)
  where clock_out is null;

create index attendance_user_date_idx on attendance (user_id, work_date);

-- Internal staff chat (single shared room)
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_created_at_idx on chat_messages (created_at);

-- Issue tracker / direct feedback
create table issues (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text,
  status issue_status not null default 'open',
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index issues_status_idx on issues (status);

-- Lesson plans
create table lesson_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  topic text not null,
  plan_date date not null,
  file_url text,
  file_name text,
  file_type text,
  created_at timestamptz not null default now()
);

create index lesson_plans_teacher_date_idx on lesson_plans (teacher_id, plan_date);
