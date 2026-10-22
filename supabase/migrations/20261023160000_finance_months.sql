-- Moliya: har summa o'z oyida (owner, 2026-10-22 audit).
--
--   * performance_entries.period — rag'bat/jarima qaysi oyning oyligiga
--     tegishli. Shu paytgacha created_at oyi bo'yicha joylanardi, shuning
--     uchun 2-noyabrda oktyabr uchun kiritilgan jarima noyabrga tushardi.
--     Eskilari created_at (Toshkent) oyi bilan to'ldiriladi; yangisi forma
--     tanlagan oy, berilmasa — joriy oy (trigger).
--   * finance_entries.group_id — bo'lib ushlanadigan avansning barcha qatorlari
--     (to'lov + o'tkazish + har oy ulushi) bitta guruh: biri o'chirilsa hammasi
--     o'chadi, yarim avans qolib ketmaydi.
--   * finance_entries.period bo'sh eski qatorlar created_at oyi bilan to'ldiriladi
--     (pay run faqat period bo'yicha o'qiydi — bo'sh period hech qayerda
--     hisoblanmasligi yoki boshqa joyda boshqacha hisoblanishi kerak emas).
begin;

alter table performance_entries add column if not exists period date;
update performance_entries
  set period = date_trunc('month', created_at at time zone 'Asia/Tashkent')::date
  where period is null;
create index if not exists performance_entries_staff_period_idx on performance_entries (staff_id, period);

create or replace function performance_entries_period_default() returns trigger
language plpgsql as $$
begin
  if new.period is null then
    new.period := date_trunc('month', coalesce(new.created_at, now()) at time zone 'Asia/Tashkent')::date;
  else
    new.period := date_trunc('month', new.period)::date;
  end if;
  return new;
end $$;

drop trigger if exists trg_performance_entries_period on performance_entries;
create trigger trg_performance_entries_period
  before insert or update on performance_entries
  for each row execute function performance_entries_period_default();

alter table finance_entries add column if not exists group_id uuid;
create index if not exists finance_entries_group_idx on finance_entries (group_id) where group_id is not null;

-- Existing split advances: rows written by one insert share staff and instant.
update finance_entries fe set group_id = g.gid
from (
  select id, first_value(id) over (partition by staff_id, created_at order by kind = 'advance' desc, id) as gid,
    count(*) over (partition by staff_id, created_at) as n
  from finance_entries where source = 'advance'
) g
where fe.id = g.id and g.n > 1 and fe.group_id is null;

update finance_entries
  set period = date_trunc('month', created_at at time zone 'Asia/Tashkent')::date
  where period is null and created_at is not null;

commit;
