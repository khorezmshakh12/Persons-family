import "server-only";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { GCP_PROJECT_ID } from "./credentials";

// V4 signed URLs need to sign a blob locally, which requires a private
// key — we don't have one (key creation is disabled by org policy).
// Route signing through IAM's signBlob API instead, impersonating the
// app-runtime service account (the caller needs
// roles/iam.serviceAccountTokenCreator on it, same as lib/gcp/session.ts's
// custom-token signing).
async function createAuthClient() {
  const auth = new GoogleAuth();
  const sourceClient = await auth.getClient();
  return new Impersonated({
    sourceClient,
    targetPrincipal: `app-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com`,
    lifetime: 3600,
    delegates: [],
    targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
}

let storagePromise: Promise<Storage> | undefined;
function getStorage(): Promise<Storage> {
  if (!storagePromise) {
    storagePromise = createAuthClient().then(
      (authClient) => new Storage({ projectId: GCP_PROJECT_ID, authClient })
    );
  }
  return storagePromise;
}

// Mirrors the original Supabase bucket ids 1:1.
export const BUCKETS = {
  avatars: "persons-staff-avatars",
  "lesson-files": "persons-staff-lesson-files",
  lesson_materials: "persons-staff-lesson-materials",
  chat_media: "persons-staff-chat-media",
  "contract-files": "persons-staff-contract-files",
  "issue-voice-notes": "persons-staff-issue-voice-notes",
} as const;

export type BucketKey = keyof typeof BUCKETS;

export async function createSignedReadUrl(
  bucketKey: BucketKey,
  path: string,
  ttlSeconds: number
): Promise<string> {
  const storage = await getStorage();
  const [url] = await storage
    .bucket(BUCKETS[bucketKey])
    .file(path)
    .getSignedUrl({ action: "read", expires: Date.now() + ttlSeconds * 1000 });
  return url;
}

// One-shot PUT upload URL — the direct analog of Supabase Storage's
// createSignedUploadUrl(), used for small files (avatars, voice notes)
// where a single request is simpler than the resumable protocol.
export async function createSignedWriteUrl(
  bucketKey: BucketKey,
  path: string,
  contentType: string,
  ttlSeconds = 600
): Promise<string> {
  const storage = await getStorage();
  const [url] = await storage
    .bucket(BUCKETS[bucketKey])
    .file(path)
    .getSignedUrl({
      action: "write",
      expires: Date.now() + ttlSeconds * 1000,
      contentType,
    });
  return url;
}

export async function createResumableUploadSession(
  bucketKey: BucketKey,
  path: string,
  contentType: string
): Promise<string> {
  const storage = await getStorage();
  const [uri] = await storage.bucket(BUCKETS[bucketKey]).file(path).createResumableUpload({
    metadata: { contentType },
  });
  return uri;
}

export async function deleteObject(bucketKey: BucketKey, path: string): Promise<void> {
  const storage = await getStorage();
  await storage.bucket(BUCKETS[bucketKey]).file(path).delete({ ignoreNotFound: true });
}

export async function getStorageClient(): Promise<Storage> {
  return getStorage();
}
