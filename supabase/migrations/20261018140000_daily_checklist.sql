-- Har bir xodimning shaxsiy kunlik checklisti (2026-10-18).
-- checklist_items = takrorlanuvchi kunlik bandlar (har xodim o'zi belgilaydi).
-- checklist_ticks = qaysi band qaysi kuni bajarilgani (mavjud yozuv = bajarilgan).
begin;

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists checklist_items_user_idx on checklist_items (user_id, sort);

create table if not exists checklist_ticks (
  item_id uuid not null references checklist_items(id) on delete cascade,
  date_key text not null,                 -- 'YYYY-MM-DD' (Asia/Tashkent)
  done_at timestamptz not null default now(),
  primary key (item_id, date_key)
);

commit;
