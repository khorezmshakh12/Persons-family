-- Finance › Moliya (Monitor 1:1, owner 2026-11-12): CEO jadvalda xodimni
-- «Avans so'raldi» deb belgilaydi (oy bo'yicha). Avans yozilgach belgi
-- o'chadi. Xodimning o'zi yuborgan so'rovlar advance_requests'da qoladi.
begin;

create table if not exists payroll_avans_flags (
  staff_id uuid not null references profiles(id) on delete cascade,
  period date not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (staff_id, period)
);

commit;
