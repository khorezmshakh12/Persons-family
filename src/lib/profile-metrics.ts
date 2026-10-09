/** Client-safe metric catalogue for the profile (data: profile-insights.ts). */
export type ProfileMetricKey = 'tasksDone' | 'onTime' | 'kpi' | 'selfDev' | 'stars' | 'issues';

export const PROFILE_METRIC: Record<ProfileMetricKey, { n: string; unit: '' | '%' | ' ball' | ' ★' }> = {
  tasksDone: { n: 'Bajarilgan vazifalar', unit: '' },
  onTime: { n: 'O‘z vaqtida', unit: '%' },
  kpi: { n: 'KPI natijasi', unit: '%' },
  selfDev: { n: 'O‘zini rivojlantirish', unit: ' ball' },
  stars: { n: 'Yulduzlar', unit: ' ★' },
  issues: { n: 'Hal qilgan muammolar', unit: '' },
};

