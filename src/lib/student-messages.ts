import 'server-only';
import { sql } from '@/lib/db/client';
import { sendToChat } from '@/lib/crm-bot';
import { formatUZS } from '@/lib/format-currency';
import { feeAfterDiscount, fillTemplate, nextDueDate } from '@/lib/billing';
import { tashkentDayKey } from '@/lib/time';

// Ota-onaga xabar (2026-10-23): template variables from one student's billing
// state, and delivery through the CRM bot to every contact linked to it.

const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
const dmy = (k: string) => k.split('-').reverse().join('.');

export type StudentVars = Record<'ism' | 'ota_ona' | 'summa' | 'sana' | 'qarz' | 'tolandi' | 'havola', string>;

export async function studentVars(studentId: string, extra: Partial<StudentVars> = {}): Promise<StudentVars | null> {
  const [s] = await sql<{ name: string; balance: number; fee: number; discount: number; start: string | null; parent: string; link: string }[]>`
    select s.full_name as name, s.balance, s.discount_pct as discount,
      coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) as fee,
      coalesce(s.billing_start, (select min(e.activation_date) from crm_enrollments e where e.student_id = s.id and e.status = 'active'))::text as start,
      coalesce((select nullif(c.name, '') from crm_contacts c where c.student_id = s.id and c.kind <> 'student'
        order by c.is_primary desc, c.created_at limit 1), 'ota-ona') as parent,
      coalesce((select pay_link from crm_billing_settings where id), '') as link
    from crm_students s where s.id = ${studentId}`;
  if (!s) return null;
  const today = tashkentDayKey();
  return {
    ism: s.name,
    ota_ona: s.parent,
    summa: som(feeAfterDiscount(s.fee, s.discount)),
    sana: s.start ? dmy(nextDueDate(s.start, today)) : '—',
    qarz: som(Math.max(0, -s.balance)),
    tolandi: '',
    havola: s.link,
    ...extra,
  };
}

export const renderMessage = (body: string, vars: StudentVars) => fillTemplate(body, vars);

/** Sends to every parent/student contact linked to the CRM bot. */
export async function sendToStudentContacts(studentId: string, text: string): Promise<{ recipients: number; sent: number }> {
  const chats = await sql<{ chat: number }[]>`
    select distinct telegram_chat_id as chat from crm_contacts where student_id = ${studentId} and telegram_chat_id is not null`;
  let sent = 0;
  for (const c of chats) if (await sendToChat(Number(c.chat), text)) sent++;
  return { recipients: chats.length, sent };
}
