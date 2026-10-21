-- Maqsadlar statistikasi (2026-10-22): qachon bajarilgani kerak — kunlik
-- jadval va "kechikib bajarildi" shundan hisoblanadi. Eski bajarilganlar
-- yaratilgan vaqti bilan to'ldiriladi (aniqroq ma'lumot yo'q).
begin;

alter table goals add column if not exists done_at timestamptz;
update goals set done_at = created_at where done and done_at is null;
create index if not exists goals_user_open_idx on goals (user_id) where not done;

commit;
