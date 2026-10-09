'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { canSeeFor } from '@/lib/permissions';
import { logSystemAction } from '@/lib/audit-log';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { formatUZS } from '@/lib/format-currency';
import { startOfTashkentMonthKey } from '@/lib/time';
import { askTypeSafe, typesafeEnabled } from '@/lib/typesafe';
import { loadPayLines } from '@/lib/pay-run-data';
import { blockers, canMove, isRelevant, monthLabel, PAY_RUN_STATUSES, type PayRunStatus } from '@/lib/pay-run';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const period = z.string().regex(/^\d{4}-\d{2}-01$/);
const isLocked = (e: unknown) => e instanceof Error && /period_locked/.test(e.message);

function done(): Result {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/finance/[staffId]', 'page');
  return {};
}

async function requireFinanceManager(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('finance.manage');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

async function notifyStaff(staffId: string, text: string) {
  const [p] = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where id = ${staffId}`;
  if (p?.telegram_id) await sendTelegramMessage(p.telegram_id, text);
}

const moveSchema = z.object({
  period,
  to: z.enum(PAY_RUN_STATUSES),
  reason: z.string().trim().max(1000).optional().default(''),
});

/**
 * Move the month's pay run one step: draft ⇄ review ⇄ approved ⇄ paid.
 * Forward into `approved` freezes a snapshot and locks the month (the DB
 * trigger refuses ledger writes); forward into `paid` records a salary
 * payment for whatever is still owed. Any step back needs a reason and is
 * the undo: paid → approved removes exactly the payments the run wrote.
 */
export async function movePayRunAction(input: z.input<typeof moveSchema>): Promise<Result<{ status: PayRunStatus; paidCount?: number }>> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = moveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { to, reason } = p.data;
  const per = p.data.period;

  const lines = (await loadPayLines(per)).filter(isRelevant);
  if (to === 'approved' && blockers(lines).length) return { error: 'blocked' };

  let paidLines: { staffId: string; amount: number }[] = [];
  try {
    const out = await sql.begin(async (tx) => {
      await tx`insert into pay_runs (period) values (${per}) on conflict (period) do nothing`;
      const [run] = await tx<{ status: PayRunStatus }[]>`select status from pay_runs where period = ${per} for update`;
      if (!canMove(run.status, to)) return 'invalidTransition' as const;
      const back = PAY_RUN_STATUSES.indexOf(to) < PAY_RUN_STATUSES.indexOf(run.status);
      if (back && reason.length < 3) return 'reasonRequired' as const;

      if (to === 'approved' && !back) {
        const snapshot = lines.map((l) => ({ staffId: l.staffId, payable: l.payable }));
        await tx`
          update pay_runs set status = 'approved', snapshot = ${tx.json(snapshot)}, approved_by = ${g.id}, approved_at = now(), updated_at = now()
          where period = ${per}`;
      } else if (to === 'paid') {
        paidLines = lines.filter((l) => l.remaining > 0).map((l) => ({ staffId: l.staffId, amount: l.remaining }));
        if (paidLines.length)
          await tx`
            insert into finance_entries ${tx(
              paidLines.map((l) => ({
                staff_id: l.staffId,
                title: `Oylik · ${monthLabel(per)}`,
                amount: l.amount,
                created_by: g.id,
                kind: 'salary',
                period: per,
                source: 'payrun',
              })),
            )}`;
        await tx`update pay_runs set status = 'paid', paid_by = ${g.id}, paid_at = now(), updated_at = now() where period = ${per}`;
      } else if (run.status === 'paid' && to === 'approved') {
        // Unlock for the delete, then lock again — all inside this tx.
        await tx`update pay_runs set status = 'review' where period = ${per}`;
        await tx`delete from finance_entries where period = ${per} and source = 'payrun'`;
        await tx`update pay_runs set status = 'approved', paid_by = null, paid_at = null, updated_at = now() where period = ${per}`;
      } else {
        await tx`
          update pay_runs set status = ${to}, updated_at = now(),
            approved_by = case when ${to} in ('draft', 'review') then null else approved_by end,
            approved_at = case when ${to} in ('draft', 'review') then null else approved_at end
          where period = ${per}`;
      }
      await tx`
        insert into pay_run_log (period, actor, action, detail)
        values (${per}, ${g.id}, ${`${run.status}→${to}`}, ${tx.json({ reason: reason || null, paid: paidLines.length || undefined })})`;
      return null;
    });
    if (out) return { error: out };
  } catch (error) {
    console.error('movePayRunAction failed', error instanceof Error ? error.message : error);
    return { error: isLocked(error) ? 'periodLocked' : 'updateFailed' };
  }

  logSystemAction('payroll.move', `Pay run ${per} → ${to}${reason ? ` (${reason})` : ''}`);
  if (to === 'paid' && paidLines.length)
    after(async () => {
      for (const l of paidLines) {
        await notifyStaff(
          l.staffId,
          `💰 <b>${escapeTelegramText(monthLabel(per))} oyligi to‘landi</b>\n<b>Summa:</b> ${escapeTelegramText(formatUZS(l.amount))} so‘m\nTafsilotlar: Moliya bo‘limida.`,
        ).catch(() => {});
      }
    });
  done();
  return { status: to, paidCount: paidLines.length };
}

const correctionSchema = z.object({
  period,
  staffId: z.string().uuid(),
  amount: z.number().finite().refine((n) => n !== 0).refine((n) => Math.abs(n) <= 1e11),
  title: z.string().trim().min(2).max(200),
  reason: z.string().trim().min(3).max(1000),
});

/** A correction to a locked month: a new signed ledger row with a reason —
 * never an edit of what was approved. */
export async function addPayCorrectionAction(input: z.input<typeof correctionSchema>): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = correctionSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into finance_entries (staff_id, title, amount, note, created_by, kind, period, source)
        values (${v.staffId}, ${v.title}, ${v.amount}, ${v.reason}, ${g.id}, ${v.amount < 0 ? 'penalty' : 'adjustment'}, ${v.period}, 'correction')`;
      await tx`
        insert into pay_run_log (period, actor, action, detail)
        values (${v.period}, ${g.id}, 'correction', ${tx.json({ staffId: v.staffId, amount: v.amount, title: v.title, reason: v.reason })})`;
    });
  } catch (error) {
    console.error('addPayCorrectionAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }
  logSystemAction('payroll.correction', `Correction ${v.period} ${v.staffId}: ${v.amount} (${v.reason})`);
  return done();
}

const noteSchema = z.object({ period, note: z.string().trim().max(2000) });

export async function savePayRunNoteAction(input: z.input<typeof noteSchema>): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = noteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into pay_runs (period, note) values (${p.data.period}, ${p.data.note || null})
      on conflict (period) do update set note = excluded.note, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------ advances */

const requestSchema = z.object({
  amount: z.number().finite().positive().max(1e11),
  reason: z.string().trim().min(3).max(500),
});

/** Staff: ask for an advance on this month's pay. Capped at the month's
 * salary; one open request at a time. */
export async function requestAdvanceAction(input: z.input<typeof requestSchema>): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!canSeeFor(profile, 'finance')) return { error: 'forbidden' };
  const p = requestSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const per = startOfTashkentMonthKey();
  try {
    const out = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${'advance:' + user.id}))`;
      const [open] = await tx`select 1 from advance_requests where staff_id = ${user.id} and status = 'pending'`;
      if (open) return 'alreadyPending' as const;
      const [sal] = await tx<{ gross: number }[]>`select gross_amount as gross from salary_months where staff_id = ${user.id} and period = ${per}`;
      if (sal && sal.gross > 0 && p.data.amount > sal.gross) return 'overLimit' as const;
      await tx`
        insert into advance_requests (staff_id, amount, reason, period)
        values (${user.id}, ${p.data.amount}, ${p.data.reason}, ${per})`;
      return null;
    });
    if (out) return { error: out };
  } catch {
    return { error: 'updateFailed' };
  }
  after(async () => {
    const ceos = await sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where role = 'ceo' and is_active and telegram_id is not null`;
    const who = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    for (const c of ceos)
      if (c.telegram_id)
        await sendTelegramMessage(
          c.telegram_id,
          `📝 <b>Avans so‘rovi</b>\n${escapeTelegramText(who)}: ${escapeTelegramText(formatUZS(p.data.amount))} so‘m\n<b>Sabab:</b> ${escapeTelegramText(p.data.reason)}`,
        ).catch(() => {});
  });
  return done();
}

/** Staff: take a pending request back. */
export async function cancelAdvanceAction(id: string): Promise<Result> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update advance_requests set status = 'cancelled', decided_at = now()
      where id = ${id} and staff_id = ${user.id} and status = 'pending'`;
    if (res.count === 0) return { error: 'alreadyDecided' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const decideSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().default(''),
});

/** CEO: approve (pays it as an advance this month) or reject (reason). */
export async function decideAdvanceAction(input: z.input<typeof decideSchema>): Promise<Result> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  const p = decideSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  if (!v.approve && v.note.length < 3) return { error: 'reasonRequired' };
  const per = startOfTashkentMonthKey();
  let req: { staff_id: string; amount: number } | null = null;
  try {
    const out = await sql.begin(async (tx) => {
      const [r] = await tx<{ staff_id: string; amount: number }[]>`
        select staff_id, amount from advance_requests where id = ${v.id} and status = 'pending' for update`;
      if (!r) return 'alreadyDecided' as const;
      req = r;
      let entryId: string | null = null;
      if (v.approve) {
        const [e] = await tx<{ id: string }[]>`
          insert into finance_entries (staff_id, title, amount, note, created_by, kind, period, source)
          values (${r.staff_id}, ${`Avans · ${monthLabel(per)}`}, ${r.amount}, ${v.note || null}, ${g.id}, 'advance', ${per}, 'advance')
          returning id`;
        entryId = e.id;
      }
      await tx`
        update advance_requests set status = ${v.approve ? 'approved' : 'rejected'}, decided_by = ${g.id}, decided_at = now(),
          decision_note = ${v.note || null}, finance_entry_id = ${entryId}, period = ${per}
        where id = ${v.id}`;
      return null;
    });
    if (out) return { error: out };
  } catch (error) {
    return { error: isLocked(error) ? 'periodLocked' : 'updateFailed' };
  }
  const r = req as { staff_id: string; amount: number } | null;
  if (r)
    after(() =>
      notifyStaff(
        r.staff_id,
        v.approve
          ? `✅ <b>Avans tasdiqlandi</b>: ${escapeTelegramText(formatUZS(r.amount))} so‘m. Oylikdan ushlab qolinadi.`
          : `❌ <b>Avans rad etildi</b>\n<b>Sabab:</b> ${escapeTelegramText(v.note)}`,
      ).catch(() => {}),
    );
  logSystemAction('payroll.advance', `Advance ${v.id} ${v.approve ? 'approved' : 'rejected'}`);
  return done();
}

/* ------------------------------------------------------------ Jev review */

export type JevPayVerdict = { staffId: string; verdict: 'ok' | 'check'; confidence: number };

/** Jev reads each line against the person's last month and its parts, and
 * marks the ones a human should look at. Advisory only. */
export async function reviewPayRunWithJevAction(per: string): Promise<Result<{ verdicts: JevPayVerdict[] }>> {
  const g = await requireFinanceManager();
  if ('error' in g) return g;
  if (!period.safeParse(per).success) return { error: 'invalidInput' };
  if (!typesafeEnabled()) return { error: 'aiDisabled' };
  const lines = (await loadPayLines(per)).filter(isRelevant).slice(0, 60);
  if (!lines.length) return { verdicts: [] };
  const questions = Object.fromEntries(
    lines.map((_, i) => [
      `l${i}`,
      {
        type: 'choice' as const,
        instructions: `Look at pay line #${i}. Is this month's payable amount plausible for this person, given their base salary, last month's payable and the listed bonuses and deductions? Flag unusual spikes, drops, duplicated-looking bonuses, or deductions bigger than the salary.`,
        criteria: {
          ok: 'Consistent with the base salary and last month; components look normal.',
          check: 'Something looks off: a big unexplained change, a suspicious or duplicated component, or a deduction out of proportion.',
        },
      },
    ]),
  );
  const state = {
    month: per,
    currency: 'UZS',
    lines: lines.map((l, i) => ({
      index: i,
      role: l.role,
      base: l.base,
      last_month_payable: l.prevPayable,
      payable: l.payable,
      components: l.components.filter((c) => c.kind !== 'base').map((c) => ({ kind: c.kind, title: c.title, amount: c.amount })),
    })),
  };
  const res = await askTypeSafe(state, questions, 'payroll');
  if (!res) return { error: 'aiFailed' };
  const verdicts: JevPayVerdict[] = [];
  lines.forEach((l, i) => {
    const a = res.answers[`l${i}`];
    if (a?.type === 'choice' && (a.choice === 'ok' || a.choice === 'check'))
      verdicts.push({ staffId: l.staffId, verdict: a.choice, confidence: a.confidence });
  });
  return { verdicts };
}
