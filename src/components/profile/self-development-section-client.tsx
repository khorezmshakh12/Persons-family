'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { ExpandCollapseControls } from '@/components/self-development/expand-collapse-controls';

interface SelfDevelopmentSectionClientProps {
  title: string;
  filteredCount: number;
  noEntriesText: string;
  monthPickerContent: React.ReactNode;
  /** Ids of the visible submissions (for expand/collapse all). */
  submissionIds: string[];
  /** SubmissionCard is an async server component, so the server renders
   * the cards and hands them in — a client component can't render it. */
  cards: React.ReactNode;
}

export function SelfDevelopmentSectionClient({
  title,
  filteredCount,
  noEntriesText,
  monthPickerContent,
  submissionIds,
  cards,
}: SelfDevelopmentSectionClientProps) {
  const summaryLine = submissionIds.length > 0 ? `${submissionIds.length} entry(ies)` : 'No entries';

  const headerContent = (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <div className="flex flex-col">
        <span className="font-semibold text-au-ink">{title}</span>
        <span className="text-xs text-au-muted">{summaryLine}</span>
      </div>
      <ChevronDown
        className={cn(
          'size-4 text-au-muted transition-transform duration-300 ease-in-out',
          '[[aria-expanded=true]_&]:rotate-180',
        )}
      />
    </div>
  );

  return (
    <CollapsibleCard
      id="self-dev-section"
      header={headerContent}
      defaultOpen={false}
      storageKey="profile-self-dev-section-open"
      className="w-full"
      headerClassName="flex items-center gap-2 py-2 px-0 hover:bg-transparent transition-colors"
    >
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {monthPickerContent}
        </div>

        {filteredCount === 0 ? (
          <p className="text-sm text-au-muted">{noEntriesText}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ExpandCollapseControls
              count={submissionIds.length}
              storageKeyPrefix="profile-submission"
              itemIds={submissionIds}
            />
            {cards}
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
