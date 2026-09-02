# Build prompt — Income Roadmap (Daromadlar xaritasi) UI

**Audience:** the UI/UX tool ("Antigravity").
**Scope:** the visual design and interaction layer only. The data model, the
migration and every server action already exist and are **not** to be changed.
This document is self-contained: it describes the screen, the exact data you
receive, every server-action contract, the design system, and the lint rules
your output must satisfy.

---

## 1. What this feature is

Persons Education runs a staff platform (Next.js 16 App Router, React 19,
next-intl, Tailwind v4, glassmorphism over a user-chosen background photo).

The **Income Roadmap** is a per-employee, per-year plan for how that person's
monthly income should grow, and a record of how it actually went.

- **The CEO owns it.** Only the CEO can create or edit a roadmap, and the CEO
  can never manage their own (self-certification is banned across this app).
- **The employee sees it read-only** on their own finance page.
- It lives on `/[locale]/finance/[staffId]`, rendered by
  `src/components/income-roadmap/income-roadmap-section.tsx` — a **server
  component**. It currently renders an intentionally plain placeholder. Your
  job is to replace that presentation, keeping its props and its data source.

The old version was a base salary, a year-end number, and a list of loose
"steps". It had no month-by-month plan, no actuals, no growth rate and no
history. The new model fixes all of that; the UI must now actually show it.

---

## 2. Data model (already migrated — read-only context)

Migration: `supabase/migrations/20260903090000_income_roadmap_rebuild.sql`

| Table | Meaning |
|---|---|
| `income_roadmaps` | one row per `(staff_id, year)`: `baseline_monthly_income`, `target_year_end_income`, `status` (`draft`/`active`/`archived`), `notes` |
| `income_roadmap_months` | the 12-month grid: `month_number` 1..12, `planned_income`, `actual_income` (NULL = not reported yet), `note` |
| `income_roadmap_milestones` | `title`, `target_month` 1..12, `target_income`, `criteria`, `status` (`planned`/`in_progress`/`achieved`/`missed`), `achieved_at` |

Nothing derived is stored. Variance, growth %, cumulative series and
attainment are all computed in `src/components/income-roadmap/data.ts`.

The old `staff_income_plans` / `income_roadmap_steps` tables still exist but
are dead: **never query them, never import from them.**

---

## 3. The data you render

Call the existing helper — do not write SQL of your own:

```ts
import { getIncomeRoadmapData } from '@/components/income-roadmap/data';

const data = await getIncomeRoadmapData(staffId, year /* optional */);
```

It returns `IncomeRoadmapData`:

```ts
type IncomeRoadmapData = {
  year: number;              // the year actually being displayed
  availableYears: number[];  // every year this staff member has a roadmap for, newest first
  roadmap: {
    id: string;
    year: number;
    baselineMonthlyIncome: number;
    targetYearEndIncome: number;
    status: 'draft' | 'active' | 'archived';
    notes: string | null;
  } | null;                  // null → no roadmap for this year yet
  months: IncomeRoadmapMonth[];       // always exactly 12 when roadmap != null
  milestones: IncomeRoadmapMilestone[];
  totals: IncomeRoadmapTotals | null; // null when roadmap is null
};

type IncomeRoadmapMonth = {
  monthNumber: number;          // 1..12
  monthKey: string;             // 'YYYY-MM' — format via `${monthKey}-01`
  planned: number;
  actual: number | null;        // null = not reported yet; 0 is a real zero
  note: string | null;
  recordedAt: string | null;    // ISO string
  isClosed: boolean;            // the month is over
  isCurrent: boolean;           // this is the current Tashkent month
  variance: number | null;      // actual − planned
  variancePct: number | null;   // variance as % of planned; null if planned is 0
  growthPct: number | null;     // vs previous month; actual-vs-actual when both
                                // are reported, otherwise plan-vs-plan. null for Jan.
  cumulativePlanned: number;
  cumulativeActual: number;     // counts reported months only
};

type IncomeRoadmapMilestone = {
  id: string;
  title: string;
  targetMonth: number;          // 1..12
  targetIncome: number;
  criteria: string | null;      // "what it takes" note
  status: 'planned' | 'in_progress' | 'achieved' | 'missed';
  achievedAt: string | null;
};

type IncomeRoadmapTotals = {
  plannedYear: number;             // sum of all 12 planned months
  plannedToDate: number;           // sum of planned for reported months only
  actualToDate: number;
  attainmentPct: number | null;    // actualToDate / plannedToDate × 100
  reportedMonths: number;
  avgMonthlyGrowthPct: number | null;
  plannedYearGrowthPct: number | null; // baseline → December plan
  latestActual: number | null;
  projectedYearTotal: number;      // actualToDate + plan for unreported months
};
```

**Component signature — keep it:**

```tsx
export async function IncomeRoadmapSection({
  staffId, canManage, year,
}: { staffId: string; canManage: boolean; year?: number }) { … }
```

`canManage` is already `isCeo && !isSelf`. Never re-derive permissions in the
UI; gate management affordances on `canManage` only.

You may add a `year` search-param pass-through on
`src/app/[locale]/(app)/finance/[staffId]/page.tsx` if you build a year
switcher (`?incomeYear=2025` → `year={Number(searchParams.incomeYear)}`).
That page is otherwise off-limits.

Money formatting: `formatUZS()` from `@/lib/format-currency` (space-grouped
som, no decimals). Never `Intl.NumberFormat` inline.

Dates: `useFormatter()` from `next-intl` (already pinned to `Asia/Tashkent`).
Never construct a month label from `new Date()` yourself.

---

## 4. Server actions — exact contracts

All live in `src/lib/actions/income-roadmap.ts`, all `'use server'`, all with
the signature:

```ts
(prevState: IncomeRoadmapActionState, formData: FormData)
  => Promise<IncomeRoadmapActionState>

type IncomeRoadmapActionState = { error?: string } | undefined;
```

Success is `{}` (an object with no `error`). Failure is `{ error: '<code>' }`.
They **never throw**. Drive them with `useActionState` from a client
component and surface `t(\`errors.${state.error}\`)` via `toast.error` from
`sonner`; on success show the matching success toast and close the dialog.

> Every action re-checks CEO server-side and refuses when
> `staffId === <the caller's own id>`. A UI that hides a button is not a
> security boundary and does not need to be one.

### `upsertIncomeRoadmapAction`
Creates or updates the header for `(staffId, year)` and guarantees the 12
month rows exist. Re-saving never wipes an existing plan.

| field | type | required |
|---|---|---|
| `staffId` | uuid | yes |
| `year` | int 2020–2100 | yes |
| `baselineMonthlyIncome` | number ≥ 0 | yes |
| `targetYearEndIncome` | number ≥ 0 | yes |
| `status` | `draft` \| `active` \| `archived` | no (default `active`) |
| `notes` | string ≤ 4000 | no |

Errors: `sessionExpired`, `forbidden`, `invalidInput`, `updateFailed`.

### `saveMonthlyPlanAction`
Saves the whole planned curve in one submit.

| field | type |
|---|---|
| `staffId` | uuid |
| `roadmapId` | uuid |
| `planned-1` … `planned-12` | number ≥ 0, **all twelve required** |

A missing `planned-N` is rejected as `invalidInput` — never submit a partial
grid.

Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `updateFailed`.

### `recordMonthActualAction`
Records what the employee actually earned in one month.

| field | type |
|---|---|
| `staffId` | uuid |
| `roadmapId` | uuid |
| `monthNumber` | int 1–12 |
| `actualIncome` | number ≥ 0 |
| `note` | string ≤ 2000, optional |

Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `updateFailed`.

### `clearMonthActualAction`
Puts a month back to "not reported yet" (`actual` → null).
Fields: `staffId`, `roadmapId`, `monthNumber`.
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `updateFailed`.

### `createMilestoneAction`
Fields: `staffId`, `roadmapId`, `title` (1–160), `targetMonth` (1–12),
`targetIncome` (≥ 0), `criteria` (≤ 2000, optional).
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `createFailed`.

### `updateMilestoneAction`
Fields: `staffId`, `milestoneId`, `title`, `targetMonth`, `targetIncome`,
`criteria` — same rules as create.
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `updateFailed`.

### `setMilestoneStatusAction`
Fields: `staffId`, `milestoneId`, `status` ∈
`planned` | `in_progress` | `achieved` | `missed`.
`achieved_at` is stamped/cleared automatically.
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `updateFailed`.

### `deleteMilestoneAction`
Fields: `staffId`, `milestoneId`.
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `deleteFailed`.

### `deleteIncomeRoadmapAction`
Fields: `staffId`, `roadmapId`. Cascades to months and milestones — put it
behind an `AlertDialog` confirmation.
Errors: `sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `deleteFailed`.

### Complete error-code set
`sessionExpired`, `forbidden`, `invalidInput`, `notFound`, `createFailed`,
`updateFailed`, `deleteFailed` — all have `incomeRoadmap.errors.*` messages
(see §8).

---

## 5. The screen

One `GLASS_CARD` section on the finance page. Build it in this order.

### 5.1 Header row
- Title (`incomeRoadmap.title`) + subtitle, then the displayed **year**.
- **Year switcher** from `availableYears` — a `Select` or a small segmented
  control. Include the current Tashkent year even when it has no roadmap yet,
  so the CEO can create one. Changing it navigates with `?incomeYear=YYYY`.
- A `Badge` for `roadmap.status` when it is not `active`
  (`Draft` amber / `Archived` slate).
- When `canManage`: an "Edit plan" button opening the header dialog, and a
  destructive "Delete roadmap" in a `DropdownMenu`.

### 5.2 Empty state (`roadmap === null`)
A centred, calm empty state — an icon, `incomeRoadmap.noPlan` (CEO) or
`noPlanSelf` (employee), and, when `canManage`, a primary "Create plan"
button opening the same header dialog with the year prefilled. Do not render
the grid, the chart or the milestone rail at all in this state.

### 5.3 KPI strip
Five stat tiles across the top, responsive (5 → 3 → 2 → 1 columns). Each is a
label, a large tabular-nums value, and a small trend line beneath.

1. **Baseline** — `roadmap.baselineMonthlyIncome`.
2. **Year-end target** — `roadmap.targetYearEndIncome`, with
   `totals.plannedYearGrowthPct` as a "+X% on baseline" caption.
3. **Attainment to date** — `totals.attainmentPct`, and a `Progress` bar.
   Colour by band: ≥ 100 emerald, 90–99 amber, < 90 rose.
4. **Avg. monthly growth** — `totals.avgMonthlyGrowthPct`, arrow up/down.
5. **Projected year total** — `totals.projectedYearTotal`, with
   `totals.plannedYear` as "of X planned".

Any `null` metric renders an em-dash `—`, never `NaN`, `0%` or a blank.

### 5.4 Charts (recharts)
Two views behind a `Tabs` control: **Monthly** and **Cumulative**.

**Monthly** — a `ComposedChart` over the 12 months:
- `Line` `planned` — dashed, `rgba(255,255,255,0.55)`, no dot fill.
- `Line` `actual` — solid emerald `#34d399`, 2.5px, dots only where
  `actual !== null`; the series must **break** (not drop to zero) at the
  first unreported month — pass `null` and set `connectNulls={false}`.
- A faint `ReferenceLine` at `targetYearEndIncome`.
- A `ReferenceLine` (vertical) on the current month when `isCurrent` is set.
- Milestones as `ReferenceDot`s on the planned line at their `targetMonth`,
  coloured by status.

**Cumulative** — an `AreaChart` of `cumulativePlanned` vs `cumulativeActual`,
the actual area gradient-filled emerald, the plan a thin dashed outline. The
gap between them *is* the story; make it legible.

Both charts:
- `ResponsiveContainer`, height ~18rem, `CartesianGrid` `rgba(255,255,255,0.1)`
  horizontal only, axes `rgba(255,255,255,0.75)` at 11px with `tickLine` and
  `axisLine` off, Y ticks through `formatUZS`.
- A **custom tooltip** on the dark glass treatment
  (`rounded-lg border border-white/20 bg-slate-900/90 px-3 py-2 text-xs
  text-white shadow-xl backdrop-blur-md`) showing month, planned, actual,
  variance and growth % on separate lines.
- A legend with the same swatches used in the table.
- Charts are client components (`'use client'`), fed serialisable props only.

### 5.5 Month grid
A responsive table (`@/components/ui/table`), horizontally scrollable inside
its own `overflow-x-auto`, one row per month:

`Month · Planned · Actual · Variance · Variance % · Growth % · Cum. plan · Cum. actual`

- Month label from `useFormatter().dateTime(new Date(\`${monthKey}-01\`), { month: 'short' })`.
- Highlight the current month's row (`isCurrent`) with a left accent border.
- Dim rows that are not yet closed (`!isClosed && actual === null`).
- Variance: emerald with `▲` when ≥ 0, rose with `▼` when < 0, `—` when null.
- Unreported actual: `—` in `text-white/40`, plus (when `canManage`) an
  inline "Record" affordance on hover/focus.
- On small screens, collapse to stacked cards rather than a squeezed table.

**CEO interactions on the grid**
- *Record actual*: a small dialog with a `CurrencyInput`
  (`@/components/staff/currency-input`) and an optional note textarea →
  `recordMonthActualAction`. Offer it on any month, but visually lead with
  closed months.
- *Clear actual*: in the row's `DropdownMenu`, confirmed by `AlertDialog` →
  `clearMonthActualAction`.
- *Edit the plan curve*: one dialog with all 12 `CurrencyInput`s in a 3- or
  4-column grid, plus two convenience tools that only fill the inputs
  client-side (they submit the same twelve fields):
  - "Flat" — copy one figure into every month.
  - "Ramp" — linear from a start figure to an end figure across 12 months.
  Submits `saveMonthlyPlanAction` with `planned-1` … `planned-12`.

### 5.6 Milestone rail
A vertical timeline ordered by `targetMonth`, each entry showing the month,
`title`, `formatUZS(targetIncome)`, the `criteria` note, and a status badge:

| status | badge |
|---|---|
| `planned` | slate, `bg-white/10 text-white/70` |
| `in_progress` | sky, `bg-sky-500/20 text-sky-200` |
| `achieved` | emerald, `bg-emerald-500/20 text-emerald-300` |
| `missed` | rose, `bg-red-500/20 text-red-200` |

Connect entries with a 1px vertical rule; fill the rule emerald up to the
last achieved milestone so progress reads at a glance.

CEO affordances per entry: a status `Select` (→ `setMilestoneStatusAction`,
optimistic via `useTransition`), Edit (→ `updateMilestoneAction`) and Delete
(`AlertDialog` → `deleteMilestoneAction`). Above the rail, an "Add milestone"
button opening a dialog with title / target month / target income / criteria
(→ `createMilestoneAction`).

Empty: `incomeRoadmap.noMilestones` plus the add button when `canManage`.

---

## 6. Design system

- **Container:** `GLASS_CARD` from `@/lib/glass` —
  `rounded-2xl border border-white/20 bg-white/10 text-white shadow-xl
  backdrop-blur-md transform-gpu will-change-transform`. Use
  `GLASS_INTERACTIVE` for anything clickable that behaves like a card.
  Compose with `cn()` from `@/lib/utils`.
- **Typography:** white text on the photo background. Headings
  `font-heading font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]`; page
  titles use `0.8` alpha in the shadow. Secondary copy `text-white/60`,
  tertiary `text-white/40`. Every currency and percentage figure carries
  `tabular-nums`.
- **Nested surfaces:** `rounded-xl border border-white/15 bg-white/5 p-4`.
  Dividers `border-white/10`.
- **Accent palette:** positive emerald (`#34d399`, `text-emerald-300`,
  `bg-emerald-500/10`), warning amber (`text-amber-300`,
  `bg-amber-500/10`), negative rose (`text-red-300`, `bg-red-500/10`),
  neutral/plan `rgba(255,255,255,0.55)`. Keep the plan series neutral and the
  actual series emerald in every chart, badge and table cell — one colour
  language across the whole section.
- **Primitives:** use `@/components/ui/*` only — `button`, `dialog`,
  `alert-dialog`, `select`, `tabs`, `table`, `badge`, `progress`, `label`,
  `input`, `textarea`, `dropdown-menu`, `separator`, `skeleton`. They are
  Base UI wrappers: `DialogTrigger` / `AlertDialogTrigger` take a
  `render={<Button … />}` prop rather than `asChild`. Money inputs use
  `@/components/staff/currency-input` (`CurrencyInput`), which renders a
  formatted display plus a hidden raw-digits field under `name`.
- **Motion (framer-motion):** entrance only, and restrained — stagger the KPI
  tiles ~40 ms apart, fade/slide the milestone rail in, animate the progress
  and chart series on mount. Respect `prefers-reduced-motion`. The section
  itself is already wrapped in `animate-fade-in-up` by the page; do not
  double up on it.
- **Toasts:** `toast` from `sonner`.
- **Icons:** `lucide-react`.

**Accessibility**
- Real `<table>` semantics with `<th scope>`; never a div grid pretending.
- Every icon-only button needs an `aria-label` from the message catalogue.
- Colour is never the only signal — pair every emerald/rose with an arrow,
  a sign, or a word.
- Charts get an `aria-label` summarising the series; the month table is the
  accessible equivalent of the chart.

---

## 7. Engineering rules (CI blocks on these)

`npm run verify` = `tsc --noEmit && eslint && next build`. It must stay green.

1. **Never `new Date().getFullYear()` / `getMonth()` / `getDate()` /
   `getDay()` / `getHours()` / `getMinutes()`.** ESLint hard-errors on it.
   Business time is Asia/Tashkent and the server clock is UTC. Use
   `src/lib/time.ts` (`tashkentYmd`, `tashkentDayKey`,
   `startOfTashkentMonthKey`, `tashkentMonthKey`, …). `new Date(explicit)`
   plus `getUTC*` is fine. In practice you should not need "now" at all —
   `isClosed` / `isCurrent` already carry it.
2. `react-hooks/set-state-in-effect`, `react-hooks/refs` and
   `react-hooks/immutability` are **warnings**, not errors. Prefer not to add
   new ones, but a mount-animation `useEffect` is acceptable.
3. Keep the section a **server component**. Push interactivity into small
   `'use client'` leaves under `src/components/income-roadmap/`. Recharts,
   framer-motion, `useActionState` and `useTransition` all require
   `'use client'`.
4. Do not write SQL in components — go through
   `getIncomeRoadmapData()`.
5. Do not add or change server actions, the migration, or anything outside
   `src/components/income-roadmap/*` (plus the optional `year` search-param
   pass-through in §3).
6. Every user-visible string comes from `next-intl` (`getTranslations` on the
   server, `useTranslations` in client leaves), namespace `incomeRoadmap`.
   No hardcoded English, Uzbek or Russian.
7. TypeScript strict: no `any`, no non-null `!` on data that can legitimately
   be null (`actual`, `variance`, `growthPct`, `attainmentPct`, `totals`).
   `null` means "not reported" and must render as `—`, never `0`.
8. `numeric` columns already arrive as JS `number`s — never re-parse them and
   never add `::float8` casts.
9. `formatUZS` tolerates `null`/`NaN` and degrades to `"0"`; still branch on
   `null` yourself so an unreported month reads as `—` rather than `0`.
10. Prettier: 2-space indent, single quotes, trailing commas, 100-col
    printWidth, `prettier-plugin-tailwindcss` class ordering.

---

## 8. i18n keys

Namespace `incomeRoadmap`. Add these to `messages/uz.json`, `messages/en.json`
and `messages/ru.json`. Keys already present keep their existing values.

| key | uz | en | ru |
|---|---|---|---|
| `title` | Daromadlar xaritasi | Income Roadmap | Карта доходов |
| `subtitle` | Yillik oylik daromad o'sishi rejasi va haqiqiy natijasi | The monthly income growth plan for the year, and how it actually went | План роста ежемесячного дохода на год и фактический результат |
| `year` | Yil | Year | Год |
| `years` | Yillar | Years | Годы |
| `noPlan` | Hali reja tuzilmagan. | No roadmap set yet. | План ещё не составлен. |
| `noPlanSelf` | Sizga hali daromad rejasi tuzilmagan. | You don't have an income roadmap yet. | Для вас ещё не составлен план доходов. |
| `createPlan` | Reja yaratish | Create plan | Создать план |
| `editPlan` | Rejani tahrirlash | Edit plan | Редактировать план |
| `deletePlan` | Rejani o'chirish | Delete roadmap | Удалить план |
| `confirmDeletePlanTitle` | Reja o'chirilsinmi? | Delete this roadmap? | Удалить этот план? |
| `confirmDeletePlanDescription` | Bu yilning butun oylik rejasi va bosqichlari o'chiriladi. | The whole monthly plan and every milestone for this year will be deleted. | Весь месячный план и все вехи за этот год будут удалены. |
| `planSaved` | Reja saqlandi. | Roadmap saved. | План сохранён. |
| `planDeleted` | Reja o'chirildi. | Roadmap deleted. | План удалён. |
| `baselineMonthlyIncome` | Boshlang'ich oylik daromad | Baseline monthly income | Базовый месячный доход |
| `targetYearEndIncome` | Yil oxiridagi maqsad | Year-end target | Цель на конец года |
| `notes` | Izoh | Notes | Заметки |
| `status.draft` | Qoralama | Draft | Черновик |
| `status.active` | Faol | Active | Активный |
| `status.archived` | Arxivlangan | Archived | В архиве |
| `monthlyPlan` | Oylik reja va fakt | Monthly plan vs actual | План и факт по месяцам |
| `editPlanCurve` | 12 oylik rejani tahrirlash | Edit the 12-month plan | Редактировать план на 12 месяцев |
| `planCurveSaved` | Oylik reja saqlandi. | Monthly plan saved. | Месячный план сохранён. |
| `fillFlat` | Bir xil qilib to'ldirish | Fill flat | Заполнить одинаково |
| `fillRamp` | Bosqichma-bosqich o'sish | Linear ramp | Линейный рост |
| `month` | Oy | Month | Месяц |
| `planned` | Reja | Planned | План |
| `actual` | Fakt | Actual | Факт |
| `variance` | Farq | Variance | Отклонение |
| `variancePct` | Farq, % | Variance % | Отклонение, % |
| `growth` | O'sish | Growth | Рост |
| `cumulativePlanned` | Jamlangan reja | Cumulative plan | План нарастающим итогом |
| `cumulativeActual` | Jamlangan fakt | Cumulative actual | Факт нарастающим итогом |
| `tabMonthly` | Oylik | Monthly | По месяцам |
| `tabCumulative` | Jamlangan | Cumulative | Нарастающим итогом |
| `notReported` | Kiritilmagan | Not reported | Не внесено |
| `recordActual` | Faktni kiritish | Record actual | Внести факт |
| `actualRecorded` | Fakt kiritildi. | Actual recorded. | Факт внесён. |
| `clearActual` | Faktni tozalash | Clear actual | Очистить факт |
| `confirmClearActualTitle` | Fakt tozalansinmi? | Clear this month's actual? | Очистить факт за месяц? |
| `confirmClearActualDescription` | Bu oy yana "kiritilmagan" holatiga qaytadi. | The month goes back to "not reported". | Месяц вернётся в состояние «не внесено». |
| `monthNote` | Oy izohi | Month note | Заметка к месяцу |
| `attainment` | Reja bajarilishi | Attainment to date | Выполнение плана |
| `avgMonthlyGrowth` | O'rtacha oylik o'sish | Avg. monthly growth | Средний рост в месяц |
| `projectedYearTotal` | Yillik prognoz | Projected year total | Прогноз за год |
| `plannedYear` | Yillik reja | Planned for the year | План на год |
| `ofPlanned` | {amount} rejadan | of {amount} planned | из {amount} по плану |
| `growthOnBaseline` | boshlang'ichdan +{percent}% | +{percent}% on baseline | +{percent}% к базе |
| `milestones` | Bosqichlar | Milestones | Вехи |
| `noMilestones` | Hali bosqich qo'shilmagan. | No milestones yet. | Вех пока нет. |
| `addMilestone` | Bosqich qo'shish | Add milestone | Добавить веху |
| `editMilestone` | Bosqichni tahrirlash | Edit milestone | Редактировать веху |
| `milestoneTitle` | Nomi | Title | Название |
| `targetMonth` | Maqsadli oy | Target month | Целевой месяц |
| `targetIncome` | Maqsadli daromad | Target income | Целевой доход |
| `criteria` | Buning uchun nima qilinadi | What it takes | Что для этого нужно |
| `criteriaPlaceholder` | masalan: yangi guruhlar ochish, o'quvchilar sonini oshirish, sotuvni kengaytirish | e.g. opening new groups, growing enrollment, expanding sales | например: открытие новых групп, рост набора, расширение продаж |
| `statusLabel` | Holati | Status | Статус |
| `milestoneStatus.planned` | Rejalashtirilgan | Planned | Запланировано |
| `milestoneStatus.in_progress` | Jarayonda | In progress | В процессе |
| `milestoneStatus.achieved` | Erishildi | Achieved | Достигнуто |
| `milestoneStatus.missed` | Bajarilmadi | Missed | Не выполнено |
| `milestoneAdded` | Bosqich qo'shildi. | Milestone added. | Веха добавлена. |
| `milestoneSaved` | Bosqich saqlandi. | Milestone saved. | Веха сохранена. |
| `milestoneDeleted` | Bosqich o'chirildi. | Milestone deleted. | Веха удалена. |
| `deleteMilestone` | Bosqichni o'chirish | Delete milestone | Удалить веху |
| `confirmDeleteTitle` | Bu bosqich o'chirilsinmi? | Delete this milestone? | Удалить эту веху? |
| `confirmDeleteDescription` | Bu bosqich butunlay o'chiriladi. | This milestone will be permanently deleted. | Веха будет удалена безвозвратно. |
| `confirm` | O'chirish | Delete | Удалить |
| `save` | Saqlash | Save | Сохранить |
| `chartAriaMonthly` | Oylik reja va fakt daromad grafigi | Monthly planned vs actual income chart | График планового и фактического дохода по месяцам |
| `chartAriaCumulative` | Jamlangan reja va fakt daromad grafigi | Cumulative planned vs actual income chart | График дохода нарастающим итогом |

Errors — `incomeRoadmap.errors.*`:

| key | uz | en | ru |
|---|---|---|---|
| `forbidden` | Buni qilishga ruxsatingiz yo'q. | You don't have permission to do this. | У вас нет прав на это действие. |
| `sessionExpired` | Sessiya tugadi — sahifani yangilab, qaytadan kiring. | Your session expired — please refresh the page and log in again. | Сессия истекла — обновите страницу и войдите снова. |
| `invalidInput` | Kiritilgan qiymatlarni tekshiring. | Please check the values you entered. | Проверьте введённые значения. |
| `notFound` | Bu yozuv topilmadi. | That record no longer exists. | Запись не найдена. |
| `createFailed` | Qo'shib bo'lmadi. Qaytadan urinib ko'ring. | Could not add. Please try again. | Не удалось добавить. Попробуйте снова. |
| `updateFailed` | Saqlab bo'lmadi. Qaytadan urinib ko'ring. | Could not save. Please try again. | Не удалось сохранить. Попробуйте снова. |
| `deleteFailed` | O'chirib bo'lmadi. Qaytadan urinib ko'ring. | Could not delete. Please try again. | Не удалось удалить. Попробуйте снова. |

Retired keys (safe to delete once the new UI ships): `steps`, `noSteps`,
`addStep`, `targetAmount`, `benefitDescription`,
`benefitDescriptionPlaceholder`, `stepAdded`, `markAchieved`, `achieved`,
`pending`, `deleteStep`, `baseMonthlyIncome`.

The section currently guards new keys with `t.has(key)` and an English
fallback so it renders correctly before the catalogue is updated. Once the
keys above are in `messages/*.json`, drop that helper and call `t()` directly.

---

## 9. Definition of done

- `npm run verify` is green.
- Empty, single-month-reported, fully-reported and past-year states all
  render correctly, in all three locales, on mobile and desktop.
- An employee viewing their own page sees zero management affordances.
- No `null` metric ever renders as `0`, `NaN`, `0%` or an empty cell.
- Nothing outside `src/components/income-roadmap/*` (and the optional `year`
  search-param pass-through) changed.
