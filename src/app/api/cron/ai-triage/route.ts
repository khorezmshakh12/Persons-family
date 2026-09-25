import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { scoreLead, triageIssue } from '@/lib/ai-triage';
import { JEV_USD_PER_MTOK, typesafeEnabled } from '@/lib/typesafe';

// Hourly (Cloud Scheduler, same CRON_SECRET bearer auth as the other crons):
// runs TypeSafe triage for open issues and leads that have none yet, then
// reports token usage and cost from ai_usage. Bounded per run.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!typesafeEnabled()) return NextResponse.json({ error: 'TYPESAFE_API_KEY not set' }, { status: 503 });

  const [issues, leads] = await Promise.all([
    sql<{ id: string }[]>`
      select i.id from issues i left join issue_ai a on a.issue_id = i.id
      where i.status <> 'done' and a.issue_id is null
      order by i.created_at desc limit 60`,
    sql<{ id: string }[]>`
      select id from ops_leads where ai_checked_at is null or ai_checked_at < updated_at
      order by updated_at desc limit 60`,
  ]);

  // Small parallel batches: fast, and far below Jev's rate limits.
  const run = async (ids: string[], fn: (id: string) => Promise<boolean>) => {
    let ok = 0;
    for (let i = 0; i < ids.length; i += 6) {
      const res = await Promise.all(ids.slice(i, i + 6).map(fn));
      ok += res.filter(Boolean).length;
    }
    return ok;
  };
  const issuesDone = await run(issues.map((r) => r.id), triageIssue);
  const leadsDone = await run(leads.map((r) => r.id), scoreLead);

  const [u] = await sql<{ requests: number; input_tokens: number; output_tokens: number; today_tokens: number }[]>`
    select count(*)::int as requests, coalesce(sum(input_tokens), 0)::int as input_tokens,
           coalesce(sum(output_tokens), 0)::int as output_tokens,
           coalesce(sum(input_tokens) filter (where created_at >= now() - interval '24 hours'), 0)::int as today_tokens
    from ai_usage`;

  return NextResponse.json({
    issues: { pending: issues.length, done: issuesDone },
    leads: { pending: leads.length, done: leadsDone },
    usage: {
      requests: u.requests,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      last_24h_input_tokens: u.today_tokens,
      cost_usd: +((u.input_tokens / 1e6) * JEV_USD_PER_MTOK).toFixed(6),
    },
  });
}
