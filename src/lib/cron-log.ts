import 'server-only';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db/client';

/** Wraps a cron handler so every authorised run lands in cron_runs (shown
 * in Platforma › Tizim holati). Rejected (401) calls are not logged, so a
 * stranger hitting the URL can't fill the table. Logging never fails a run. */
export function withCronLog(job: string, handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const started = new Date().toISOString();
    let res: Response;
    try {
      res = await handler(req);
    } catch (error) {
      await sql`insert into cron_runs (job, started_at, finished_at, ok, detail)
        values (${job}, ${started}, now(), false, ${String(error instanceof Error ? error.message : error).slice(0, 500)})`.catch(() => {});
      throw error;
    }
    if (res.status !== 401) {
      const detail = await res.clone().text().catch(() => '');
      await sql`insert into cron_runs (job, started_at, finished_at, ok, detail)
        values (${job}, ${started}, now(), ${res.status < 400}, ${detail.slice(0, 500)})`.catch(() => {});
    }
    return res;
  };
}
