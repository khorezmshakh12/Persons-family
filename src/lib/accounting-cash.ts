/** Kirim-chiqim vocabulary — client-safe, shared by the cash book UI and
 * the template actions (v8-B). */

/** Plain-language income / expense categories of an education centre. Each
 * maps to the account on the other side of the cash line, so a cash entry
 * lands in the journal — and therefore in every report — without the user
 * ever seeing an account code (owner, 2026-10-05). */
export const CASH_CATS: { k: string; n: string; dir: 'in' | 'out'; acc: string }[] = [
  { k: 'tuition', n: 'O‘quvchi to‘lovi (o‘qish haqi)', dir: 'in', acc: '9030' },
  { k: 'prepay', n: 'Oldindan to‘lov (keyingi oylar uchun)', dir: 'in', acc: '6310' },
  { k: 'debt', n: 'O‘quvchi qarzini to‘ladi', dir: 'in', acc: '4010' },
  { k: 'material', n: 'Darslik / material sotuvi', dir: 'in', acc: '9030' },
  { k: 'capital', n: 'Ta’sischi mablag‘i', dir: 'in', acc: '8300' },
  { k: 'tsalary', n: 'O‘qituvchilar maoshi', dir: 'out', acc: '9130' },
  { k: 'asalary', n: 'Ma’muriyat maoshi', dir: 'out', acc: '9420' },
  { k: 'rent', n: 'Ijara', dir: 'out', acc: '9420' },
  { k: 'util', n: 'Kommunal (svet, gaz, internet)', dir: 'out', acc: '9430' },
  { k: 'mkt', n: 'Marketing / reklama', dir: 'out', acc: '9410' },
  { k: 'books', n: 'Darslik va o‘quv materiallari', dir: 'out', acc: '9130' },
  { k: 'tax', n: 'Soliq to‘lovi', dir: 'out', acc: '6410' },
  { k: 'social', n: 'Ijtimoiy soliq to‘lovi', dir: 'out', acc: '6520' },
  { k: 'equip', n: 'Jihoz / mebel xaridi', dir: 'out', acc: '0100' },
  { k: 'supplier', n: 'Yetkazib beruvchiga to‘lov', dir: 'out', acc: '6010' },
  { k: 'other', n: 'Boshqa xarajat', dir: 'out', acc: '9430' },
];
export const CASH_ACC = ['5010', '5110'] as const;
export const METHOD = { '5010': 'Naqd (kassa)', '5110': 'Bank / karta' } as const;

export type CashCat = (typeof CASH_CATS)[number];

/** A monthly recurring cash movement (rent, internet…). */
export type CashTemplate = { id: string; cat: string; method: string; amount: number; note: string; day: number; active: boolean };

/** The doc tag that marks a journal entry as made from a template. */
export const templateDoc = (id: string) => `TPL:${id}`;

/** Description in the same "<category> — <note>" form the cash book writes. */
export function cashDescription(catName: string, note: string): string {
  return note.trim() ? `${catName} — ${note.trim()}` : catName;
}
