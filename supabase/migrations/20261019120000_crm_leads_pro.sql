-- CRM Lidlar bo'limi takomillashtirish (2026-10-19).
-- Sinov darsi (kun/vaqt/izoh) lidga; Telegram username lid va kontaktga.
-- Eslatma: izoh tarixi mavjud crm_lead_activities'da yuritiladi; ustun (bosqich)
-- CRUD mavjud crm_lead_sections'da (sort ustuni bor); telefon-raqamli chat
-- bog'lanishi crm_leads.telegram_chat_id / crm_contacts.telegram_chat_id'da.
begin;

-- Sinov darsiga chaqiruv: qaysi kun, soat, qaysi dars (erkin matn).
alter table crm_leads add column if not exists trial_date date;
alter table crm_leads add column if not exists trial_time text;
alter table crm_leads add column if not exists trial_note text;

-- Telegram username (botdan avtomatik to'lib keladi) — lid va kontaktda.
alter table crm_leads    add column if not exists telegram_username text;
alter table crm_contacts add column if not exists telegram_username text;

commit;
