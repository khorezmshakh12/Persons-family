-- CRM: filial (branch) ustuni — ko'p-filial / konsolidatsiya ko'rinishi uchun (2026-10-18).
-- Mavjud barcha yozuvlar 'persons_lc' (til markazi) bo'lib qoladi. Boshqa filiallar:
-- pekin (Pekin School), social (Persons Social), it (IT loyihalar). «Konsolidatsiya» = hammasi.
begin;

alter table crm_students        add column if not exists branch text not null default 'persons_lc';
alter table crm_groups          add column if not exists branch text not null default 'persons_lc';
alter table crm_leads           add column if not exists branch text not null default 'persons_lc';
alter table crm_expenses        add column if not exists branch text not null default 'persons_lc';
alter table crm_salaries        add column if not exists branch text not null default 'persons_lc';
alter table crm_marketing_spend add column if not exists branch text not null default 'persons_lc';

create index if not exists crm_students_branch_idx on crm_students (branch);
create index if not exists crm_groups_branch_idx on crm_groups (branch);
create index if not exists crm_leads_branch_idx on crm_leads (branch);

commit;
