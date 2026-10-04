import { getTranslations } from 'next-intl/server';
import { ButterflyCanvas } from '@/components/butterfly/butterfly-canvas';

/** Butterfly — a calm corner open to everyone: the particle garden, full
 * size, drag to orbit. Nothing to load from the DB (the layout already
 * gates sign-in). */
export default async function ButterflyPage() {
  const t = await getTranslations('butterfly');
  return (
    <div className="p-2 sm:p-4">
      <div className="relative h-[calc(100dvh-6rem)] min-h-[360px] overflow-hidden rounded-au-card bg-black">
        <ButterflyCanvas variant="full" className="cursor-grab active:cursor-grabbing" />
        <div className="pointer-events-none absolute inset-x-0 top-0 p-4 sm:p-6">
          <h1 className="text-lg font-bold text-white/90 sm:text-xl">{t('title')}</h1>
          <p className="text-xs text-white/60 sm:text-sm">{t('subtitle')}</p>
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-center text-xs text-white/50">{t('hint')}</p>
      </div>
    </div>
  );
}
