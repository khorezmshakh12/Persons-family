import { getTranslations } from 'next-intl/server';
import { GoalCard, type Goal } from './goal-card';

const COLUMNS: Goal['timeframe'][] = ['weekly', 'monthly', 'quarterly'];

export async function RoadmapBoard({ goals }: { goals: Goal[] }) {
  const t = await getTranslations('roadmap');

  if (goals.length === 0) {
    return <p className="text-sm text-white/70">{t('noGoals')}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((timeframe) => {
        const columnGoals = goals.filter((g) => g.timeframe === timeframe);
        return (
          <div key={timeframe} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-white">
              {t(`timeframe.${timeframe}`)} ({columnGoals.length})
            </h2>
            <div className="flex flex-col gap-3">
              {columnGoals.length === 0 ? (
                <p className="text-sm text-white/60">{t('noGoalsInColumn')}</p>
              ) : (
                columnGoals.map((goal) => <GoalCard key={goal.id} goal={goal} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
