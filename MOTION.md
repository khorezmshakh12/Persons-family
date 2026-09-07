# Persons ERP Motion System

The Persons ERP motion system is a unified, spring-based interaction language built exclusively with `framer-motion`, Tailwind CSS v4, and modern CSS primitives. Designed for physical, tactile responsiveness, zero layout shift (CLS), 60fps performance, and complete accessibility via `prefers-reduced-motion: reduce`.

---

## 1. Core Design Tokens (`src/lib/motion.ts`)

All motion curves, springs, durations, and reusable variants are centralized in `src/lib/motion.ts`.

### Durations
| Token | Value | Purpose |
|---|---|---|
| `durations.fast` | `0.12s` | Micro-interactions, icon rotations, button tap releases |
| `durations.base` | `0.20s` | Standard fades, route transitions, dialog backdrops |
| `durations.slow` | `0.32s` | Stat counters, large container transitions |

### Spring Physics
| Token | Stiffness | Damping | Character | Usage |
|---|---|---|---|---|
| `springs.snappy` | 400 | 32 | Crisp, instantaneous, no overshoot | Tab pills (`layoutId`), reorders, list insertions |
| `springs.bouncy` | 520 | 20 | Energetic pop with tactile overshoot | Kanban drops, badges, star moments, modal pop-ins |
| `springs.gentle` | 210 | 26 | Smooth, natural expansion | Accordions, column collapse/expand |

### Easings
- `easings.standard`: `[0.2, 0, 0, 1]` — smooth deceleration for exits and standard elements.
- `easings.emphasized`: `[0.05, 0.7, 0.1, 1]` — expressive curve for entries and counters.

---

## 2. Shared Variants & Hooks

### Variants
- `fadeInUp`: Mounts with subtle `y: 12 -> 0` and opacity with `springs.snappy`.
- `popIn`: Scales `0.9 -> 1` with `springs.bouncy`.
- `staggerContainer`: Staggers child item entrances with `0.045s` delay between children.
- `accordion`: Height `0 -> auto` with `springs.gentle` and synchronized opacity.
- `overlayScrim`: Smooth backdrop blur `blur(0px) -> blur(16px)` and opacity.

### Hook: `useMotion()`
```tsx
import { useMotion } from '@/lib/motion';

function MyComponent() {
  const { shouldReduce, springs, durations, variants } = useMotion();

  return (
    <motion.div
      variants={variants.fadeInUp}
      initial="initial"
      animate="animate"
      transition={springs.snappy}
    >
      ...
    </motion.div>
  );
}
```

---

## 3. Surface Implementations

### 1. Kanban Cards (`src/components/tasks/task-card.tsx`, `src/components/issues/issue-card.tsx`)
- **Drop & Settle**: `springs.bouncy` on release.
- **Reordering**: `layout` animated with `springs.snappy`.
- **Delete / Exit**: Scale down and fade exit.
- **Status Glow Pulse**: Amber flash on `done`, teal flash on `in_progress`.

### 2. Collapsible Kanban Columns (`task-kanban-column.tsx`, `kanban-column.tsx`)
- **Spring Toggle**: `springs.gentle` width and height transitions.
- **Chevron Rotation**: Spring-based 180° rotation.
- **Child Stagger**: Cascading card entrance when expanding.

### 3. Dashboard Stat Cards (`src/components/dashboard/stat-card.tsx`)
- **Animated Number Counter**: Interpolated ease-out number ticking (`AnimatedCounter`).
- **Sparkline Bars**: Staggered vertical scale growth with delayed trend badge entrance.

### 4. Stat Panels (`issues-stats.tsx`, `task-stats.tsx`)
- **ScaleX Bar Growth**: Progress bars sweep horizontally from left to right.
- **Number Counting**: Synchronized stat count increments.

### 5. Monthly Archive Accordions (`src/components/tasks/monthly-archive.tsx`)
- **Natural Expansion**: `springs.gentle` height animation.
- **Row Staggering**: Smooth cascade of archived items.

### 6. Toasts (`src/components/ui/sonner.tsx`)
- **SVG Path Draw**: Animated `pathLength` checkmark drawing on success toasts.
- **Glass Panel Surface**: Frosted blur with tactile pop-in.

### 7. Buttons & Cards (`button.tsx`, `glass.ts`, `globals.css`)
- **Button Press**: `active:scale-[0.96]` with snappy spring.
- **Glass Card Hover**: `GLASS_INTERACTIVE` elevates with `hover:scale-[1.02] hover:-translate-y-0.5`.
- **Tap Scale**: Utility `.tap-scale` for non-Button interactive elements.

### 8. Dialogs & Modals (`dialog.tsx`, `alert-dialog.tsx`)
- **Backdrop Scrim**: `backdrop-blur-md` fade-in.
- **Content Pop**: `zoom-in-95` to `zoom-100` with `ease-snappy`.

### 9. Login Page (`auth-card.tsx`, `login-form.tsx`)
- **Staggered Form Mount**: Staggered `fadeInUp` fields.
- **Teal Focus Glow**: Soft radial teal ring on focus.
- **Auth Error Shake**: 4px horizontal spring shake on invalid credentials.

### 10. Star Rewards & Ledger (`star-burst.tsx`, `star-leaderboard.tsx`, `star-balance-card.tsx`)
- **Particle Burst**: 8-particle SVG star burst with GPU transforms.
- **Badge Pop**: Bouncy scale bounce on positive balance delta.
- **Animated Balances**: Counting numbers in leaderboard and profile ledger.

### 11. Sidebar Navigation (`sidebar-nav.tsx`)
- **Active Pill**: Framer Motion `layoutId` pill transition with `springs.snappy`.
- **Live Indicator Badge**: Bouncy `popIn` for unread notifications.

### 12. Route Transitions (`page-transition.tsx`)
- **Subtle Fade-Through**: Micro `y: 4 -> 0` translation and opacity crossfade under 200ms with zero CLS.

### 13. Skeletons (`skeleton.tsx`, `glass-skeletons.tsx`, `globals.css`)
- **Shimmer Sweep**: Smooth linear gradient wave (`.animate-shimmer`) across skeleton placeholders.

---

## 4. Accessibility & Performance Guardrails

1. **Accessibility**: All animations automatically respect `prefers-reduced-motion: reduce`, dropping durations to 0 or falling back to simple opacity fades.
2. **GPU Acceleration**: Uses `transform-gpu` and `will-change-transform` on heavy glass layers.
3. **No Layout Shifts**: Animations strictly use `transform` and `opacity` properties without altering document flow geometry.
