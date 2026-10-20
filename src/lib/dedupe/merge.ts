/**
 * Merge two company listings (admin only, /admin/duplicates).
 *
 * The OLDER listing stays primary. Everything that points at the duplicate
 * is moved to the primary, table by table, without ever breaking a unique
 * key: a row the primary already has an equivalent of (same member, same
 * category, same RFP interest, same karma event…) is left on the
 * duplicate. The duplicate is never deleted: it's marked status 'deleted',
 * hidden from the directory, and points at the primary (merged_into), so
 * the merge can be followed and anything left behind is still there.
 * Each step is idempotent, so a merge that stops halfway can be run again.
 *
 * Subscriptions are special: one per company. If only the duplicate pays,
 * its subscription moves; if both have one, nothing moves and the report
 * says so (sort it out in Stripe; we never cancel anything here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "./review";

export type MergeStep =
  /** Plain move: no unique key involves the column. */
  | { table: string; column: string; mode: "move" }
  /** Move rows whose `key` columns don't already exist on the primary. */
  | { table: string; column: string; mode: "move_unique"; key: string[] }
  /** One row per company (the column is the primary key): move only if the primary has none. */
  | { table: string; column: string; mode: "single" };

/**
 * Every table that points at organizations (migrations up to
 * 20261019000001). Members are handled first and separately (owner roles).
 */
export const MERGE_PLAN: MergeStep[] = [
  { table: "organization_categories", column: "organization_id", mode: "move_unique", key: ["category_id"] },
  { table: "organization_regions", column: "organization_id", mode: "move_unique", key: ["region_id"] },
  { table: "organization_property_types", column: "organization_id", mode: "move_unique", key: ["property_type_id"] },
  { table: "rfp_posts", column: "posted_by_organization_id", mode: "move" },
  { table: "saved_rfps", column: "organization_id", mode: "move" },
  { table: "rfp_interests", column: "trade_organization_id", mode: "move_unique", key: ["rfp_id"] },
  { table: "contact_requests", column: "target_organization_id", mode: "move" },
  { table: "profile_views", column: "organization_id", mode: "move" },
  { table: "rfp_views", column: "organization_id", mode: "move" },
  { table: "case_studies", column: "organization_id", mode: "move" },
  { table: "case_study_share_links", column: "organization_id", mode: "move" },
  { table: "vendor_reviews", column: "organization_id", mode: "move" },
  { table: "review_invites", column: "organization_id", mode: "move" },
  { table: "trusted_lists", column: "organization_id", mode: "move" },
  { table: "trusted_list_items", column: "organization_id", mode: "move_unique", key: ["owner_id"] },
  { table: "job_posts", column: "organization_id", mode: "move" },
  { table: "talent_endorsements", column: "organization_id", mode: "move_unique", key: ["talent_user_id"] },
  { table: "talent_contacts", column: "organization_id", mode: "move" },
  { table: "marketplace_listings", column: "organization_id", mode: "move" },
  { table: "forum_profiles", column: "organization_id", mode: "move" },
  { table: "karma_events", column: "org_id", mode: "move_unique", key: ["kind", "source_type", "source_id", "actor_id"] },
  { table: "winner_claims", column: "organization_id", mode: "move" },
  { table: "insight_brief_log", column: "organization_id", mode: "move" },
  { table: "signup_attribution", column: "org_id", mode: "move" },
  { table: "lifecycle_sends", column: "organization_id", mode: "move" },
  { table: "organization_join_requests", column: "organization_id", mode: "move_unique", key: ["user_id", "status"] },
  { table: "subscriptions", column: "organization_id", mode: "single" },
  { table: "trade_trials", column: "organization_id", mode: "single" },
  { table: "intel_access", column: "organization_id", mode: "single" },
  // Totals are recomputed from karma_events by the karma sync; keep the primary's row.
  { table: "org_karma", column: "org_id", mode: "single" },
];

export interface MergeStepResult {
  table: string;
  moved: number;
  /** Rows left on the duplicate because the primary already had one. */
  kept: number;
  skipped?: "missing_table";
  error?: string;
}

export interface MergeReport {
  primaryId: string;
  duplicateId: string;
  members: { moved: number; kept: number; demotedOwners: number };
  steps: MergeStepResult[];
  warnings: string[];
  ok: boolean;
}

type Row = Record<string, unknown>;

function keyOf(row: Row, cols: string[]): string {
  return cols.map((c) => JSON.stringify(row[c] ?? null)).join("|");
}

/** Update the rows matching `match` (all equalities) to point at `primaryId`. */
async function moveRows(db: SupabaseClient, table: string, column: string, duplicateId: string, primaryId: string, match: Row = {}) {
  let q = db.from(table).update({ [column]: primaryId }).eq(column, duplicateId);
  for (const [c, v] of Object.entries(match)) q = v === null ? q.is(c, null) : q.eq(c, v as string);
  return q.select(column);
}

async function runStep(db: SupabaseClient, step: MergeStep, duplicateId: string, primaryId: string): Promise<MergeStepResult> {
  const { table, column } = step;
  if (step.mode === "move") {
    const { data, error } = await moveRows(db, table, column, duplicateId, primaryId);
    if (error) return isMissingRelation(error) ? { table, moved: 0, kept: 0, skipped: "missing_table" } : { table, moved: 0, kept: 0, error: error.message };
    return { table, moved: (data ?? []).length, kept: 0 };
  }

  if (step.mode === "single") {
    const { data: existing, error } = await db.from(table).select(column).eq(column, primaryId).limit(1);
    if (error) return isMissingRelation(error) ? { table, moved: 0, kept: 0, skipped: "missing_table" } : { table, moved: 0, kept: 0, error: error.message };
    const { data: dup, error: dupErr } = await db.from(table).select(column).eq(column, duplicateId).limit(1);
    if (dupErr) return { table, moved: 0, kept: 0, error: dupErr.message };
    if (!(dup ?? []).length) return { table, moved: 0, kept: 0 };
    if ((existing ?? []).length) return { table, moved: 0, kept: 1 };
    const { data: moved, error: moveErr } = await moveRows(db, table, column, duplicateId, primaryId);
    if (moveErr) return { table, moved: 0, kept: 0, error: moveErr.message };
    return { table, moved: (moved ?? []).length, kept: 0 };
  }

  // move_unique
  const cols = step.key.join(",");
  const [{ data: onPrimary, error: e1 }, { data: onDup, error: e2 }] = await Promise.all([
    db.from(table).select(cols).eq(column, primaryId),
    db.from(table).select(cols).eq(column, duplicateId),
  ]);
  const err = e1 ?? e2;
  if (err) return isMissingRelation(err) ? { table, moved: 0, kept: 0, skipped: "missing_table" } : { table, moved: 0, kept: 0, error: err.message };
  const taken = new Set(((onPrimary ?? []) as unknown as Row[]).map((r) => keyOf(r, step.key)));
  let moved = 0;
  let kept = 0;
  for (const row of (onDup ?? []) as unknown as Row[]) {
    const k = keyOf(row, step.key);
    if (taken.has(k)) {
      kept++;
      continue;
    }
    const match = Object.fromEntries(step.key.map((c) => [c, row[c] ?? null]));
    const { data, error } = await moveRows(db, table, column, duplicateId, primaryId, match);
    if (error) return { table, moved, kept, error: error.message };
    moved += (data ?? []).length;
    taken.add(k);
  }
  return { table, moved, kept };
}

interface MemberRow {
  user_id: string;
  role: string;
}

/** Members first: anyone not already on the primary moves; a second owner becomes an admin. */
async function moveMembers(db: SupabaseClient, duplicateId: string, primaryId: string): Promise<MergeReport["members"] & { error?: string }> {
  const [{ data: onPrimary, error: e1 }, { data: onDup, error: e2 }] = await Promise.all([
    db.from("organization_members").select("user_id,role").eq("organization_id", primaryId),
    db.from("organization_members").select("user_id,role").eq("organization_id", duplicateId),
  ]);
  if (e1 || e2) return { moved: 0, kept: 0, demotedOwners: 0, error: (e1 ?? e2)!.message };
  const primaryMembers = (onPrimary ?? []) as MemberRow[];
  const present = new Set(primaryMembers.map((m) => m.user_id));
  let primaryHasOwner = primaryMembers.some((m) => m.role === "owner");
  let moved = 0;
  let kept = 0;
  let demotedOwners = 0;
  for (const m of (onDup ?? []) as MemberRow[]) {
    if (present.has(m.user_id)) {
      kept++;
      continue;
    }
    const demote = m.role === "owner" && primaryHasOwner;
    const patch: Row = { organization_id: primaryId, ...(demote ? { role: "admin" } : {}) };
    const { error } = await db.from("organization_members").update(patch).eq("organization_id", duplicateId).eq("user_id", m.user_id);
    if (error) return { moved, kept, demotedOwners, error: error.message };
    moved++;
    if (demote) demotedOwners++;
    if (m.role === "owner") primaryHasOwner = true;
    present.add(m.user_id);
  }
  return { moved, kept, demotedOwners };
}

export async function mergeOrganizations(
  db: SupabaseClient,
  opts: { primaryId: string; duplicateId: string },
): Promise<MergeReport> {
  const { primaryId, duplicateId } = opts;
  const warnings: string[] = [];
  if (primaryId === duplicateId) throw new Error("Cannot merge a company into itself.");

  const members = await moveMembers(db, duplicateId, primaryId);
  if (members.error) warnings.push(`organization_members: ${members.error}`);

  const steps: MergeStepResult[] = [];
  for (const step of MERGE_PLAN) {
    const r = await runStep(db, step, duplicateId, primaryId);
    steps.push(r);
    if (r.error) warnings.push(`${r.table}: ${r.error}`);
    if (step.table === "subscriptions" && r.kept) {
      warnings.push("Both companies have a subscription row. The duplicate's was left in place: check Stripe before cancelling anything.");
    }
  }

  // Retire the duplicate (kept, hidden, pointing at the primary).
  const retire = { status: "deleted", profile_status: "suspended", featured: false };
  let { error: retireErr } = await db.from("organizations").update({ ...retire, merged_into: primaryId }).eq("id", duplicateId);
  if (retireErr && isMissingRelation(retireErr)) {
    // Before the migration: no merged_into column. The audit log records the link.
    ({ error: retireErr } = await db.from("organizations").update(retire).eq("id", duplicateId));
  }
  if (retireErr) warnings.push(`organizations: ${retireErr.message}`);

  const ok = !members.error && !retireErr && steps.every((s) => !s.error);
  return {
    primaryId,
    duplicateId,
    members: { moved: members.moved, kept: members.kept, demotedOwners: members.demotedOwners },
    steps,
    warnings,
    ok,
  };
}

/** The older of two listings stays primary. */
export function pickPrimary<T extends { id: string; created_at: string }>(x: T, y: T): { primary: T; duplicate: T } {
  return x.created_at <= y.created_at ? { primary: x, duplicate: y } : { primary: y, duplicate: x };
}
