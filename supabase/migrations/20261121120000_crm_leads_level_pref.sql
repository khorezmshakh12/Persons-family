-- Ops › Sales «Guruh yig'ish» (2026-11-03): ochiq lidlar Kurs · Daraja · Kun · Vaqt
-- bo'yicha to'planadi. Lidga daraja va qulay kun/vaqt qo'shiladi.
begin;

alter table crm_leads
  add column if not exists level text,
  add column if not exists pref_days text check (pref_days is null or pref_days in ('odd', 'even', 'daily', 'weekend')),
  add column if not exists pref_time text check (pref_time is null or pref_time ~ '^\d{2}:\d{2}$');

commit;
