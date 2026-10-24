-- CRM: imtihon va sertifikatlar (2026-10-16). Xonalar crm_rooms'da allaqachon bor.
begin;

create table if not exists crm_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  group_name text,
  name text not null,
  exam_date date,
  score int,
  max_score int not null default 100,
  passed boolean not null default false,
  cert boolean not null default false,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_exams_student_idx on crm_exams (student_id, exam_date desc);

commit;
