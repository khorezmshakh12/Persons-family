-- CRM: oyliklar (xodim/o'qituvchi oylik fondi) + marketing xarajati (CAC uchun) (2026-10-17).
-- Oldin dashboard'da withdraws (oyliklar) qattiq 0 va CAC «NAMUNA» edi — endi real manba.
begin;

create table if not exists crm_salaries (
  id uuid primary key default gen_random_uuid(),
  period text not null,                 -- 'YYYY-MM' (qaysi oy uchun oylik)
  name text not null,                   -- kim: o'qituvchi/xodim nomi (erkin)
  teacher_id uuid references crm_teachers(id) on delete set null,
  amount numeric not null default 0,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_salaries_period_idx on crm_salaries (period);

create table if not exists crm_marketing_spend (
  id uuid primary key default gen_random_uuid(),
  spent_at date not null,               -- qachon sarflangan (kunlik — davr filtri uchun)
  channel text,                         -- kanal: Instagram, Telegram, banner...
  amount numeric not null default 0,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_marketing_spent_idx on crm_marketing_spend (spent_at);

commit;
