'use client';

import { useTranslations } from 'next-intl';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ExportColumn = { header: string; key: string };

function toCsvValue(value: unknown) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({
  filename,
  columns,
  rows,
}: {
  filename: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}) {
  const t = useTranslations('export');

  function exportCsv() {
    const header = columns.map((c) => toCsvValue(c.header)).join(',');
    const lines = rows.map((row) => columns.map((c) => toCsvValue(row[c.key])).join(','));
    const csv = [header, ...lines].join('\n');
    downloadBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
  }

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Persons Education Company', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(filename, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [columns.map((c) => c.header)],
      body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
      headStyles: { fillColor: [45, 212, 191] },
      styles: { fontSize: 8 },
    });

    doc.save(`${filename}.pdf`);
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={exportCsv}
        className="border-white/30 bg-white/10 text-white hover:bg-white/20"
      >
        <FileSpreadsheet className="size-4" />
        {t('csv')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={exportPdf}
        className="border-white/30 bg-white/10 text-white hover:bg-white/20"
      >
        <FileDown className="size-4" />
        {t('pdf')}
      </Button>
    </div>
  );
}
