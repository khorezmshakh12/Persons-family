import { ButterflyStage } from '@/components/butterfly/butterfly-stage';

/** Butterfly — a calm corner open to everyone: the particle garden, full
 * size, drag to orbit, full-screen toggle. Nothing to load from the DB (the
 * layout already gates sign-in). */
export default function ButterflyPage() {
  return (
    <div className="p-2 sm:p-4">
      <ButterflyStage />
    </div>
  );
}
