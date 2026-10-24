-- CRM Telegram lid-boti (2026-10-18).
-- /start → telefon → ism familya. Telefon ota-ona/o'quvchi kontaktiga mos kelsa
-- o'quvchiga biriktiriladi (xabar yuborish uchun chat_id saqlanadi); aks holda
-- yangi lid sifatida crm_leads'ga tushadi.
begin;

-- Suhbat holati (ko'p qadamli: telefon → ism).
create table if not exists crm_bot_sessions (
  chat_id bigint primary key,
  step text not null default 'start',
  phone text,
  updated_at timestamptz not null default now()
);

-- Lid va kontaktga telegram chat_id (keyin xabar yuborish uchun).
alter table crm_leads add column if not exists telegram_chat_id bigint;
alter table crm_contacts add column if not exists telegram_chat_id bigint;
create index if not exists crm_contacts_tg_idx on crm_contacts (telegram_chat_id) where telegram_chat_id is not null;

commit;
