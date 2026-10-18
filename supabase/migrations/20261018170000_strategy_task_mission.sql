-- Perforce/Strategy: har bir vazifaning o'z missiyasi/maqsadi (2026-10-18).
-- "Har bir qilingan ishning o'zini missiyasi bo'lishi kerak" (21-band).
begin;

alter table strategy_tasks add column if not exists mission text;

commit;
