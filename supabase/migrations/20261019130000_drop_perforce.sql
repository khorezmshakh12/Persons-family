-- ==========================================================================
-- Persons Perforce bo'limi butunlay olib tashlandi (2026-10-19, egasi).
-- Bo'limning barcha jadvallari (pf_*) va faqat Perforce uchun qo'shilgan
-- strategy_spaces.owner_id ustuni tashlanadi. strategy_spaces jadvalining
-- o'zi Strategy bilan umumiy — teginilmaydi.
--
-- `if exists` + `cascade` — idempotent, qayta ishga tushirishga xavfsiz.
-- ==========================================================================

begin;

drop table if exists pf_cr_votes cascade;
drop table if exists pf_cr_comments cascade;
drop table if exists pf_change_requests cascade;
drop table if exists pf_test_cases cascade;
drop table if exists pf_sprint_goals cascade;
drop table if exists pf_status_updates cascade;
drop table if exists pf_settings cascade;
drop table if exists pf_reminders cascade;
drop table if exists pf_risks cascade;

alter table strategy_spaces drop column if exists owner_id;

commit;
