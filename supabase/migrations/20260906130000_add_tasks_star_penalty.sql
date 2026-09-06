begin;
alter table tasks add column if not exists star_penalty integer not null default 0;
alter table tasks add column if not exists star_penalty_applied_at timestamptz;
commit;
