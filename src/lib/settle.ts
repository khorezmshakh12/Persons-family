/** Runs a post-save side effect (Telegram notice, cash sync, read receipt)
 * inline, before the action returns, and swallows its error so a hiccup can
 * never fail a write that already committed.
 *
 * Replaces next/server's `after()` in Server Actions: Cloud Run runs with
 * CPU throttling (request-based billing, see cloudbuild.yaml), so the CPU
 * drops to ~0 the moment the response is sent and an `after()` callback
 * stalls mid-flight — the same reason tasks.ts already awaits its sends. */
export async function settle(task: () => unknown): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error('settle: side effect failed', error instanceof Error ? error.message : error);
  }
}
