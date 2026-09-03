<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

Full workflow: **`DEVELOPMENT.md`**. The essentials:

- **Never commit to `main`.** It auto-deploys to production. Branch → PR → CI
  green → merge. Risky changes go through the `staging` branch first.
- Run `npm run verify` (`tsc --noEmit && eslint && next build`) before pushing.
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
