-- ==========================================================================
-- Project Manager role + Strategy workspace (roadmap, mind map, board,
-- list, gantt) — ported from the "persons-strategy" prototype, which kept
-- everything in localStorage.
--
-- 'project_manager' is only ADDED to the enum here; nothing in this file
-- uses it (a new enum value can't be referenced in the transaction that
-- adds it). Additive / IF NOT EXISTS throughout, safe to re-run. The seed
-- only runs while strategy_spaces is empty, so an edited workspace is
-- never overwritten.
-- ==========================================================================

begin;

alter type staff_role add value if not exists 'project_manager';

create table if not exists strategy_spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  subtitle    text not null default '',
  color       text not null default '#ff9f1c',
  start_date  date not null,
  end_date    date not null,
  -- { t: root title, ch: [{ t, c, ws, ch: [{ t }] }] } — the mind map
  mind        jsonb not null default '{"t":"","ch":[]}'::jsonb,
  -- [{ ws, plan, act }] in million so'm, per workstream
  budget      jsonb not null default '[]'::jsonb,
  sort_order  int not null default 0,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists strategy_roadmaps (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  subtitle     text not null default '',
  icon         text not null default 'P',
  -- [{ id, t, q, left: [text], right: [text] }]
  sections     jsonb not null default '[]'::jsonb,
  -- { nodeId: 'todo' | 'progress' | 'done' | 'skip' }
  node_status  jsonb not null default '{}'::jsonb,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists strategy_tasks (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references strategy_spaces(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 300),
  description   text not null default '',
  workstream    text not null default 'aka' check (workstream in ('aka', 'it', 'mkt', 'fil', 'mol', 'hr')),
  assignee_id   uuid references profiles(id) on delete set null,
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'todo' check (status in ('todo', 'progress', 'review', 'done')),
  priority      text not null default 'med' check (priority in ('high', 'med', 'low')),
  progress      int not null default 0 check (progress between 0 and 100),
  roadmap_id    uuid references strategy_roadmaps(id) on delete set null,
  roadmap_node  text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists strategy_tasks_space_idx on strategy_tasks (space_id);
create index if not exists strategy_tasks_assignee_idx on strategy_tasks (assignee_id);

create table if not exists strategy_milestones (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references strategy_spaces(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  date        date not null,
  created_at  timestamptz not null default now()
);
create index if not exists strategy_milestones_space_idx on strategy_milestones (space_id);

-- ---------- seed (prototype content) ----------

insert into strategy_roadmaps (key, name, subtitle, icon, sort_order, sections, node_status) values
('company', 'Kompaniya strategiyasi', '2026 → 2027', 'P', 0,
 '[{"id":"s1","t":"Asos","q":"2026 · Q1","left":["Brend identifikatsiyasi","Original darsliklar (6 daraja)"],"right":["Dars rejalari standarti","Staff portal"]},
   {"id":"s2","t":"Sifat","q":"2026 · Q2","left":["O''qituvchi KPI tizimi","TESOL / TEFL sertifikat"],"right":["Mock test tizimi","Red Zone intizomi"]},
   {"id":"s3","t":"Raqamlashtirish","q":"2026 · Q3","left":["LMS platforma","Mobil ilova"],"right":["Coin & XP gamifikatsiya","Onlayn davomat"]},
   {"id":"s4","t":"Kengayish","q":"2026 · Q4","left":["IELTS markaz akkreditatsiyasi","Pekin School HSK"],"right":["Yangi filial","2 ta yangi o''qituvchi"]},
   {"id":"s5","t":"Brend va o''sish","q":"2027","left":["Tech Lab kurslari","Persons Venchur Fondi"],"right":["Franshiza modeli","Persons Social"]}]'::jsonb,
 '{"s1":"done","s1-l0":"done","s1-l1":"done","s1-r0":"done","s1-r1":"done","s2":"done","s2-l0":"progress","s2-l1":"done","s2-r0":"done","s2-r1":"done","s3":"progress","s3-l0":"progress","s3-l1":"progress","s3-r0":"progress","s3-r1":"done","s4":"progress","s4-l0":"progress","s4-l1":"todo","s4-r0":"progress","s4-r1":"progress"}'::jsonb),
('teacher', 'O''qituvchi o''sish yo''li', 'Assistentdan metodistgacha', 'T', 1,
 '[{"id":"t1","t":"Assistent","q":"0–6 oy","left":["Dars kuzatish (10 ta)","Platformadan foydalanish"],"right":["Uy vazifa tekshirish","Red Zone qoidalari"]},
   {"id":"t2","t":"O''qituvchi","q":"6–18 oy","left":["TESOL / TEFL","Dars rejasi standarti"],"right":["IELTS 7.5+","Guruh boshqaruvi"]},
   {"id":"t3","t":"Katta o''qituvchi","q":"1.5–3 yil","left":["Mentorlik (2 assistent)","Mock test o''tkazish"],"right":["Ochiq dars masterklass","Ota-onalar bilan ishlash"]},
   {"id":"t4","t":"Head Teacher","q":"3+ yil","left":["Kurs sifat nazorati","O''qituvchi baholash"],"right":["Dars rejalari tasdig''i","CELTA / DELTA"]},
   {"id":"t5","t":"Metodist","q":"Yetakchi","left":["Darslik mualliflik","Kurs dizayni"],"right":["Treninglar o''tkazish","Tech Lab: Prompt Engineering"]}]'::jsonb,
 '{"t1":"done","t1-l0":"done","t1-l1":"done","t1-r0":"done","t1-r1":"done","t2":"progress","t2-l0":"done","t2-l1":"done","t2-r0":"progress"}'::jsonb)
on conflict (key) do nothing;

with sp as (
  insert into strategy_spaces (name, subtitle, color, start_date, end_date, mind, budget)
  select 'Persons 2026', 'Q4 strategiyasi: kengayish va raqamlashtirish', '#ff9f1c', '2026-09-01', '2026-11-30',
    '{"t":"Strategiya 2026","ch":[
      {"t":"Akademik sifat","c":"#ff9f1c","ws":"aka","ch":[{"t":"IELTS markaz"},{"t":"Mock testlar"},{"t":"O''qituvchi o''sishi"}]},
      {"t":"Marketing","c":"#e8567a","ws":"mkt","ch":[{"t":"Reels kontent"},{"t":"Ota-onalar kuni"},{"t":"Tavsiya 65%+"}]},
      {"t":"Raqamlashtirish","c":"#2477c9","ws":"it","ch":[{"t":"LMS"},{"t":"Mobil ilova"},{"t":"Coin & XP"}]},
      {"t":"Kengayish","c":"#7a5af8","ws":"fil","ch":[{"t":"Yangi filial"},{"t":"Pekin School"},{"t":"Tech Lab"}]},
      {"t":"Moliya","c":"#139a52","ws":"mol","ch":[{"t":"Q4 budjet"},{"t":"Cashback"},{"t":"Narx 490K"}]},
      {"t":"Jamoa","c":"#0ea5a4","ws":"hr","ch":[{"t":"Yollash"},{"t":"KPI"},{"t":"Yulduzlar"}]}]}'::jsonb,
    '[{"ws":"aka","plan":42,"act":28},{"ws":"it","plan":35,"act":24},{"ws":"mkt","plan":18,"act":14},{"ws":"fil","plan":60,"act":9},{"ws":"hr","plan":12,"act":7}]'::jsonb
  where not exists (select 1 from strategy_spaces)
  returning id
), ms as (
  insert into strategy_milestones (space_id, title, date)
  select sp.id, v.t, v.d::date from sp cross join (values
    ('IELTS markaz ochilishi', '2026-11-15'), ('Filial ochilishi', '2026-11-28')) v(t, d)
)
insert into strategy_tasks (space_id, title, workstream, start_date, end_date, status, priority, progress, roadmap_id, roadmap_node)
select sp.id, v.t, v.ws, v.s::date, v.e::date, v.st, v.pr, v.p,
  case when v.node is null then null else (select id from strategy_roadmaps where key = 'company') end, v.node
from sp cross join (values
  ('IELTS markaz akkreditatsiya hujjatlari', 'aka', '2026-09-01', '2026-09-20', 'done', 'high', 100, 's4-l0'),
  ('British Council bilan uchrashuv', 'aka', '2026-09-22', '2026-09-30', 'progress', 'high', 40, 's4-l0'),
  ('Mock test xonasini jihozlash', 'aka', '2026-09-28', '2026-10-12', 'todo', 'med', 0, 's4-l0'),
  ('Dars rejalari standarti (template)', 'aka', '2026-09-03', '2026-09-17', 'done', 'low', 100, 's1-r0'),
  ('Pekin School: HSK 3 guruhini ochish', 'aka', '2026-10-01', '2026-10-25', 'todo', 'med', 0, 's4-l1'),
  ('LMS: davomat moduli', 'it', '2026-09-08', '2026-09-30', 'review', 'high', 85, 's3-l0'),
  ('Coin & XP tizimini integratsiya qilish', 'it', '2026-09-15', '2026-10-15', 'progress', 'med', 40, 's3-r0'),
  ('Mobil ilova — beta versiya', 'it', '2026-10-05', '2026-11-10', 'todo', 'high', 0, 's3-l1'),
  ('Kuzgi qabul kampaniyasi', 'mkt', '2026-09-01', '2026-09-30', 'progress', 'high', 70, null),
  ('Instagram Reels kontent-reja (Q4)', 'mkt', '2026-09-21', '2026-10-06', 'todo', 'med', 10, null),
  ('Ota-onalar kuni tadbiri', 'mkt', '2026-10-12', '2026-10-18', 'todo', 'low', 0, null),
  ('Yangi filial joyini tanlash', 'fil', '2026-09-08', '2026-09-22', 'progress', 'med', 60, 's4-r0'),
  ('Filial ta''mirlash smetasi', 'fil', '2026-09-24', '2026-10-16', 'todo', 'med', 0, 's4-r0'),
  ('Q4 budjet rejasi', 'mol', '2026-09-05', '2026-09-18', 'done', 'high', 100, null),
  ('Cashback tizimi hisob-kitobi', 'mol', '2026-09-25', '2026-10-09', 'todo', 'low', 0, null),
  ('O''qituvchilar KPI tizimini yangilash', 'hr', '2026-09-12', '2026-10-03', 'review', 'med', 90, 's2-l0'),
  ('2 ta IELTS o''qituvchi yollash', 'hr', '2026-09-15', '2026-10-22', 'progress', 'high', 30, 's4-r1')
) v(t, ws, s, e, st, pr, p, node);

commit;
