<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Full workflow: **`DEVELOPMENT.md`**. The essentials:

- **Never commit to `main`.** It auto-deploys to production. Branch → PR → CI
  green → merge. Risky changes go through the `staging` branch first.
- Run `npm run verify` (`tsc --noEmit && eslint && npm test && next build`)
  before pushing. `npm test` runs `tests/*.test.ts` (unit tests + static
  guardrails — no DB needed).
- **Do not touch `src/lib/auth/**`, `src/lib/db/**`, `src/lib/gcp/**`, or
  `src/proxy.ts` outside the task you were asked to do**, and flag any change
  to them for review. That is where a stray edit logs everyone out.

## Known bug classes — respect the guardrails

- `db/client.ts` parses `numeric` columns to JS `number`. Do not revert it,
  and don't re-add `::float8` casts that only worked around the old string
  behaviour.
- Business time is **Asia/Tashkent**, the server clock is UTC. Use
  `src/lib/time.ts` — never `new Date().getMonth()/getFullYear()/getDate()`
  (eslint blocks it).
- Every mutating Server Action: wrap DB writes in try/catch → `{ error }`,
  re-check auth itself, and if it changes `profiles.role` /
  `must_change_password`, also `setUserClaims` + `revokeUserSessions`.
- Schema changes: add `supabase/migrations/<timestamp>_<name>.sql` (a
  self-contained `begin; … commit;`), never hand-run SQL. `npm run migrate`.
- **`useEffect` render loops.** `useRouter()` from `@/i18n/navigation`
  returns a NEW object every render, so `useEffect(() => { … router.refresh() },
  [router])` re-arms itself forever — an unbounded `POST /<page>` + RSC
  storm that CI (`tsc`/`eslint`/`next build`) does not catch. Any effect that
  calls a Server Action or `router.refresh()` must run mount-only (`[]` + a
  ran-once ref) and should no-op when nothing changed (the `mark-*-seen`
  helpers return a `boolean` for exactly this). Never put `router`, or any
  hook result that isn't provably stable, in a dep array alongside a call
  that re-renders.
- **Auth: use `getAuthState()`, never the raw cookie check.**
  `getCurrentUser()` (lib/gcp/session.ts) only verifies the cookie
  signature — it does not check `is_active` or revoked sessions, so a
  deactivated or signed-out user sails through. eslint blocks importing it
  outside `lib/auth/session.ts`, `actions/auth.ts` and `audit-log.ts`.
  Every exported Server Action must call an auth check (`getAuthState` /
  `require*`) — `tests/guards.test.ts` fails otherwise.
- **Session revocation is enforced by `profiles.sessions_revoked_at`**, which
  `revokeUserSessions()` stamps and `getAuthState()` compares against the
  cookie's `iat`. Never call `revokeUserSessions()` (default `stampDb: true`)
  from inside a `sql.begin` that has written that user's `profiles` row — the
  stamp runs on another connection and deadlocks on the row lock. Pass
  `{ stampDb: false }` there (see `freezeIfBalanceCritical`).
- **A redirect to `/login` from the page layer must carry a `reason`**
  query param. The proxy only verifies the cookie signature, so without it it
  bounces a still-valid-but-rejected cookie from `/login` back to
  `/dashboard` — an infinite redirect loop.
- **Deleting a profile.** Many tables reference `profiles(id)` without
  `on delete cascade` (star ledger, orders, comments, attachments…). Use
  `removeStaffAccount()` (lib/staff-removal.ts): profile row first, login
  second, deactivate on FK violation. Never delete the Identity Platform
  user before the profile row is gone.
- **Guarded state transitions must check the row count.** An
  `update … where status = 'submitted'` that matched 0 rows means someone
  else already decided; bail out (`if (res.count === 0) return { error }`)
  instead of running the follow-up side effects (stars, notifications).
- **Stars: stamp + ledger row in one `sql.begin`.** Any "settle once" stamp
  (`star_penalty_applied_at`, `star_awarded_at`, …) must commit together
  with its `insertStarTransaction` row. Read-then-write on a balance or a
  running total needs a row lock (`select … for update`) on the owner —
  per *user* for balances, not per item.
- **"Latest N rows":** `order by x asc limit N` returns the *oldest* N.
  Use `order by x desc limit N` in a subquery and re-sort `asc` outside it.
  eslint flags `asc limit` in SQL templates.

## UI: Persons Aurora design system

The UI is **Persons Aurora** (light, warm) — the old glassmorphism over photo
backgrounds is gone. Rules and tokens: `docs/AURORA_DESIGN_SYSTEM.md`;
tokens live in `src/app/aurora.css`, class sets in `src/lib/glass.ts`
(`SURFACE_*`, `BTN_*`, `CHIP_*`; the old `GLASS_*` names are aliases).
Never reintroduce `backdrop-blur`, `bg-white/10`, `border-white/*` or
`text-white` on light surfaces, and never hard-code hex colours in
components — use `au-*` utilities / `var(--au-*)`.
