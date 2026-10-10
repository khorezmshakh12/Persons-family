-- Staff console: when each account was last active (login + throttled page
-- loads), and a time column on system_logs so the console can show an
-- account audit trail (create / role / password / freeze / Telegram).
begin;

alter table profiles add column if not exists last_seen_at timestamptz;

alter table system_logs add column if not exists created_at timestamptz not null default now();
create index if not exists system_logs_action_created_idx on system_logs (action_type, created_at desc);

commit;
