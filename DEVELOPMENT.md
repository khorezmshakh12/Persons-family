# Development & release workflow

The guardrails below exist because past updates shipped avoidable bugs:
`numeric` columns treated as strings, UTC vs Tashkent dates, stale auth
claims, unguarded DB writes, and changes going straight to production with
no check in between.

## Branch → PR → main

- **Never commit to `main` directly.** `main` auto-deploys to production
  (Cloud Build → Cloud Run).
- Work on a branch. Open a PR. GitHub Actions (`.github/workflows/ci.yml`)
  runs `tsc --noEmit`, `eslint`, and `next build` on every push/PR — it
  must be green to merge.
- For anything risky, push to the **`staging`** branch first. That deploys
  to `persons-staff-app-staging` (its own `app_staging` DB). Verify there,
  then merge to `main`.
- Touching `src/lib/auth/**`, `src/lib/db/**`, `src/lib/gcp/**`, or
  `src/proxy.ts`? Call it out in the PR description and review the diff
  line by line — that's where a small change breaks login for everyone.

## Before you push

```
npm run verify      # tsc --noEmit && eslint && next build
```

## Database migrations

- No ORM. Add a file: `supabase/migrations/<UTC timestamp>_<name>.sql`.
- Each file MUST be a self-contained transaction: start `begin;`, end
  `commit;`. Statements should be idempotent (`if not exists`, additive).
- `npm run migrate` applies pending files and records them in
  `schema_migrations`. `npm run migrate:dry` lists them without changing
  anything. Cloud Build runs `migrate` **before** the deploy, so the schema
  is never behind the code.
- Files at or before `20260901000000` are "baseline" — recorded as applied
  without executing (they describe what was already live when the runner
  was adopted).
- Take a backup before a destructive migration:
  `gcloud sql backups create --instance=persons-staff-db --project=persons-staff-b01a83bd`

## The recurring bug classes — and where they're now handled

| Class | Guardrail |
|---|---|
| `numeric` → string (`"0"+"5000"`, `NaN`) | `db/client.ts` parses `numeric` to `number`. Don't undo this. |
| UTC vs Asia/Tashkent dates | Use `src/lib/time.ts` (`tashkentYmd`, `tashkentDayKey`, `startOfTashkentMonthKey`, …). `eslint` bans `new Date().getX()` in `src/**`. |
| Unguarded DB writes | Wrap every `sql\`…\`` write in try/catch, return `{ error: 'code' }`. Never let it throw out of a Server Action. |
| Stale Identity Platform claims | Any code that changes `profiles.role` / `must_change_password` must also `setUserClaims` + `revokeUserSessions`. |
| Missing authz on an action | Every mutating Server Action re-checks auth itself (`requireCeo()` / an explicit role check) — a page guard is not enough. |

## Deploy / rollback

- `main` push → Cloud Build (`cloudbuild.yaml`): verify → migrate → deploy → smoke.
- A failed **smoke** step turns the build red but the deploy already
  happened — roll back:
  ```
  gcloud run services update-traffic persons-staff-app --region europe-west3 \
    --project persons-staff-b01a83bd --to-revisions PREVIOUS_REVISION=100
  ```
- Full lockout: `MAINTENANCE_MODE=true` env var on the Cloud Run service
  (see `src/proxy.ts`).

## Health

`GET /staff/api/health` → `{ status: "ok", db: true }`. Answers even in
maintenance mode. Used by the post-deploy smoke check.
