-- HR › Roadmap · Mind map (owner, 2026-11-20): qoralama va yuborilgan versiya.
-- roadmap / mind — xodimning qoralamasi («Saqlash»), faqat o'ziga ko'rinadi.
-- sent_roadmap / sent_mind — «CEO'ga yuborish» paytidagi nusxa; CEO va HR
-- faqat shuni ko'radi. Istalgancha qayta yuborish mumkin.
-- Hozirgi holat saqlanadi: topshirilgan roadmap'lar va (doim ko'rinib
-- turgan) mind map'lar yuborilgan deb ko'chiriladi.
begin;

alter table hr_growth
  add column if not exists sent_roadmap jsonb,
  add column if not exists sent_mind jsonb,
  add column if not exists sent_at timestamptz;

update hr_growth set sent_roadmap = roadmap, sent_at = submitted_at
  where submitted_at is not null and sent_roadmap is null;
update hr_growth set sent_mind = mind
  where sent_mind is null and jsonb_array_length(coalesce(mind->'ch', '[]'::jsonb)) > 0;

commit;
