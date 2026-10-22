/**
 * Change log for imported tenders (depth plan, Step 2, block 5):
 * "Updated 2026-10-20: closing date moved from Oct 18 to Oct 25."
 *
 * Only listings PMRFP actually reads (the public-tender importers in
 * lib/tenders/sync.ts) are recorded, and only three things: the closing
 * date, the title and the status. A listing on a platform we never read
 * (bids&tenders, Bonfire, MERX, BC Bid) has no log: its page says to check
 * the official posting for addenda. Nothing is recorded for a new listing
 * (nothing changed yet) or for a row whose update failed.
 *
 * Pure diffing and row-building here; the importer calls recordRfpChanges
 * after it has updated the row, and the detail page calls loadRfpChanges.
 * Table: public.rfp_changes (migration 20261022000300).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isMissingTableError } from "@/lib/entitlement/trial";

export const CHANGE_FIELDS = ["closing_date", "title", "status"] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export interface DetectedChange {
  field: ChangeField;
  oldValue: string;
  newValue: string;
}

export interface RfpChange extends DetectedChange {
  /** ISO timestamp the importer saw it. */
  at: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Title with case, spacing and punctuation folded away, so a re-flowed title is not a "change". */
export function titleKey(t: string | null | undefined): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * What changed between the stored row and the feed's version of it. Closing
 * date: only a move from one real date to another (a feed that drops the date
 * for a day is not a change). Title: only when the words differ, not the
 * spacing or capitals. Status: only when both are known.
 */
export function diffListing(
  prior: { title: string | null; deadline: string | null; status?: string | null },
  next: { title: string | null; deadline: string | null; status?: string | null },
): DetectedChange[] {
  const out: DetectedChange[] = [];
  const a = prior.deadline?.slice(0, 10) ?? "";
  const b = next.deadline?.slice(0, 10) ?? "";
  if (ISO_DAY.test(a) && ISO_DAY.test(b) && a !== b) out.push({ field: "closing_date", oldValue: a, newValue: b });
  if (prior.title && next.title && titleKey(prior.title) && titleKey(prior.title) !== titleKey(next.title)) {
    out.push({ field: "title", oldValue: prior.title.trim().slice(0, 500), newValue: next.title.trim().slice(0, 500) });
  }
  if (prior.status && next.status && prior.status !== next.status) out.push({ field: "status", oldValue: prior.status, newValue: next.status });
  return out;
}

/**
 * More title changes than this from one source in one run means the importer's
 * own title cleaning changed (not the buyers' titles): record none of them.
 */
export const TITLE_FLOOD_LIMIT = 25;

export interface PendingChange extends DetectedChange {
  rfpId: string;
  slug: string;
  sourceKey: string;
}

/** Drops one source's title changes when there are suspiciously many (a parser change, not edits). */
export function withoutTitleFlood(changes: readonly PendingChange[], limit = TITLE_FLOOD_LIMIT): PendingChange[] {
  const titles = new Map<string, number>();
  for (const c of changes) if (c.field === "title") titles.set(c.sourceKey, (titles.get(c.sourceKey) ?? 0) + 1);
  return changes.filter((c) => c.field !== "title" || (titles.get(c.sourceKey) ?? 0) <= limit);
}

export interface ChangeRow {
  rfp_id: string;
  slug: string;
  field: ChangeField;
  old_value: string;
  new_value: string;
  source_key: string;
}

export function changeRows(changes: readonly PendingChange[]): ChangeRow[] {
  return changes.map((c) => ({
    rfp_id: c.rfpId,
    slug: c.slug,
    field: c.field,
    old_value: c.oldValue,
    new_value: c.newValue,
    source_key: c.sourceKey,
  }));
}

type Service = ReturnType<typeof createServiceClient>;

/**
 * Writes the rows. Safe to repeat (the table is unique on the listing, the
 * field, both values and the Toronto day, and duplicates are ignored). Never
 * throws: the log is a nice-to-have and must not fail an import. Returns how
 * many rows it sent.
 */
export async function recordRfpChanges(db: Service, changes: readonly PendingChange[]): Promise<number> {
  const rows = changeRows(changes);
  if (!rows.length) return 0;
  let sent = 0;
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db
        .from("rfp_changes")
        .upsert(rows.slice(i, i + 200), { onConflict: "rfp_id,field,old_value,new_value,change_day", ignoreDuplicates: true });
      if (error) {
        // Before the migration runs there is no table: say so once and carry on.
        console.warn(`[rfp-changes] not recorded: ${isMissingTableError(error) ? "table missing (migration 20261022000300 not applied)" : error.message}`);
        return sent;
      }
      sent += Math.min(200, rows.length - i);
    }
  } catch (e) {
    console.warn("[rfp-changes] not recorded:", e instanceof Error ? e.message : e);
  }
  return sent;
}

const SHOWN = 6;
const READ_TIMEOUT_MS = 3_000;

/** The newest changes for one listing (a one-row-per-change, indexed read; never a table scan). */
export async function loadRfpChanges(slug: string): Promise<RfpChange[]> {
  if (!isServiceConfigured()) return [];
  try {
    const { data, error } = await createServiceClient()
      .from("rfp_changes")
      .select("field,old_value,new_value,changed_at")
      .eq("slug", slug)
      .order("changed_at", { ascending: false })
      .limit(SHOWN)
      // A slow read must never hold the page: no log is better than a late page.
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (error || !data) return [];
    return (data as { field: string; old_value: string; new_value: string; changed_at: string }[])
      .filter((r): r is typeof r & { field: ChangeField } => (CHANGE_FIELDS as readonly string[]).includes(r.field))
      .map((r) => ({ field: r.field, oldValue: r.old_value, newValue: r.new_value, at: r.changed_at }));
  } catch {
    return [];
  }
}
