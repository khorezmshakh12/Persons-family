import 'server-only';
import { sql } from '@/lib/db/client';
import { askTypeSafe, type TsAnswer } from '@/lib/typesafe';

// AI enrichment with TypeSafe (Jev). Code keeps control: the model only
// supplies narrow judgments (category / urgency / "is this a software bug",
// lead intent), stored next to the record with their confidence so the UI can
// show them — or not — by threshold. Nothing is auto-assigned or auto-closed.

export const ISSUE_CATEGORIES = {
  sayt_it:
    "Persons Staff sayti, ilova, LMS, kompyuter dasturi yoki tizimidagi xato (bug) — The Persons Staff website, app, LMS or other software is malfunctioning, erroring, slow, or showing wrong data.",
  texnik_jihoz:
    'Jihozlar va binodagi jismoniy muammo — Physical equipment or premises: computers/hardware, projector, internet connection, electricity, furniture, rooms, cleaning.',
  oquv_jarayoni: "Darslar, guruhlar, o'quvchilar, dars rejalari — Teaching and classes: lessons, groups, students, lesson plans, materials, schedules of classes.",
  moliya: "Ish haqi, to'lovlar, pul — Money: salaries, payments, fines, stars/bonuses, invoices.",
  xodimlar: 'Xodimlar munosabati, intizom, ish tartibi — People and HR: conflicts, discipline, workload, working hours, staff behaviour.',
  boshqa: "Boshqa — Anything that does not fit the categories above.",
} as const;
export type IssueCategory = keyof typeof ISSUE_CATEGORIES;

const URGENCY_LEVELS = [
  'Not urgent: a suggestion or minor inconvenience that can wait weeks.',
  'Normal: should be handled this week; work continues meanwhile.',
  'Important: should be handled today or tomorrow; it is hurting work or people.',
  'Critical: work is blocked right now, money/data is at risk, or many people are affected.',
];

const num = (a: TsAnswer | undefined, k: 'noul' | 'score' | 'confidence') =>
  a && k in a ? Number((a as Record<string, unknown>)[k]) : null;

/** Classifies one issue and upserts issue_ai. Safe to call repeatedly. */
export async function triageIssue(issueId: string): Promise<boolean> {
  try {
    const [issue] = await sql<{ title: string; description: string | null; role: string | null }[]>`
      select i.title, i.description, p.role::text as role
      from issues i left join profiles p on p.id = i.created_by
      where i.id = ${issueId}`;
    if (!issue) return false;
    const res = await askTypeSafe(
      {
        context: 'An internal issue report filed by a staff member of Persons, an education centre in Uzbekistan. Text may be in Uzbek, Russian or English.',
        issue: { title: issue.title, description: issue.description ?? '', reporter_role: issue.role ?? 'staff' },
      },
      {
        category: {
          type: 'choice',
          instructions: 'Which area does the problem in `issue` belong to?',
          criteria: ISSUE_CATEGORIES,
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is the problem described in `issue` for the organisation?',
          criteria: URGENCY_LEVELS,
        },
        it_bug: {
          type: 'noul',
          instructions:
            'Does `issue` report a defect in software — the Persons Staff website/app, LMS, or another program not working as expected (errors, broken buttons, wrong data, crashes, slowness)?',
          criteria: {
            true: 'A software malfunction is described.',
            false: 'The problem is physical, organisational, financial, human, or a feature request without a malfunction.',
          },
        },
      },
    );
    if (!res) return false;
    const cat = res.answers.category;
    const category = cat && cat.type === 'choice' ? cat.choice : null;
    await sql`
      insert into issue_ai (issue_id, category, category_confidence, urgency, urgency_confidence, it_bug, model, checked_at)
      values (${issueId}, ${category}, ${num(cat, 'confidence')}, ${num(res.answers.urgency, 'score')},
        ${num(res.answers.urgency, 'confidence')}, ${num(res.answers.it_bug, 'noul')}, ${res.model}, now())
      on conflict (issue_id) do update set
        category = excluded.category, category_confidence = excluded.category_confidence,
        urgency = excluded.urgency, urgency_confidence = excluded.urgency_confidence,
        it_bug = excluded.it_bug, model = excluded.model, checked_at = now()`;
    return true;
  } catch (error) {
    console.error('triageIssue failed', issueId, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Scores one lead's likelihood to enrol from its free-text note + fields. */
export async function scoreLead(leadId: string): Promise<boolean> {
  try {
    const [lead] = await sql<{ name: string; source: string; course: string; stage: string; note: string }[]>`
      select name, source, course, stage, note from ops_leads where id = ${leadId}`;
    if (!lead) return false;
    const res = await askTypeSafe(
      {
        context: 'A sales lead of Persons, a language and IT education centre in Uzbekistan. The note is written by the sales manager (Uzbek/Russian/English).',
        lead: { source: lead.source, course_of_interest: lead.course, pipeline_stage: lead.stage, manager_note: lead.note },
      },
      {
        intent: {
          type: 'score',
          instructions: 'How likely is this person to enrol and pay for a course, judging from `lead`?',
          criteria: [
            'Unlikely: no real interest, wrong fit, or refused.',
            'Possible: some interest but undecided or only asking.',
            'Likely: clear interest, asked about schedule/price, wants a trial.',
            'Very likely: ready to pay or already agreed to start.',
          ],
        },
        hot: {
          type: 'noul',
          instructions: 'Should the manager contact this lead today because they show strong, time-sensitive intent to enrol?',
        },
      },
    );
    if (!res) return false;
    const intent = res.answers.intent;
    await sql`
      update ops_leads set ai_intent = ${num(intent, 'score')}, ai_intent_confidence = ${num(intent, 'confidence')},
        ai_hot = ${num(res.answers.hot, 'noul')}, ai_checked_at = now()
      where id = ${leadId}`;
    return true;
  } catch (error) {
    console.error('scoreLead failed', leadId, error instanceof Error ? error.message : error);
    return false;
  }
}
