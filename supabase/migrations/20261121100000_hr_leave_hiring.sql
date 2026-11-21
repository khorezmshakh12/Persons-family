-- HR to'liq (owner, 2026-11-21):
--  1) Ta'til va Ishga olish Core'dan saytning o'ziga ko'chadi. Core'dagi
--     yozuvlar (core_state.data->'leave' / 'vac') bir marta ko'chiriladi;
--     core_id takroriy ko'chirishni to'xtatadi. Core ma'lumotiga tegilmaydi.
--  2) Roadmap: bosqich qarorlari tarixi (review_log) va muddat eslatmasi
--     yuborilganini belgilash (reminded: {stageId: due}).
begin;

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('vacation', 'sick', 'day_off', 'remote')),
  from_day date not null,
  to_day date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  core_id text unique,
  check (to_day >= from_day)
);
create index if not exists leave_requests_user_idx on leave_requests (user_id, from_day desc);
create index if not exists leave_requests_status_idx on leave_requests (status, created_at);

create table if not exists hr_vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  dept text not null check (dept in ('top', 'acad', 'com', 'ops', 'fin', 'hr')),
  seats int not null default 1 check (seats between 1 and 99),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  applicants int not null default 0 check (applicants >= 0),
  interviews int not null default 0 check (interviews >= 0),
  offers int not null default 0 check (offers >= 0),
  note text,
  created_by uuid references profiles(id) on delete set null,
  core_id text unique
);

-- Core leave: {id, k (Core key), from, to (ms), type, r, st: pending|ok|no, at}.
-- data->'keys' = {profileId: coreKey}.
insert into leave_requests (user_id, kind, from_day, to_day, reason, status, created_at, decided_at, core_id)
select p.id,
  case l->>'type' when 'Kasallik' then 'sick' when 'Bir kunlik ruxsat' then 'day_off' when 'Masofadan ish' then 'remote' else 'vacation' end,
  (to_timestamp((l->>'from')::numeric / 1000) at time zone 'Asia/Tashkent')::date,
  greatest(
    (to_timestamp((l->>'to')::numeric / 1000) at time zone 'Asia/Tashkent')::date,
    (to_timestamp((l->>'from')::numeric / 1000) at time zone 'Asia/Tashkent')::date),
  nullif(trim(coalesce(l->>'r', '')), ''),
  case l->>'st' when 'ok' then 'approved' when 'no' then 'rejected' else 'pending' end,
  coalesce(to_timestamp(nullif(l->>'at', '')::numeric / 1000), now()),
  case when l->>'st' in ('ok', 'no') then coalesce(to_timestamp(nullif(l->>'at', '')::numeric / 1000), now()) end,
  'core:' || (l->>'id')
from core_state cs
cross join lateral jsonb_array_elements(case when jsonb_typeof(cs.data->'leave') = 'array' then cs.data->'leave' else '[]'::jsonb end) l
join lateral jsonb_each_text(case when jsonb_typeof(cs.data->'keys') = 'object' then cs.data->'keys' else '{}'::jsonb end) k on k.value = l->>'k'
join profiles p on p.id::text = k.key
where cs.id = 1
  and jsonb_typeof(l->'from') = 'number' and jsonb_typeof(l->'to') = 'number' and l ? 'id'
on conflict (core_id) do nothing;

-- Core vacancies: {id, t, d, open (ms), st: open|closed, n, cand: {app, int, off}, closed (ms)}.
insert into hr_vacancies (title, dept, seats, status, opened_at, closed_at, applicants, interviews, offers, core_id)
select left(trim(v->>'t'), 120),
  case when v->>'d' in ('top', 'acad', 'com', 'ops', 'fin', 'hr') then v->>'d' else 'acad' end,
  least(greatest(coalesce(nullif(v->>'n', '')::numeric::int, 1), 1), 99),
  case when v->>'st' = 'closed' then 'closed' else 'open' end,
  coalesce(to_timestamp(nullif(v->>'open', '')::numeric / 1000), now()),
  case when v->>'st' = 'closed' then coalesce(to_timestamp(nullif(v->>'closed', '')::numeric / 1000), now()) end,
  greatest(coalesce(nullif(v#>>'{cand,app}', '')::numeric::int, 0), 0),
  greatest(coalesce(nullif(v#>>'{cand,int}', '')::numeric::int, 0), 0),
  greatest(coalesce(nullif(v#>>'{cand,off}', '')::numeric::int, 0), 0),
  'core:' || (v->>'id')
from core_state cs
cross join lateral jsonb_array_elements(case when jsonb_typeof(cs.data->'vac') = 'array' then cs.data->'vac' else '[]'::jsonb end) v
where cs.id = 1 and v ? 'id' and coalesce(trim(v->>'t'), '') <> ''
on conflict (core_id) do nothing;

alter table hr_growth
  add column if not exists review_log jsonb not null default '[]'::jsonb,
  add column if not exists reminded jsonb not null default '{}'::jsonb;

commit;
