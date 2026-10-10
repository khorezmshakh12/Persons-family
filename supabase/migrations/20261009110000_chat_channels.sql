-- Chat v2: channels (company-wide, per department, ad-hoc groups) next to
-- the 1:1 DMs, with threads, @mentions, pins and scheduled posts; plus a
-- per-person chat status ("in a lesson", "in a meeting"…).
-- Messages live here in Cloud SQL; live delivery is a board_signals/chat-<id>
-- "something changed" bump, so no Firestore rule change is needed.
begin;

create table if not exists chat_channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  topic       text check (char_length(topic) <= 200),
  kind        text not null check (kind in ('all', 'dept', 'group')),
  dept        text,
  announce    boolean not null default false,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists chat_channels_dept_uniq on chat_channels (dept) where kind = 'dept';

create table if not exists chat_channel_members (
  channel_id   uuid not null references chat_channels(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  is_admin     boolean not null default false,
  muted        boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx on chat_channel_members (user_id);

-- sender_id has no ON DELETE: removeStaffAccount() deactivates instead of
-- deleting anyone who has history, same as every other authored table.
create table if not exists chat_channel_messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references chat_channels(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text check (char_length(body) <= 4000),
  media_url   text,
  media_type  text not null default 'none' check (media_type in ('image', 'video', 'voice', 'file', 'none')),
  thread_id   uuid references chat_channel_messages(id) on delete cascade,
  mentions    uuid[] not null default '{}',
  reactions   jsonb not null default '{}'::jsonb,
  pinned_at   timestamptz,
  pinned_by   uuid references profiles(id) on delete set null,
  edited_at   timestamptz,
  send_at     timestamptz not null default now(),
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists chat_channel_messages_stream_idx on chat_channel_messages (channel_id, send_at desc);
create index if not exists chat_channel_messages_thread_idx on chat_channel_messages (thread_id) where thread_id is not null;
create index if not exists chat_channel_messages_due_idx on chat_channel_messages (send_at) where notified_at is null;

alter table profiles
  add column if not exists chat_status text check (chat_status in ('lesson', 'meeting', 'busy', 'away')),
  add column if not exists chat_status_until timestamptz;

-- Starter channels: one company-wide announcement channel + one per department.
insert into chat_channels (name, topic, kind, announce)
select 'Umumiy e’lonlar', 'Rahbariyatdan butun jamoaga', 'all', true
where not exists (select 1 from chat_channels where kind = 'all');

insert into chat_channels (name, topic, kind, dept)
select v.name, v.topic, 'dept', v.dept
from (values
  ('top', 'Rahbariyat', 'Boshqaruv masalalari'),
  ('acad', 'Akademik bo‘lim', 'O‘qituvchilar, assistentlar, dars sifati'),
  ('com', 'Tijorat bo‘limi', 'Sotuv, marketing, tadbirlar'),
  ('ops', 'Operatsiya', 'Xonalar, jadval, IT, loyihalar'),
  ('fin', 'Moliya', 'Moliya bo‘limi'),
  ('hr', 'HR va ma’muriyat', 'Kadrlar va ma’muriy ishlar')
) as v(dept, name, topic)
on conflict do nothing;

commit;
