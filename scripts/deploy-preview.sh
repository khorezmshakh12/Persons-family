#!/usr/bin/env bash
# Deploy the current checkout as a NO-TRAFFIC tagged revision of the
# production service: real data, real login, but nobody is routed to it.
#
#   scripts/deploy-preview.sh [tag]      # tag defaults to the branch name
#
# Prints the preview URL (https://<tag>---persons-staff-app-….run.app/staff).
# Anything done there is REAL (same database) — look, don't change.
# Migrations are NOT run here: a branch that adds one must reach prod via
# main (cloudbuild.yaml), or the preview will query columns that don't exist.
set -euo pipefail

REGION=europe-west3
SERVICE=persons-staff-app
TAG="${1:-$(git rev-parse --abbrev-ref HEAD)}"
TAG="$(echo "$TAG" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | cut -c1-40 | sed 's/-*$//')"

if git diff --name-only origin/main...HEAD -- supabase/migrations | grep -q .; then
  echo "warning: this branch adds migrations that the preview will NOT apply:" >&2
  git diff --name-only origin/main...HEAD -- supabase/migrations >&2
fi

gcloud run deploy "$SERVICE" --source=. --region="$REGION" \
  --no-traffic --tag="$TAG" --no-cpu-throttling --quiet

gcloud run services describe "$SERVICE" --region="$REGION" \
  --format="value(status.traffic[].url)" | tr ';' '\n' | grep -- "$TAG---" | sed 's|$|/staff/uz/dashboard|'
