-- Tracks every date_key the lesson-plan-check cron has actually processed
-- (compliant or not — unlike lesson_plan_compliance_alerts, which only gets
-- a row when there's a gap to report). Lets the route catch up on any day
-- it silently missed (e.g. a deploy landing right at the cron's 00:00
-- Tashkent fire time can drop that invocation) on its very next run,
-- instead of that day's compliance simply never getting checked.
create table lesson_plan_cron_runs (
  date_key date primary key,
  ran_at timestamptz not null default now()
);

alter table lesson_plan_cron_runs enable row level security;
-- Service-role only (the cron route uses the admin client, which bypasses
-- RLS) — no policy needed for `authenticated`, nobody signed in should
-- ever query this directly.

-- Seed "yesterday" (Tashkent-relative, as of applying this migration) as
-- already handled, so the next run's catch-up range starts fresh from
-- today rather than replaying past days into the newly-added Telegram
-- group below.
insert into lesson_plan_cron_runs (date_key)
values (((now() at time zone 'Asia/Tashkent')::date - interval '1 day')::date)
on conflict do nothing;

-- Any group/supergroup chat the bot has seen a message from (see the new
-- generic message handler in telegram-bot-handlers.ts) — the lesson-plan
-- cron broadcasts to every chat_id here in addition to the CEO's own DM,
-- so the team's Telegram group gets the same daily report.
create table telegram_group_chats (
  chat_id bigint primary key,
  title text,
  added_at timestamptz not null default now()
);

alter table telegram_group_chats enable row level security;
-- Service-role only, same reasoning as lesson_plan_cron_runs above.
