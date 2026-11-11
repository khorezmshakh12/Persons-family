-- Owner, 2026-11-11: Administrative Manager va Office Manager checklist
-- bandlari aralashib ketgan — ikki rolning ro'yxatlari (kunlik/haftalik/oylik,
-- faol va nofaol) to'liq o'rin almashadi. Xodimlarning roli o'zgarmaydi.
-- Bitta UPDATE: har bir qator bir marta almashadi (CASE), sort tartibi saqlanadi.
begin;

update checklist_templates
set role = case role when 'admin_manager' then 'office_manager' else 'admin_manager' end
where role in ('admin_manager', 'office_manager');

commit;
