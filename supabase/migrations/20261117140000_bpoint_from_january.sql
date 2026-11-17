-- B-nuqta muddatlari yil boshidan (yanvardan) hisoblanadi (owner,
-- 2026-11-17): 1 yil va 3 yil — shu yilning yanvari; yarim yil — yanvar
-- yoki iyul. Shu kungacha qo'yilgan maqsadlarni shu qoidaga tekislaydi
-- (src/lib/bpoint.ts windowStart bilan bir xil).
begin;

update staff_bpoint_goals
set start_period = case
  when horizon = '6m' and extract(month from start_period) >= 7 then make_date(extract(year from start_period)::int, 7, 1)
  else make_date(extract(year from start_period)::int, 1, 1)
end
where start_period <> case
  when horizon = '6m' and extract(month from start_period) >= 7 then make_date(extract(year from start_period)::int, 7, 1)
  else make_date(extract(year from start_period)::int, 1, 1)
end;

commit;
