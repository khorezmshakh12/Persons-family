/** Kirim-chiqim vocabulary — client-safe, shared by the cash book UI and
 * the template actions (v8-B). */

/** A plain-language income / expense category of an education centre. Each
 * maps to the account on the other side of the cash line, so a cash entry
 * lands in the journal — and therefore in every report — without the user
 * ever seeing an account code (owner, 2026-10-05). The list lives in
 * acct_cash_cats and is edited from Kirim-chiqim › Kategoriyalar (v2). */
export type CashCat = { k: string; n: string; dir: 'in' | 'out'; acc: string };
export type CashCatRow = CashCat & { active: boolean; sort: number };

/** A kassa / bank / karta: an asset account flagged `cash_box`. Codes are
 * handed out from two families — 50xx naqd, 51xx bank/karta — so the code
 * alone says whether an account is cash, even in the pure report helpers. */
export type CashBox = { code: string; name: string; kind: 'cash' | 'bank' };
export const isCashCode = (code: string) => /^5[01]\d\d$/.test(code);
export const boxKind = (code: string): CashBox['kind'] => (code.startsWith('50') ? 'cash' : 'bank');

/** Salary / advance payments the payroll posts on its own (source
 * `pay:<YYYY-MM-01>:<financeEntryId>`): shown in the cash book, edited only
 * from Ish haqi. */
export const PAY_SOURCE = 'pay:';
export const PAY_CAT_NAME = 'Ish haqi to‘lovi';

/** A monthly recurring cash movement (rent, internet…). */
export type CashTemplate = {
  id: string;
  cat: string;
  method: string;
  amount: number;
  note: string;
  day: number;
  active: boolean;
  /** 'YYYY-MM' (Tashkent) it was created — never applied to earlier months. */
  from: string;
};

/** The doc tag that marks a journal entry as made from a template. */
export const templateDoc = (id: string) => `TPL:${id}`;

/** Description in the same "<category> — <note>" form the cash book writes. */
export function cashDescription(catName: string, note: string): string {
  return note.trim() ? `${catName} — ${note.trim()}` : catName;
}
