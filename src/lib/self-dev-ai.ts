import 'server-only';
import { sql } from '@/lib/db/client';
import { askTypeSafe, type TsAnswer } from '@/lib/typesafe';
import { RUBRIC_KEYS, type Rubric } from '@/lib/self-dev-rubric';

/**
 * Jev reads one self-development report (and the month's goal) and suggests
 * the three rubric scores. Advisory only: the CEO sees it next to the form
 * and decides. Best-effort — no key, a timeout or an API error leaves
 * ai_rubric null and the UI simply shows nothing.
 */
const LEVELS = (what: string) => [
  `1 — ${what}: almost nothing`,
  `2 — ${what}: weak`,
  `3 — ${what}: adequate`,
  `4 — ${what}: strong`,
  `5 — ${what}: outstanding`,
];

const QUESTIONS = {
  depth: 'How deep and substantial is the learning described in `report` (beyond a mention of a course/book title)?',
  applied: 'How clearly does `report` show the learning being applied in the person’s actual work, with a concrete effect?',
  evidence: 'How verifiable is `report`: concrete facts, numbers, names, a link or certificate rather than general claims?',
} as const;

const score = (a: TsAnswer | undefined): number | null => (a && a.type === 'score' ? Math.round(a.score) : null);
const conf = (a: TsAnswer | undefined): number | null => (a && 'confidence' in a ? a.confidence : null);

export async function suggestSelfDevRubric(submissionId: string): Promise<boolean> {
  try {
    const [row] = await sql<
      { achievements: string | null; value_added: string | null; kind: string | null; hours: number | null; evidence_url: string | null; goal: string | null; role: string | null }[]
    >`
      select sd.achievements, sd.value_added, sd.kind, sd.hours, sd.evidence_url, g.goal, p.role::text as role
      from self_development sd
      left join self_dev_goals g on g.user_id = sd.user_id and g.month = sd.month
      left join profiles p on p.id = sd.user_id
      where sd.id = ${submissionId}`;
    if (!row) return false;
    const res = await askTypeSafe(
      {
        context:
          'A monthly self-development report by a staff member of Persons, an education centre in Uzbekistan. Text may be Uzbek, Russian or English.',
        report: {
          goal_for_month: row.goal ?? '',
          what_i_learned: row.achievements ?? '',
          how_it_added_value: row.value_added ?? '',
          kind: row.kind ?? '',
          hours: row.hours ?? null,
          evidence_link: row.evidence_url ?? '',
          author_role: row.role ?? 'staff',
        },
      },
      Object.fromEntries(
        RUBRIC_KEYS.map((k) => [k, { type: 'score' as const, instructions: QUESTIONS[k], criteria: LEVELS(k) }]),
      ),
      'self_dev_rubric',
    );
    if (!res) return false;
    const rubric: Partial<Rubric> & { confidence?: number | null } = {};
    const confidences: number[] = [];
    for (const k of RUBRIC_KEYS) {
      const s = score(res.answers[k]);
      // Jev's score index is 0-based over the five criteria.
      if (s !== null) rubric[k] = Math.max(1, Math.min(5, s + 1));
      const c = conf(res.answers[k]);
      if (c !== null) confidences.push(c);
    }
    rubric.confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    await sql`update self_development set ai_rubric = ${sql.json(rubric)}, ai_checked_at = now() where id = ${submissionId}`;
    return true;
  } catch (error) {
    console.error('suggestSelfDevRubric failed', submissionId, error instanceof Error ? error.message : error);
    return false;
  }
}
