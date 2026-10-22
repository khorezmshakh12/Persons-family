-- Operation HQ › Sales (2026-10-22): kanban over the CRM leads (crm_leads),
-- one source with CRM › Lidlar and the Telegram bot.
--
--   * Bosqichlar = crm_lead_sections (sort). «O'quvchi bo'ldi» (kind joined) va
--     «Rad etdi» (kind lost) bo'lmasa qo'shiladi; umuman bosqich bo'lmasa —
--     standart voronka. section_id = null + source 'telegram' → «Telegram» ustuni.
--   * crm_lead_groups — lidlarni guruhlash (rang bilan), lidda group_id.
--   * Lidga: yosh, mas'ul xodim, bosqichga o'tgan vaqt, birinchi aloqa vaqti
--     (javob tezligi), keyingi qadam + sana, rad etish sababi, sinov eslatmasi,
--     arxiv (o'chirish arxivga; qaytarish mumkin).
--   * crm_lead_activities — izohlarni tahrirlash (updated_at/updated_by).
--   * crm_student_notes — o'quvchiga izohlar (kim yozgan, tahrir).
--   * crm_message_templates.audience — o'quvchi yoki lid shablonlari.
--   * crm_lead_log — lid bo'yicha kim, nima qildi.
begin;

create table if not exists crm_lead_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'g1' check (color in ('g1', 'g2', 'g3', 'g4', 'g5', 'g6')),
  sort int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table crm_leads
  add column if not exists age int check (age is null or age between 1 and 99),
  add column if not exists group_id uuid references crm_lead_groups(id) on delete set null,
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists stage_at timestamptz not null default now(),
  add column if not exists first_contact_at timestamptz,
  add column if not exists next_action text,
  add column if not exists next_at date,
  add column if not exists lost_reason text,
  add column if not exists trial_reminded_for date,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references profiles(id) on delete set null;
create index if not exists crm_leads_open_idx on crm_leads (created_at desc) where archived_at is null;

-- Existing leads count as already contacted (no false «javob kutmoqda» alarms).
update crm_leads set first_contact_at = coalesce(first_contact_at, created_at), stage_at = created_at
where first_contact_at is null and created_at < now() - interval '1 hour';

alter table crm_lead_activities
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references profiles(id) on delete set null;

create table if not exists crm_student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  body text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz
);
create index if not exists crm_student_notes_student_idx on crm_student_notes (student_id, created_at desc);

create table if not exists crm_lead_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm_leads(id) on delete cascade,
  text text not null,
  actor uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_lead_log_lead_idx on crm_lead_log (lead_id, created_at desc);

alter table crm_message_templates
  add column if not exists audience text not null default 'student' check (audience in ('student', 'lead'));
insert into crm_message_templates (name, body, trigger, sort, audience)
select * from (values
  ('Salomlashish', E'Assalomu alaykum, {ism}! Persons o‘quv markaziga qiziqish bildirganingiz uchun rahmat. {kurs} kursi bo‘yicha savollaringiz bo‘lsa, shu yerga yozing — menejerimiz javob beradi.', 'none', 1, 'lead'),
  ('Sinov darsiga taklif', E'Assalomu alaykum, {ism}! {kurs} kursi bo‘yicha bepul sinov darsiga taklif qilamiz. Sizga qaysi kun va soat qulay?', 'none', 2, 'lead'),
  ('Sinov darsi eslatmasi', E'Assalomu alaykum, {ism}! Eslatib o‘tamiz: {kurs} sinov darsi {sinov_sana} kuni soat {sinov_vaqt} da. Sizni kutamiz! — Persons', 'before', 3, 'lead')
) as v(name, body, trigger, sort, audience)
where not exists (select 1 from crm_message_templates where audience = 'lead');

-- Funnel stages: the default set when there are none, and the two closing
-- stages the board needs.
insert into crm_lead_sections (name, sort, kind)
select * from (values
  ('Yangi', 1, 'manual'), ('Bog‘lanildi', 2, 'manual'), ('Sinov darsiga yozildi', 3, 'trial'),
  ('Sinovga keldi', 4, 'manual'), ('To‘lov kutilmoqda', 5, 'manual')
) as v(name, sort, kind)
where not exists (select 1 from crm_lead_sections where archived_at is null);
insert into crm_lead_sections (name, sort, kind)
select 'O‘quvchi bo‘ldi', 900, 'joined' where not exists (select 1 from crm_lead_sections where kind = 'joined' and archived_at is null);
insert into crm_lead_sections (name, sort, kind)
select 'Rad etdi', 950, 'lost' where not exists (select 1 from crm_lead_sections where kind = 'lost' and archived_at is null);

commit;
