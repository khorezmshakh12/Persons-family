-- CRM: lid manbasi + ketish sababi (2026-10-16). Dashboard analitikasi uchun.
begin;

alter table crm_leads add column if not exists source text;
alter table crm_students add column if not exists leave_reason text;

commit;
