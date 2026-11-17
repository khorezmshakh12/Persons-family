-- B-nuqta: yarim yillik, 1 yillik va 3 yillik maqsadlar (owner, 2026-11-17).
-- Har bir xodimda uchtagacha B-nuqta: "6 oydan / 1 yildan / 3 yildan keyin
-- oyiga qancha olaman". Muddat maqsad qo'yilgan oydan (start_period)
-- boshlanadi. Eski yillik B-nuqta (staff_bpoint) 1 yillik maqsadga yanvardan
-- boshlab ko'chiriladi; eski jadval o'chirilmaydi.
begin;

create table if not exists staff_bpoint_goals (
  user_id uuid not null references profiles(id) on delete cascade,
  horizon text not null check (horizon in ('6m', '1y', '3y')),
  amount numeric not null default 0 check (amount >= 0),
  start_period date not null,
  note text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, horizon)
);

insert into staff_bpoint_goals (user_id, horizon, amount, start_period, note, updated_by, updated_at)
select distinct on (user_id) user_id, '1y', amount, make_date(year, 1, 1), note, updated_by, updated_at
from staff_bpoint
where amount > 0
order by user_id, year desc
on conflict (user_id, horizon) do nothing;

commit;
