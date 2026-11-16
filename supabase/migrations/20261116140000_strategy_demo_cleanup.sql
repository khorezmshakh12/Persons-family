-- Strategiya: demo ma'lumotlarni o'chirish (owner, 2026-11-16: "demo
-- ma'lumotlarni o'chir"). The Sep-24 migration
-- (20260924120000_project_manager_and_strategy) seeded the first space with
-- 17 sample tasks, a sample budget, a sample mind map and two sample
-- milestones. They are removed here; everything the team typed stays
-- (their own tasks, goals / KRs, other spaces).
--   * the 17 seeded tasks (exact seeded titles, in the seeded space) —
--     dependencies and KR links cascade; their open Tasks-board mirrors are
--     dropped like deleteStrategyTaskAction does, done mirrors stay;
--   * the two seeded milestones (title + date);
--   * the seeded budget → empty; the seeded mind map → empty.
-- Every touched row is copied to strategy_demo_backup first. Runs once.

begin;

create table if not exists strategy_demo_backup (
  id         uuid primary key default gen_random_uuid(),
  tbl        text not null,
  row_id     uuid,
  row_data   jsonb not null,
  created_at timestamptz not null default now()
);

do $$
declare
  sp uuid;
  n int;
begin
  if exists (select 1 from strategy_demo_backup) then
    raise notice 'strategy demo cleanup already applied';
    return;
  end if;

  select id into sp from strategy_spaces
  where subtitle = 'Q4 strategiyasi: kengayish va raqamlashtirish'
  order by created_at limit 1;
  if sp is null then
    raise notice 'seeded strategy space not found — nothing to clean';
    insert into strategy_demo_backup (tbl, row_data) values ('marker', '{}'::jsonb);
    return;
  end if;

  create temp table demo_tasks on commit drop as
  select id from strategy_tasks
  where space_id = sp and title in (
    'IELTS markaz akkreditatsiya hujjatlari',
    'British Council bilan uchrashuv',
    'Mock test xonasini jihozlash',
    'Dars rejalari standarti (template)',
    'Pekin School: HSK 3 guruhini ochish',
    'LMS: davomat moduli',
    'Coin & XP tizimini integratsiya qilish',
    'Mobil ilova — beta versiya',
    'Kuzgi qabul kampaniyasi',
    'Instagram Reels kontent-reja (Q4)',
    'Ota-onalar kuni tadbiri',
    'Yangi filial joyini tanlash',
    'Filial ta''mirlash smetasi',
    'Q4 budjet rejasi',
    'Cashback tizimi hisob-kitobi',
    'O''qituvchilar KPI tizimini yangilash',
    '2 ta IELTS o''qituvchi yollash');

  -- Backups.
  insert into strategy_demo_backup (tbl, row_id, row_data)
  select 'strategy_tasks', t.id, to_jsonb(t) from strategy_tasks t where t.id in (select id from demo_tasks);
  insert into strategy_demo_backup (tbl, row_id, row_data)
  select 'tasks', t.id, to_jsonb(t) from tasks t
  where t.strategy_task_id in (select id from demo_tasks) and t.status <> 'done';
  insert into strategy_demo_backup (tbl, row_id, row_data)
  select 'strategy_milestones', m.id, to_jsonb(m) from strategy_milestones m
  where m.space_id = sp and (m.title, m.date) in (('IELTS markaz ochilishi', date '2026-11-15'), ('Filial ochilishi', date '2026-11-28'));
  insert into strategy_demo_backup (tbl, row_id, row_data)
  select 'strategy_spaces', s.id, jsonb_build_object('id', s.id, 'budget', s.budget, 'mind', s.mind) from strategy_spaces s where s.id = sp;

  -- Open mirrors on the Tasks board go with their strategy task.
  delete from tasks where strategy_task_id in (select id from demo_tasks) and status <> 'done';
  get diagnostics n = row_count; raise notice 'open task mirrors removed: %', n;
  delete from strategy_tasks where id in (select id from demo_tasks);
  get diagnostics n = row_count; raise notice 'demo strategy tasks removed: %', n;
  delete from strategy_milestones
  where space_id = sp and (title, date) in (('IELTS markaz ochilishi', date '2026-11-15'), ('Filial ochilishi', date '2026-11-28'));
  get diagnostics n = row_count; raise notice 'demo milestones removed: %', n;
  update strategy_spaces set budget = '[]'::jsonb, mind = jsonb_build_object('t', name, 'ch', '[]'::jsonb) where id = sp;
  raise notice 'demo budget and mind map cleared';
end $$;

commit;
