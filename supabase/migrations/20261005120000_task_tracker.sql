-- Task Tracker (the owner's "Quiet Progress" sheet, src/tracker/tracker.html):
-- one private workspace per employee — weekly tasks, habits, mindset — kept
-- as the page's own JSON. Read and written only for the signed-in user
-- (src/app/api/task-tracker/*), so nobody sees anyone else's tracker.
begin;

create table if not exists task_tracker (
  user_id    uuid primary key references profiles(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

commit;
