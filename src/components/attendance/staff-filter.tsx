'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function StaffFilter({
  staffList,
}: {
  staffList: { id: string; first_name: string; last_name: string }[];
}) {
  const t = useTranslations('attendance');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('staff') ?? 'all';

  function labelFor(value: string) {
    if (value === 'all') return t('allStaffOption');
    const person = staffList.find((s) => s.id === value);
    return person ? `${person.first_name} ${person.last_name}` : value;
  }

  function handleChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') {
      params.delete('staff');
    } else {
      params.set('staff', value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue>{labelFor}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('allStaffOption')}</SelectItem>
        {staffList.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.first_name} {s.last_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
