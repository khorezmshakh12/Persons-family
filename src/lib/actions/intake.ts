'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { authErrorCode, requireCap, requireSection } from '@/lib/auth/require-admin';
import { logSystemAction } from '@/lib/audit-log';
import { askTypeSafe, typesafeEnabled } from '@/lib/typesafe';
import { loadIntake, type Intake, type IntakeRange } from '@/lib/intake-data';
import { SOURCES, STAGES, type Source } from '@/lib/intake';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function requireIntakeEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('core.sales.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

function done() {
  revalidatePath('/[locale]/sales', 'page');
  revalidatePath('/[locale]/operations', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

export async function getIntakeAction(range: string, from?: string, to?: string): Promise<Result<{ intake: Intake }>> {
  try {
    await requireSection('sales');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const r = z.enum(['week', 'month', 'quarter', 'custom']).safeParse(range);
  if (!r.success || (from && !dayKey.safeParse(from).success) || (to && !dayKey.safeParse(to).success)) return { error: 'invalidInput' };
  try {
    return { intake: await loadIntake(r.data as IntakeRange, from, to) };
  } catch (error) {
    console.error('getIntakeAction failed', error instanceof Error ? error.message : error);
    return { error: 'loadFailed' };
  }
}

const logSchema = z.object({
  source: z.enum(SOURCES),
  course: z.string().trim().max(120).default(''),
  stage: z.enum(STAGES).default('new'),
  campaign: z.string().trim().max(80).default(''),
  name: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  lostReason: z.string().trim().max(120).default(''),
  count: z.number().int().min(1).max(50).default(1),
});

/** Fast logging: one arrival (or a batch of `count` identical ones, e.g.
 * a walk-in day tally). Statistics only — the name is optional. */
export async function logLeadAction(input: z.input<typeof logSchema>): Promise<Result<{ ids: string[] }>> {
  const g = await requireIntakeEditor();
  if ('error' in g) return g;
  const p = logSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const rows = Array.from({ length: v.count }, () => ({
      name: v.name || '—',
      phone: v.phone,
      source: v.source,
      course: v.course,
      stage: v.stage,
      note: '',
      owner_id: g.id,
      campaign: v.campaign || null,
      lost_reason: v.stage === 'lost' ? v.lostReason || null : null,
      trial_at: v.stage === 'trial' || v.stage === 'enrolled' ? new Date().toISOString() : null,
      enrolled_at: v.stage === 'enrolled' ? new Date().toISOString() : null,
    }));
    const out = await sql<{ id: string }[]>`insert into ops_leads ${sql(rows)} returning id`;
    done();
    return { ids: out.map((r) => r.id) };
  } catch {
    return { error: 'updateFailed' };
  }
}

const stageSchema = z.object({ id: z.string().uuid(), stage: z.enum(STAGES), lostReason: z.string().trim().max(120).default('') });

export async function setLeadStageAction(input: z.input<typeof stageSchema>): Promise<Result> {
  const g = await requireIntakeEditor();
  if ('error' in g) return g;
  const p = stageSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const res = await sql`
      update ops_leads set stage = ${v.stage}, updated_at = now(),
        trial_at = case when ${v.stage} in ('trial', 'enrolled') then coalesce(trial_at, now()) else trial_at end,
        enrolled_at = case when ${v.stage} = 'enrolled' then coalesce(enrolled_at, now()) else null end,
        lost_reason = case when ${v.stage} = 'lost' then ${v.lostReason || null} else null end
      where id = ${v.id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  done();
  return {};
}

export async function deleteIntakeLeadsAction(ids: string[]): Promise<Result> {
  const g = await requireIntakeEditor();
  if ('error' in g) return g;
  const p = z.array(z.string().uuid()).min(1).max(50).safeParse(ids);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`delete from ops_leads where id = any(${sql.array(p.data)}::uuid[])`;
  } catch {
    return { error: 'updateFailed' };
  }
  done();
  return {};
}

const spendSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), source: z.enum(SOURCES), amount: z.number().finite().min(0).max(1e12) });

/** Monthly advertising spend per channel (drives CPL / CAC). */
export async function setLeadSpendAction(input: z.input<typeof spendSchema>): Promise<Result> {
  const g = await requireIntakeEditor();
  if ('error' in g) return g;
  const p = spendSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into lead_spend (month, source, amount, updated_by) values (${`${p.data.month}-01`}, ${p.data.source}, ${p.data.amount}, ${g.id})
      on conflict (month, source) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('intake.spend', `${p.data.month} ${p.data.source}: ${p.data.amount}`);
  done();
  return {};
}

export type SourceVerdict = { source: Source; verdict: 'rising' | 'stable' | 'falling'; confidence: number };

/** Jev reads each channel's 8-week arrivals and says where it is heading. */
export async function judgeSourcesWithJevAction(): Promise<Result<{ verdicts: SourceVerdict[] }>> {
  try {
    await requireSection('sales');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!typesafeEnabled()) return { error: 'aiDisabled' };
  const intake = await loadIntake('month');
  const list = intake.sources.filter((s) => s.trend.some(Boolean)).slice(0, 8);
  if (!list.length) return { verdicts: [] };
  const questions = Object.fromEntries(
    list.map((_, i) => [
      `s${i}`,
      {
        type: 'choice' as const,
        instructions: `Channel #${i}: judge the direction of its weekly new-arrival counts (oldest → newest), ignoring single-week noise.`,
        criteria: {
          rising: 'A sustained increase over the recent weeks.',
          stable: 'Roughly flat, or noisy without a clear direction.',
          falling: 'A sustained decrease over the recent weeks.',
        },
      },
    ]),
  );
  const res = await askTypeSafe({ channels: list.map((s, i) => ({ index: i, weekly_arrivals: s.trend })) }, questions, 'intake');
  if (!res) return { error: 'aiFailed' };
  const verdicts: SourceVerdict[] = [];
  list.forEach((s, i) => {
    const a = res.answers[`s${i}`];
    if (a?.type === 'choice' && ['rising', 'stable', 'falling'].includes(a.choice))
      verdicts.push({ source: s.source, verdict: a.choice as SourceVerdict['verdict'], confidence: a.confidence });
  });
  return { verdicts };
}
