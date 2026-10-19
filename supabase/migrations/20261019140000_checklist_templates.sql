-- ==========================================================================
-- Rol bo'yicha checklist shablonlari (Kunlik / Haftalik / Oylik) + har
-- xodimning davr bo'yicha belgilari. Task Tracker bo'limi endi shu native
-- checklist sahifasiga aylanadi (eski iframe tracker olib tashlandi).
--
-- Har xodim o'z rolining bandlarini ko'radi va belgilaydi. Belgi `period_key`
-- bo'yicha: kunlik 'YYYY-MM-DD', haftalik 'YYYY-Www', oylik 'YYYY-MM'
-- (Asia/Tashkent). Yangi davrda belgilar bo'sh bo'ladi — reset shu tarzda.
--
-- Additive / IF NOT EXISTS — qayta ishga tushirishga xavfsiz.
-- ==========================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  role        text not null,
  cadence     text not null check (cadence in ('daily', 'weekly', 'monthly')),
  title       text not null check (char_length(title) between 1 and 200),
  detail      text not null default '' check (char_length(detail) <= 2000),
  sort        int  not null default 0,
  active      boolean not null default true,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists checklist_templates_role_idx on checklist_templates (role, cadence, sort);

create table if not exists checklist_template_ticks (
  template_id uuid not null references checklist_templates(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  period_key  text not null,
  done_at     timestamptz not null default now(),
  primary key (template_id, user_id, period_key)
);
create index if not exists checklist_template_ticks_user_idx on checklist_template_ticks (user_id, period_key);

commit;
