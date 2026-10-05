'use client';

import { ChevronDown } from 'lucide-react';
import { useFormatter } from 'next-intl';
import { cn } from '@/lib/utils';
import { CollapsibleCard } from '@/components/ui/collapsible-card';

interface CollapsibleSubmissionCardProps {
  id: string;
  month: string;
  ceoScore: number | null;
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKeyPrefix?: string;
}

export function CollapsibleSubmissionCard({
  id,
  month,
  ceoScore,
  header,
  children,
  defaultOpen = false,
  storageKeyPrefix = 'submission',
}: CollapsibleSubmissionCardProps) {
  const format = useFormatter();

  const monthLabel = format.dateTime(new Date(`${month}T00:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const headerContent = (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <div className="flex flex-col">
        {header && <div className="font-medium text-au-ink text-sm">{header}</div>}
        <span className="text-xs text-au-muted">{monthLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        {ceoScore !== null && (
          <span className="shrink-0 rounded-full bg-au-card-2 px-3 py-1 text-xs font-bold text-au-ink">
            {ceoScore}
          </span>
        )}
        <ChevronDown
          className={cn(
            'size-4 text-au-muted transition-transform duration-300 ease-in-out',
            '[.group/collapsible[aria-expanded=true]_&]:rotate-180',
          )}
        />
      </div>
    </div>
  );

  return (
    <div className={cn('rounded-2xl border border-au-line bg-au-card text-au-ink shadow-au-card group/collapsible overflow-hidden')}>
      <CollapsibleCard
        id={id}
        header={headerContent}
        storageKey={`${storageKeyPrefix}-${id}`}
        defaultOpen={defaultOpen}
        className="w-full"
        headerClassName="flex items-center gap-2 py-3 px-4 hover:bg-au-card-2 transition-colors"
        contentClassName="border-t border-au-line"
      >
        <div className="px-4 py-3">{children}</div>
      </CollapsibleCard>
    </div>
  );
}
