import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import type { SessionContext } from "@/lib/access/access";
import {
  isDuplicateTrialError,
  isMissingTableError,
  trialEndsAt,
  trialRefusal,
  trialState,
  type TrialRefusal,
  type TrialSource,
  type TrialState,
} from "./trial";

/**
 * Trial writes and the cron-side "who is Trade Pro" list. The per-visitor
 * check lives in computeTradeAccess (src/lib/access/access.ts); this file is
 * for things that run with the service role.
 */

export type StartTrialResult = { ok: true; trial: TrialState } | { ok: false; reason: Exclude<TrialRefusal, null> };

/**
 * Start the organization's one 14-day trial. Re-checks everything server
 * side (the session, the company type, not already paying, never had one);
 * the table's primary key stops a racing second click.
 */
export async function startOrgTrial(
  session: SessionContext | null,
  source: TrialSource,
  now: Date = new Date(),
  db: SupabaseClient | null = isServiceConfigured() ? createServiceClient() : null,
): Promise<StartTrialResult> {
  const org = session?.organization ?? null;
  if (!db) return { ok: false, reason: "unavailable" };
  const existing = org ? await readTrialRow(db, org.id) : { row: null, missing: false };
  if (existing.missing) return { ok: false, reason: "unavailable" };
  const refusal = trialRefusal({
    signedIn: Boolean(session),
    organizationType: org?.organization_type,
    organizationStatus: org?.status,
    paid: Boolean(session?.paid),
    existing: existing.row,
  });
  if (refusal) return { ok: false, reason: refusal };
  const startedAt = now.toISOString();
  const endsAt = trialEndsAt(now).toISOString();
  const { error } = await db.from("trade_trials").insert({
    organization_id: org!.id,
    started_by: session!.userId,
    started_at: startedAt,
    ends_at: endsAt,
    source,
  });
  if (error) {
    if (isDuplicateTrialError(error)) return { ok: false, reason: "used" };
    if (isMissingTableError(error)) return { ok: false, reason: "unavailable" };
    console.error("[trial] start failed", error.message);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, trial: trialState({ startedAt, endsAt }, now) };
}

async function readTrialRow(
  db: SupabaseClient,
  organizationId: string,
): Promise<{ row: { startedAt: string; endsAt: string } | null; missing: boolean }> {
  const { data, error } = await db
    .from("trade_trials")
    .select("started_at,ends_at")
    .eq("organization_id", organizationId)
    .maybeSingle<{ started_at: string; ends_at: string }>();
  if (error) return { row: null, missing: isMissingTableError(error) };
  return { row: data ? { startedAt: data.started_at, endsAt: data.ends_at } : null, missing: false };
}

/**
 * Organization ids on an active trial right now (service role). Empty when
 * the table doesn't exist yet. For crons that build "Trade Pro members"
 * lists from subscriptions: add these so a trial gets what Pro gets.
 */
export async function activeTrialOrgIds(db: SupabaseClient, now: Date = new Date()): Promise<Set<string>> {
  const { data, error } = await db.from("trade_trials").select("organization_id").gt("ends_at", now.toISOString()).limit(5000);
  if (error || !data) return new Set();
  return new Set((data as { organization_id: string }[]).map((r) => r.organization_id));
}
