import "server-only";
import { type App, getApps, initializeApp, applicationDefault } from "firebase-admin/app";

export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID!;

let app: App | undefined;

export function getFirebaseAdminApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  app = initializeApp({
    credential: applicationDefault(),
    projectId: GCP_PROJECT_ID,
    // Local dev uses ADC via `gcloud auth application-default login` (no
    // key file — key creation is disabled by org policy); Cloud Run uses
    // its attached service account. Both need to know which SA to sign
    // custom tokens as when not running directly as that SA (see
    // lib/gcp/storage.ts for the same reasoning applied to signed URLs).
    serviceAccountId: `app-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
  });
  return app;
}
