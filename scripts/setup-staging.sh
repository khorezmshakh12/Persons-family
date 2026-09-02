#!/usr/bin/env bash
# One-time setup for the staging environment:
#   - an `app_staging` database on the existing Cloud SQL instance
#   - a `persons-staff-app-staging` Cloud Run service
#   - a Cloud Build trigger on the `staging` branch -> cloudbuild.staging.yaml
#
# Run once, from an account with project access (e.g. azizullahusman2).
# Re-running is mostly idempotent (it will error on things that already
# exist — that's fine, keep going).
set -euo pipefail

PROJECT=persons-staff-b01a83bd
REGION=europe-west3
INSTANCE=persons-staff-db
CONN="${PROJECT}:${REGION}:${INSTANCE}"
DB_PASSWORD="${DB_PASSWORD:?set DB_PASSWORD env var to the Cloud SQL postgres password}"
GITHUB_OWNER="${GITHUB_OWNER:-khorezmshakh12}"
GITHUB_REPO="${GITHUB_REPO:-Persons-family}"

echo "== 1. create the app_staging database =="
gcloud sql databases create app_staging --instance="$INSTANCE" --project="$PROJECT" || true

echo "== 2. copy the prod schema (structure only, no data) into app_staging =="
# Needs the Cloud SQL Auth Proxy on 127.0.0.1:5432 and pg_dump/psql on PATH.
if ! command -v pg_dump >/dev/null; then
  echo "!! pg_dump not found. Install postgresql-client, then re-run from step 2:"
  echo "   cloud-sql-proxy $CONN --port 5432 &"
  echo "   pg_dump --schema-only \"postgres://postgres:\$DB_PASSWORD@127.0.0.1:5432/app\" | \\"
  echo "     psql \"postgres://postgres:\$DB_PASSWORD@127.0.0.1:5432/app_staging\""
else
  ( cloud-sql-proxy "$CONN" --port 5432 & echo $! > /tmp/csp.pid ) ; sleep 6
  pg_dump --schema-only "postgres://postgres:${DB_PASSWORD}@127.0.0.1:5432/app" \
    | psql "postgres://postgres:${DB_PASSWORD}@127.0.0.1:5432/app_staging"
  # record the baseline so `npm run migrate` doesn't try to replay it
  DATABASE_URL="postgres://postgres:${DB_PASSWORD}@127.0.0.1:5432/app_staging" npx tsx scripts/migrate.ts
  kill "$(cat /tmp/csp.pid)" || true
fi

echo "== 3. first deploy of the staging Cloud Run service =="
gcloud run deploy persons-staff-app-staging \
  --source . --region "$REGION" --project "$PROJECT" --quiet \
  --add-cloudsql-instances "$CONN" \
  --set-env-vars "INSTANCE_CONNECTION_NAME=${CONN},DB_NAME=app_staging,DB_USER=postgres,DB_PASSWORD=${DB_PASSWORD},GCP_PROJECT_ID=${PROJECT}"
# NOTE: also copy the other runtime env vars the prod service has
# (IDENTITY_PLATFORM_API_KEY, TELEGRAM_BOT_TOKEN, CRON_SECRET, SSO_SHARED_SECRET,
#  AUTH_SYNTHETIC_EMAIL_DOMAIN, NEXT_PUBLIC_APP_URL=<staging url>, ...):
#   gcloud run services describe persons-staff-app --region $REGION --project $PROJECT \
#     --format='value(spec.template.spec.containers[0].env)'

STAGING_URL=$(gcloud run services describe persons-staff-app-staging \
  --region "$REGION" --project "$PROJECT" --format='value(status.url)')
echo "staging URL: $STAGING_URL"

echo "== 4. Cloud Build trigger on the 'staging' branch =="
gcloud builds triggers create github \
  --name=deploy-staging \
  --repo-name="$GITHUB_REPO" --repo-owner="$GITHUB_OWNER" \
  --branch-pattern='^staging$' \
  --build-config=cloudbuild.staging.yaml \
  --substitutions="_DB_PASSWORD=${DB_PASSWORD},_BASE_URL=${STAGING_URL}" \
  --project="$PROJECT" || true

echo
echo "Done. Also add _DB_PASSWORD to the existing prod trigger:"
echo "  gcloud builds triggers list --project=$PROJECT"
echo "  gcloud builds triggers update <PROD_TRIGGER> --project=$PROJECT \\"
echo "    --update-substitutions=_DB_PASSWORD=${DB_PASSWORD}"
