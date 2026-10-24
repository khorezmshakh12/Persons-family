-- CRM → Finance ulanishi uchun hisob kodlari (2026-10-15).
--
-- CEO/COO "Persons ulanishi" sahifasida o'z hisob rejasidan (acct_accounts)
-- qaysi KIRIM hisobiga (type R) va qaysi KASSA/BANK hisobiga (type A) CRM
-- to'lovlari o'tkazilishini tanlaydi. Shu bosqichda faqat sozlama saqlanadi;
-- daftarga (acct_entries) yozish keyingi, alohida qadam.
begin;

alter table crm_settings
  add column if not exists income_acct text,
  add column if not exists cash_acct text;

commit;
