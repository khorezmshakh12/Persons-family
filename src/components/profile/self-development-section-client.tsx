'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { SubmissionCard, type Submission } from '@/components/self-development/submission-card';
import { ExpandCollapseControls } from '@/components/self-development/expand-collapse-controls';

interface SelfDevelopmentSectionClientProps {
  title: string;
  filteredCount: number;
  noEntriesText: string;
  monthPickerContent: React.ReactNode;
  submissions: Submission[];
  isAdmin: boolean;
}

export function SelfDevelopmentSectionClient({
  title,
  filteredCount,
  noEntriesText,
  monthPickerContent,
  submissions,
  isAdmin,
}: SelfDevelopmentSectionClientProps) {
  const summaryLine = submissions.length > 0 ? `${submissions.length} entry(ies)` : 'No entries';

  const headerContent = (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <div className="flex flex-col">
        <span className="font-semibold text-au-ink">{title}</span>
        <span className="text-xs text-au-muted">{summaryLine}</span>
      </div>
      <ChevronDown
        className={cn(
          'size-4 text-au-muted transition-transform duration-300 ease-in-out',
          '[.group/collapsible[aria-expanded=true]_&]:rotate-180',
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
              count={submissions.length}
              storageKeyPrefix="profile-submission"
              itemIds={submissions.map((s) => s.id)}
            />
            {submissions.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                isAdmin={isAdmin}
                defaultOpen={false}
                storageKeyPrefix="profile-submission"
              />
            ))}
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
