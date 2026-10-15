-- CRM of Persons — baza poydevori (2026-10-15).
--
-- O'quvchilar CRM'i platforma ichida mustaqil yashaydi: manba (schoolup) bir
-- marta import qilinadi (scripts/crm-import.ts), keyin barcha amallar shu
-- jadvallarda saqlanadi. Bo'lim faqat CEO/COO uchun — kirish route darajasida
-- himoyalangan (src/app/api/crm, canSeeFor 'crmPersons'); uy uslubiga ko'ra
-- RLS ishlatilmaydi (ilova service ulanish bilan yozadi).
--
-- Dizayn qoidalari (kelajakda bug chiqmasligi uchun):
--   * Pul — numeric(14,2), float emas; har to'lov/charge summasi O'Z yozuvida
--     saqlanadi (tarif o'zgarsa tarix buzilmaydi).
--   * Qarz — crm_charges (hisoblangan) minus crm_payments (kelgan); balans
--     ustun sifatida saqlanmaydi (drift bo'lmasin).
--   * Barcha sana `date`/`timestamptz`; biznes kuni Asia/Tashkent'da hisoblanadi
--     (ilovada src/lib/time.ts).
--   * Yumshoq o'chirish (archived_at) — hard-delete yo'q, FK yetim qolmasin.
--   * Turlar — CHECK ro'yxati yoki lookup jadval (dinamik voronka = jadval).
--   * external_id — schoolup ID'si; qayta importda dublikat bo'lmasin (unique).
--   * branch_id (nullable) — kelajakda ko'p filial, qayta yozishsiz.
--   * Har jadvalda created_by / created_at (+ kerakli joyda updated_*).

begin;

-- ---------------------------------------------------------------------------
-- Lookuplar / mustaqil
-- ---------------------------------------------------------------------------

create table if not exists crm_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Yagona qatorli sozlama (standart sikl, kech qolish chegarasi, valyuta...).
create table if not exists crm_settings (
  id boolean primary key default true check (id), -- faqat bitta qator
  cycle_days int not null default 30,
  late_after_minutes int not null default 10,
  currency text not null default 'UZS',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists crm_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  utm text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Lidlar voronkasi bosqichlari (dinamik — shuning uchun jadval, enum emas).
create table if not exists crm_lead_sections (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  sort int not null default 0,
  kind text not null default 'manual'
    check (kind in ('manual', 'trial', 'frozen', 'joined', 'lost', 'custom')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists crm_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- O'quv tuzilmasi
-- ---------------------------------------------------------------------------

create table if not exists crm_courses (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  archived_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists crm_levels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references crm_courses(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists crm_rooms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references crm_branches(id) on delete set null,
  name text not null,
  capacity int,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- O'qituvchi = Staff profili (profiles). CRM alohida akkaunt ochmaydi.
create table if not exists crm_teachers (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  profile_id uuid references profiles(id) on delete set null,
  display_name text not null,
  archived_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Narx rejalari (tarix bilan — amount o'zgarsa yangi tarif qatori ochiladi).
create table if not exists crm_tariffs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references crm_courses(id) on delete set null,
  name text not null,
  amount numeric(14,2) not null default 0,
  cycle_days int not null default 30,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- O'quvchi va aloqa
-- ---------------------------------------------------------------------------

create table if not exists crm_students (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  branch_id uuid references crm_branches(id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  full_name text not null,
  sex text check (sex in ('m', 'w')),
  birthday date,
  status text not null default 'active'
    check (status in ('active', 'frozen', 'archived')),
  scores int not null default 0,
  coins int not null default 0,
  note text not null default '',
  archived_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bir o'quvchiga bir necha telefon / ota-ona.
create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  kind text not null default 'student'
    check (kind in ('student', 'father', 'mother', 'guardian', 'other')),
  name text,
  phone text,
  telegram_id bigint,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists crm_student_tags (
  student_id uuid not null references crm_students(id) on delete cascade,
  tag_id uuid not null references crm_tags(id) on delete cascade,
  primary key (student_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Guruhlar
-- ---------------------------------------------------------------------------

create table if not exists crm_groups (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  branch_id uuid references crm_branches(id) on delete set null,
  name text not null,
  course_id uuid references crm_courses(id) on delete set null,
  level_id uuid references crm_levels(id) on delete set null,
  room_id uuid references crm_rooms(id) on delete set null,
  head_teacher_id uuid references crm_teachers(id) on delete set null,
  tariff_id uuid references crm_tariffs(id) on delete set null,
  days text,                               -- 'mo,we,fr'
  start_time text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  student_limit int not null default 12,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  start_date date,
  end_date date,
  archived_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Asosiy + yordamchi o'qituvchilar (many-to-many).
create table if not exists crm_group_teachers (
  group_id uuid not null references crm_groups(id) on delete cascade,
  teacher_id uuid not null references crm_teachers(id) on delete cascade,
  role text not null default 'main' check (role in ('main', 'assistant')),
  primary key (group_id, teacher_id)
);

-- Haftalik jadval slotlari (xona to'qnashuvi tekshiruvi uchun — kelajak).
create table if not exists crm_schedule (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_groups(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0 = yakshanba
  start_time text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  end_time text check (end_time is null or end_time ~ '^\d{2}:\d{2}$'),
  room_id uuid references crm_rooms(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Abonement (obuna), hisob va to'lov
-- ---------------------------------------------------------------------------

-- Abonement = o'quvchining guruhdagi obunasi. activation_date — keyingi oylik
-- to'lov hisobining boshlanishi (muzlatilgan kunlar qo'shilib hisoblanadi).
create table if not exists crm_enrollments (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  student_id uuid not null references crm_students(id) on delete cascade,
  group_id uuid not null references crm_groups(id) on delete cascade,
  tariff_id uuid references crm_tariffs(id) on delete set null,
  tariff_amount numeric(14,2) not null default 0, -- snapshot (tarix uchun)
  cycle_days int not null default 30,
  activation_date date not null,
  status text not null default 'active'
    check (status in ('active', 'frozen', 'left', 'finished')),
  frozen_days int not null default 0,  -- muzlatilgan jami kunlar (due surilishi)
  left_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bitta faol abonement (o'quvchi+guruh) — dublikat bo'lmasin (arxivlanmagan).
create unique index if not exists crm_enrollments_uq
  on crm_enrollments (student_id, group_id)
  where status <> 'finished';

-- Abonement holati tarixi (muzlatish/faollashtirish audit).
create table if not exists crm_enrollment_status_history (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references crm_enrollments(id) on delete cascade,
  from_status text,
  to_status text not null,
  effective_date date not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Chegirma / grant (kelajak).
create table if not exists crm_discounts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references crm_enrollments(id) on delete cascade,
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(14,2) not null,
  reason text,
  valid_from date,
  valid_to date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Har sikl uchun hisoblangan to'lov (nima qarz) — to'g'ri qarz hisobi uchun.
create table if not exists crm_charges (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references crm_enrollments(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null,
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid', 'waived', 'overdue')),
  created_at timestamptz not null default now()
);

create index if not exists crm_charges_enr_idx on crm_charges (enrollment_id);
create index if not exists crm_charges_due_idx on crm_charges (due_date);

-- Kelgan pul. method — CHECK ro'yxati (yangisi migration bilan qo'shiladi).
-- idem_key — ikki marta bosishda qo'sh to'lovni to'sadi.
create table if not exists crm_payments (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  student_id uuid references crm_students(id) on delete set null,
  enrollment_id uuid references crm_enrollments(id) on delete set null,
  group_name text,                         -- snapshot (tarix uchun)
  amount numeric(14,2) not null,
  method text not null default 'cash'
    check (method in ('cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other')),
  paid_at date not null,
  is_refund boolean not null default false,
  refund_amount numeric(14,2) not null default 0,
  note text,
  idem_key text unique,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_payments_student_idx on crm_payments (student_id);
create index if not exists crm_payments_paid_idx on crm_payments (paid_at desc);

-- ---------------------------------------------------------------------------
-- Dars va davomat
-- ---------------------------------------------------------------------------

-- Rejalashtirilgan dars nusxalari (kelajakda Lesson Plans bilan bog'lanadi).
create table if not exists crm_lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references crm_groups(id) on delete cascade,
  lesson_date date not null,
  start_time text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  topic text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'held', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists crm_lessons_group_idx on crm_lessons (group_id, lesson_date);

-- Bir yozuv — bitta (o'quvchi, guruh, sana). late present'ni nazarda tutadi.
create table if not exists crm_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references crm_students(id) on delete cascade,
  group_id uuid not null references crm_groups(id) on delete cascade,
  lesson_id uuid references crm_lessons(id) on delete set null,
  att_date date not null,
  present boolean not null default false,
  is_late boolean not null default false,
  is_trial boolean not null default false,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, group_id, att_date)
);

create index if not exists crm_attendance_group_date_idx on crm_attendance (group_id, att_date);

-- ---------------------------------------------------------------------------
-- Lidlar (sotuv voronkasi)
-- ---------------------------------------------------------------------------

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  branch_id uuid references crm_branches(id) on delete set null,
  section_id uuid references crm_lead_sections(id) on delete set null,
  source_id uuid references crm_sources(id) on delete set null,
  name text,
  phone text,
  course_id uuid references crm_courses(id) on delete set null,
  note text,
  status text not null default 'open'
    check (status in ('open', 'won', 'lost')),
  converted_student_id uuid references crm_students(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_leads_section_idx on crm_leads (section_id);

-- Lid bo'yicha qo'ng'iroq/eslatma/kuzatuv (kelajak to'liq pipeline).
create table if not exists crm_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('call', 'note', 'meeting', 'message')),
  body text,
  due_at timestamptz,
  done boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Moliya va integratsiya
-- ---------------------------------------------------------------------------

create table if not exists crm_expenses (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  branch_id uuid references crm_branches(id) on delete set null,
  category text,
  amount numeric(14,2) not null,
  spent_at date not null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_expenses_spent_idx on crm_expenses (spent_at desc);

-- O'qituvchi oyligi (kelajak — davomat/tushumga bog'liq; Finance bilan ulanadi).
create table if not exists crm_teacher_payroll (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references crm_teachers(id) on delete cascade,
  period_month date not null,              -- oy boshi
  amount numeric(14,2) not null default 0,
  basis text,                              -- 'revenue_share' | 'fixed' ...
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (teacher_id, period_month)
);

-- Yuborilgan/kelgan xabarlar jurnali (Telegram/SMS — kelajak).
create table if not exists crm_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references crm_students(id) on delete set null,
  lead_id uuid references crm_leads(id) on delete set null,
  channel text not null default 'telegram' check (channel in ('telegram', 'sms')),
  direction text not null default 'out' check (direction in ('out', 'in')),
  body text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'received')),
  sent_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Shartnoma/fayllar (kelajak — Cloud Storage path).
create table if not exists crm_documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('student', 'enrollment', 'group')),
  owner_id uuid not null,
  name text not null,
  storage_path text not null,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Qidiruv indekslari (ism/telefon). Kengaytirilgan fuzzy qidiruv keyin
-- pg_trgm bilan qo'shilishi mumkin; hozircha oddiy btree yetarli.
create index if not exists crm_students_name_idx on crm_students (lower(full_name));
create index if not exists crm_contacts_phone_idx on crm_contacts (phone);
create index if not exists crm_enrollments_student_idx on crm_enrollments (student_id);
create index if not exists crm_enrollments_group_idx on crm_enrollments (group_id);

commit;
