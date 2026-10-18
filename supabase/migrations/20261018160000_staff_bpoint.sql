-- B-nuqta: har bir xodimning yillik maosh maqsadi (2026-10-18).
-- "Yil oxiriga borib qancha maosh topishni xohlaydi" — Finance va Dashboardda
-- shu maqsadga nisbatan progress + eslatma ko'rsatiladi.
begin;

create table if not exists staff_bpoint (
  user_id uuid not null references profiles(id) on delete cascade,
  year int not null,
  amount numeric not null default 0,
  note text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);

commit;
