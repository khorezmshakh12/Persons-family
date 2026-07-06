'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type AssistantOption = { id: string; first_name: string; last_name: string };

// Note: this dialog's DialogContent renders on the solid bg-popover surface
// (see components/ui/dialog.tsx), not the glass-over-photo surface used
// elsewhere in the app — every other field here (Input/Textarea) already
// uses plain default styling for that reason, so this matches them rather
// than forcing bg-white/10 + text-white, which would look mismatched and
// could render illegibly (white text on a light popover) in light theme.
export function TaSelectField({
  assistants,
  defaultValue,
}: {
  assistants: AssistantOption[];
  defaultValue?: string;
}) {
  const t = useTranslations('lessonPlans');
  const nameFor = (id: string) => {
    const a = assistants.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : t('noTaAssigned');
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="assignedTaId">{t('assignedTa')}</Label>
      <Select name="assignedTaId" defaultValue={defaultValue ?? 'none'}>
        <SelectTrigger id="assignedTaId" className="w-full">
          <SelectValue>{(value: string) => (value === 'none' ? t('noTaAssigned') : nameFor(value))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t('noTaAssigned')}</SelectItem>
          {assistants.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.first_name} {a.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
