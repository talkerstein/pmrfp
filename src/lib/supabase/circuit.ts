/**
 * Per-instance circuit breaker for PUBLIC Supabase reads.
 *
 * Incident 2026-10-09: when the database slowed down, every page render kept
 * firing its reads (plus postgrest-js's own 3 retries and ours), each Vercel
 * function waited up to 300 s, and the pile-up kept the database pinned.
 * After a burst of failures this breaker makes public reads fail fast for a
 * short cool-down, so pages fall back to cached/stale data or empty states
 * instead of queueing more work on a struggling database.
 *
 * Scope: one serverless instance (module state). Only the cookieless anon
 * read client consults it; writes, auth and service-role jobs never do.
 */
const WINDOW_MS = 10_000;
const THRESHOLD = 5;
const OPEN_MS = 15_000;

let failures: number[] = [];
let openUntil = 0;

/** Named "AbortError" on purpose: postgrest-js never retries an abort. */
export class CircuitOpenError extends Error {
  constructor() {
    super("Supabase public reads paused after repeated failures (circuit open)");
    this.name = "AbortError";
  }
}

export function isCircuitOpen(now = Date.now()): boolean {
  return now < openUntil;
}

export function recordReadFailure(now = Date.now()): void {
  failures = failures.filter((t) => now - t < WINDOW_MS);
  failures.push(now);
  if (failures.length >= THRESHOLD && !isCircuitOpen(now)) {
    openUntil = now + OPEN_MS;
    failures = [];
    console.warn("supabase_read_circuit", { state: "open", forMs: OPEN_MS });
  }
}

export function recordReadSuccess(): void {
  failures = [];
}

/** A response that means "the database is in trouble", not "bad request". */
export function isServerFailure(status: number): boolean {
  return status >= 500;
}

/** Test helper. */
export function resetCircuit(): void {
  failures = [];
  openUntil = 0;
}
