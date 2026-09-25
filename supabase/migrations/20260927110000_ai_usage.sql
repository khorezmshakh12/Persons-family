-- TypeSafe (Jev) usage ledger: one row per API call, for the token/cost report
-- (/api/cron/ai-triage). Additive, safe to re-run.
begin;

create table if not exists ai_usage (
  id             bigserial primary key,
  feature        text not null default 'other',
  model          text not null default '',
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_created_idx on ai_usage (created_at);

commit;
