'use client';

import { COMPONENT_LABEL, monthLabel, type PayLine } from '@/lib/pay-run';

/** jsPDF's built-in fonts are Latin-1: swap the Uzbek ‘ ’ and the minus sign
 * for plain ASCII so nothing renders as a box. */
const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/−/g, '-').replace(/[–—]/g, '-').replace(/·/g, '-');
const money = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('en-US').replace(/,/g, ' ')} so'm`;

/** One payslip per line, one page each — a single person or the whole run. */
export async function downloadPayslips(lines: PayLine[], period: string, status: string) {
  if (!lines.length) return;
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  lines.forEach((l, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFillColor(27, 31, 42);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255);
    doc.setFontSize(15);
    doc.text('Persons Education', 14, 12);
    doc.setFontSize(10);
    doc.text(latin(`Hisob varaqasi - ${monthLabel(period)}`), 14, 19);
    doc.text(latin(status), 196, 19, { align: 'right' });

    doc.setTextColor(20);
    doc.setFontSize(13);
    doc.text(latin(l.name), 14, 38);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(latin(l.role), 14, 44);

    autoTable(doc, {
      startY: 52,
      head: [['Tarkib', 'Izoh', 'Summa']],
      body: l.components.map((c) => [latin(COMPONENT_LABEL[c.kind]), latin(c.kind === 'base' ? '' : c.title), money(c.amount)]),
      foot: [['To\'lanadi', '', money(l.payable)]],
      headStyles: { fillColor: [45, 52, 70] },
      footStyles: { fillColor: [235, 238, 244], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right' } },
    });
    const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y1,
      head: [["To'lovlar", 'Sana', 'Summa']],
      body: l.payments.length
        ? l.payments.map((p) => [latin(p.kind === 'advance' ? 'Avans' : 'Oylik'), p.at ? p.at.slice(0, 10) : '', money(p.amount)])
        : [["Hali to'lov yo'q", '', '']],
      foot: [["Qoldiq", '', money(l.remaining)]],
      headStyles: { fillColor: [45, 52, 70] },
      footStyles: { fillColor: l.remaining > 0 ? [255, 243, 224] : [232, 245, 233], textColor: 20, fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right' } },
    });
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(latin('Hujjat tizim tomonidan yaratilgan. Savollar bo\'lsa, rahbariyatga murojaat qiling.'), 14, 287);
  });
  doc.save(lines.length === 1 ? `hisob-varaqasi-${period.slice(0, 7)}-${latin(lines[0].name).replace(/\s+/g, '-')}.pdf` : `hisob-varaqalari-${period.slice(0, 7)}.pdf`);
}
