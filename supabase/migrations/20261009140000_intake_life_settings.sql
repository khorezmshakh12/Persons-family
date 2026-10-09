-- ==========================================================================
-- Sections v6: one intake store, team life (events + richer news) and
-- settings (notification preferences, cron run log, calendar feed tokens).
--
-- 1. Intake: Core's leads (core_state.data->'leads', JSON) are copied into
--    ops_leads so there is ONE place leads live. Idempotent via core_id.
--    Core stages map new→new, qual→contacted, trial→trial, won→enrolled,
--    lost→lost; channels ig/meta/tg/gg/ref/off → sources. Monthly channel
--    spend moves to lead_spend. Targets stay in core_state.tgt (Platform
--    writes them there).
-- 2. Team life: events + attendees; news gets category / pin / must-ack /
--    schedule / soft delete; acknowledgements and reactions.
-- 3. Settings: notification_prefs, cron_runs, calendar_tokens.
--
-- Self-contained, additive, safe to re-run.
-- ==========================================================================

begin;

-- 1. Intake -----------------------------------------------------------------
alter table ops_leads drop constraint if exists ops_leads_source_check;
alter table ops_leads add constraint ops_leads_source_check
  check (source in ('instagram', 'meta', 'telegram', 'google', 'referral', 'walkin', 'website', 'other'));
alter table ops_leads add column if not exists campaign    text;
alter table ops_leads add column if not exists lost_reason text;
alter table ops_leads add column if not exists trial_at    timestamptz;
alter table ops_leads add column if not exists core_id     text;
create unique index if not exists ops_leads_core_id_key on ops_leads (core_id) where core_id is not null;
create index if not exists idx_ops_leads_created on ops_leads (created_at);

insert into ops_leads (name, phone, source, course, stage, note, created_at, updated_at, enrolled_at, trial_at, campaign, lost_reason, core_id)
select
  left(coalesce(nullif(trim(l->>'n'), ''), '—'), 120),
  left(coalesce(l->>'ph', ''), 40),
  case l->>'ch' when 'ig' then 'instagram' when 'meta' then 'meta' when 'tg' then 'telegram' when 'gg' then 'google'
    when 'ref' then 'referral' when 'off' then 'walkin' else 'other' end,
  left(coalesce(l->>'p', ''), 120),
  case l->>'st' when 'qual' then 'contacted' when 'trial' then 'trial' when 'won' then 'enrolled' when 'lost' then 'lost' else 'new' end,
  '',
  to_timestamp((l->>'at')::numeric / 1000),
  now(),
  case when l->>'st' = 'won' then coalesce(
    (select to_timestamp(max((h->>'at')::numeric) / 1000) from jsonb_array_elements(coalesce(l->'hist', '[]'::jsonb)) h
      where h->>'st' = 'won' and (h->>'at') ~ '^[0-9]+$'),
    to_timestamp((l->>'at')::numeric / 1000)) end,
  (select to_timestamp(min((h->>'at')::numeric) / 1000) from jsonb_array_elements(coalesce(l->'hist', '[]'::jsonb)) h
    where h->>'st' = 'trial' and (h->>'at') ~ '^[0-9]+$'),
  nullif(l->>'camp', ''),
  nullif(l->>'lost', ''),
  'core:' || (l->>'id')
from core_state cs, jsonb_array_elements(case when jsonb_typeof(cs.data->'leads') = 'array' then cs.data->'leads' else '[]'::jsonb end) l
where cs.id = 1 and (l->>'at') ~ '^[0-9]+(\.[0-9]+)?$' and l ? 'id'
on conflict (core_id) where core_id is not null do nothing;

create table if not exists lead_spend (
  month      date not null,
  source     text not null,
  amount     numeric not null default 0 check (amount >= 0),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (month, source)
);

insert into lead_spend (month, source, amount)
select (m.key || '-01')::date,
  case c.key when 'ig' then 'instagram' when 'meta' then 'meta' when 'tg' then 'telegram' when 'gg' then 'google'
    when 'ref' then 'referral' when 'off' then 'walkin' else 'other' end,
  sum(case when c.value::text ~ '^[0-9]+(\.[0-9]+)?$' then c.value::text::numeric else 0 end)
from core_state cs,
  jsonb_each(case when jsonb_typeof(cs.data->'spend') = 'object' then cs.data->'spend' else '{}'::jsonb end) m,
  jsonb_each(case when jsonb_typeof(m.value) = 'object' then m.value else '{}'::jsonb end) c
where cs.id = 1 and m.key ~ '^[0-9]{4}-[0-9]{2}$'
group by 1, 2
on conflict (month, source) do nothing;

-- 2. Team life --------------------------------------------------------------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  location    text not null default '',
  kind        text not null default 'company' check (kind in ('company', 'meeting', 'training', 'holiday', 'other')),
  audience    text not null default 'all',
  repeat      text not null default 'none' check (repeat in ('none', 'weekly', 'monthly', 'yearly')),
  repeat_until date,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_events_starts on events (starts_at) where deleted_at is null;

create table if not exists event_attendees (
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  response   text not null check (response in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table company_news add column if not exists category    text not null default 'general';
alter table company_news add column if not exists pinned      boolean not null default false;
alter table company_news add column if not exists must_ack    boolean not null default false;
alter table company_news add column if not exists publish_at  timestamptz;
alter table company_news add column if not exists deleted_at  timestamptz;
alter table company_news add column if not exists image_url   text;
alter table company_news add column if not exists audience    text not null default 'all';
alter table company_news add column if not exists telegram_sent_at timestamptz;
alter table company_news add column if not exists notify      boolean not null default true;

create table if not exists company_news_acks (
  news_id  uuid not null references company_news(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (news_id, user_id)
);

create table if not exists company_news_reactions (
  news_id    uuid not null references company_news(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (news_id, user_id, emoji)
);

-- 3. Settings ---------------------------------------------------------------
create table if not exists notification_prefs (
  user_id    uuid primary key references profiles(id) on delete cascade,
  muted      text[] not null default '{}',
  quiet_from time,
  quiet_to   time,
  updated_at timestamptz not null default now()
);

create table if not exists cron_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      text
);
create index if not exists idx_cron_runs_job on cron_runs (job, started_at desc);

create table if not exists calendar_tokens (
  user_id    uuid primary key references profiles(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

commit;
