# Multi-stage build producing Next.js's "standalone" output (see
# next.config.ts's output: "standalone") — a self-contained server
# bundle that only carries the production dependency subset actually
# reachable from the app, instead of shipping full node_modules.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build evaluates every route module at "collecting page data" time
# (not just type-checks it), so lib/db/client.ts's top-level `sql` export
# needs *a* DATABASE_URL string present to construct without throwing —
# postgres-js doesn't actually open a connection until the first query
# runs, and none of this app's routes are statically pre-rendered with
# DB reads (all dynamic, per `next build`'s own route listing), so this
# placeholder is never used for a real connection. The real value is
# injected at container runtime via Cloud Run env vars/secrets instead.
ENV DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder?sslmode=disable"
ENV GCP_PROJECT_ID="persons-staff-b01a83bd"
# NEXT_PUBLIC_ vars are inlined into the client bundle at build time, not
# read from Cloud Run's runtime env vars — these must be the real values,
# not placeholders, or every browser-side Firebase call fails at runtime
# with no way to fix it short of rebuilding.
ENV NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyC3A8aOcsuhhmbE8QOkAIGBXplaeN8pxqw"
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID="persons-staff-b01a83bd"
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="persons-staff-b01a83bd.firebaseapp.com"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Cloud Run injects PORT; next start (via the standalone server.js)
# listens on it automatically.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["node", "server.js"]
