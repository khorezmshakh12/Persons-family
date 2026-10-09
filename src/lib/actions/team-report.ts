'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { authErrorCode, requireSection } from '@/lib/auth/require-admin';
import { askTypeSafe, typesafeEnabled } from '@/lib/typesafe';
import { loadTeamReport, type TeamReport } from '@/lib/team-report-data';
import { METRICS, RANGES, parseConfig, type ReportConfig } from '@/lib/team-report';
import { can, type Department } from '@/lib/permissions';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const DEPTS = ['top', 'acad', 'com', 'ops', 'fin', 'hr'] as const;
const rangeSchema = z.enum(RANGES);
const deptSchema = z.enum(DEPTS).nullable();

async function requireReportViewer(): Promise<{ id: string; kpiDetail: boolean } | { error: string }> {
  try {
    const { profile } = await requireSection('report');
    return { id: profile.id, kpiDetail: can(profile.role, 'kpi.review') };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

export async function getTeamReportAction(range: string, dept: string | null): Promise<Result<{ report: TeamReport }>> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  const r = rangeSchema.safeParse(range);
  const d = deptSchema.safeParse(dept);
  if (!r.success || !d.success) return { error: 'invalidInput' };
  try {
    return { report: await loadTeamReport(r.data, d.data as Department | null, g.kpiDetail) };
  } catch (error) {
    console.error('getTeamReportAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}

export type RankedInsight = { id: string; priority: 'high' | 'medium' | 'low'; confidence: number };

/** Jev reads the findings next to the numbers and says which ones the CEO
 * should act on first. It ranks — it never writes the text. */
export async function rankInsightsWithJevAction(range: string, dept: string | null): Promise<Result<{ ranked: RankedInsight[] }>> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  const r = rangeSchema.safeParse(range);
  const d = deptSchema.safeParse(dept);
  if (!r.success || !d.success) return { error: 'invalidInput' };
  if (!typesafeEnabled()) return { error: 'aiDisabled' };
  const rep = await loadTeamReport(r.data, d.data as Department | null, g.kpiDetail);
  const list = rep.insights.slice(0, 10);
  if (!list.length) return { ranked: [] };
  const questions = Object.fromEntries(
    list.map((x, i) => [
      `i${i}`,
      {
        type: 'choice' as const,
        instructions: `Finding #${i} comes from a small education company's weekly staff report. How urgently should the CEO act on it this week, given the trends and the other findings?`,
        criteria: {
          high: 'Needs action this week: a clear risk to delivery, a sharp drop, or people stuck.',
          medium: 'Worth a look soon; a mild trend or a single person.',
          low: 'Informational or good news; no action needed.',
        },
      },
    ]),
  );
  const state = {
    period: rep.buckets[rep.buckets.length - 1].label,
    findings: list.map((x, i) => ({ index: i, tone: x.tone, text: x.text })),
    trend: Object.fromEntries(Object.entries(rep.series).map(([k, v]) => [k, v.slice(-4)])),
  };
  const res = await askTypeSafe(state, questions, 'team-report');
  if (!res) return { error: 'aiFailed' };
  const ranked: RankedInsight[] = [];
  list.forEach((x, i) => {
    const a = res.answers[`i${i}`];
    if (a?.type === 'choice' && ['high', 'medium', 'low'].includes(a.choice))
      ranked.push({ id: x.id, priority: a.choice as RankedInsight['priority'], confidence: a.confidence });
  });
  return { ranked };
}

const noteSchema = z.object({
  metric: z.enum(METRICS),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: z.string().trim().min(2).max(500),
});

/** Pin a note to a point on a chart ("bayram haftasi edi"). */
export async function addReportNoteAction(input: z.input<typeof noteSchema>): Promise<Result<{ id: string }>> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  const p = noteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into report_notes (metric, week, body, author_id) values (${p.data.metric}, ${p.data.week}, ${p.data.body}, ${g.id}) returning id`;
    revalidatePath('/[locale]/report', 'page');
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteReportNoteAction(id: string): Promise<Result> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from report_notes where id = ${id} and author_id = ${g.id}`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/report', 'page');
  return {};
}

export type SavedReport = { id: string; name: string; config: ReportConfig; shared: boolean; mine: boolean };

const saveSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80), config: z.unknown(), shared: z.boolean() });

export async function saveReportAction(input: z.input<typeof saveSchema>): Promise<Result<{ id: string }>> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  const p = saveSchema.safeParse(input);
  const config = p.success ? parseConfig(p.data.config) : null;
  if (!p.success || !config) return { error: 'invalidInput' };
  try {
    const [row] = p.data.id
      ? await sql<{ id: string }[]>`
          update saved_reports set name = ${p.data.name}, config = ${sql.json(config)}, shared = ${p.data.shared}, updated_at = now()
          where id = ${p.data.id} and owner_id = ${g.id} returning id`
      : await sql<{ id: string }[]>`
          insert into saved_reports (owner_id, name, config, shared) values (${g.id}, ${p.data.name}, ${sql.json(config)}, ${p.data.shared}) returning id`;
    if (!row) return { error: 'forbidden' };
    revalidatePath('/[locale]/report', 'page');
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteSavedReportAction(id: string): Promise<Result> {
  const g = await requireReportViewer();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from saved_reports where id = ${id} and owner_id = ${g.id}`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/report', 'page');
  return {};
}
