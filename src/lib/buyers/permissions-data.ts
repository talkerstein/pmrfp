import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BUYER_PERMISSIONS_TAG } from "@/lib/supabase/public-cache";
import { createSingleFlight } from "@/lib/concurrency";
import { isMissingTableError } from "@/lib/entitlement/trial";
import {
  PERMISSION_METHODS,
  PERMISSION_STATUSES,
  mergePermissions,
  seedRegistry,
  type BuyerPermission,
  type PermissionMethod,
  type PermissionRegistry,
  type PermissionStatus,
} from "./permissions";

/**
 * The permission registry from the database, merged over the code seed
 * (lib/buyers/permissions). Two readers:
 *
 *  - loadPermissionRegistry(service client): the daily cron and admin. Full
 *    rows, one small query per run. A missing table (migration
 *    20261021000010 not applied) means "the seed alone".
 *  - getBuyerPermissionSnapshot(): pages. ONE shared, server-cached copy of
 *    the public view (slug, scope, status, method, date: no contacts or
 *    quotes), same rule as the board and sponsor snapshots (PR #136). Tag
 *    "buyer-permissions", 10 minutes; admin writes expire it at once
 *    (lib/supabase/write-fetch).
 */

export interface PermissionRow {
  buyer_slug: string;
  buyer_name?: string | null;
  province_code?: string | null;
  scope: string;
  hosts?: string[] | null;
  status: string;
  method: string | null;
  granted_on: string | null;
  contact?: string | null;
  reply_quote?: string | null;
  notes?: string | null;
}

const isStatus = (s: string): s is PermissionStatus => (PERMISSION_STATUSES as readonly string[]).includes(s);
const isMethod = (s: string | null): s is PermissionMethod => s != null && (PERMISSION_METHODS as readonly string[]).includes(s);

/** A table or view row → BuyerPermission; null for a malformed row. */
export function fromPermissionRow(r: PermissionRow): BuyerPermission | null {
  if (!r.buyer_slug || !isStatus(r.status) || (r.scope !== "buyer" && r.scope !== "platform")) return null;
  return {
    buyerSlug: r.buyer_slug,
    buyerName: r.buyer_name ?? r.buyer_slug,
    provinceCode: r.province_code ?? null,
    country: "CA",
    scope: r.scope,
    hosts: r.hosts ?? [],
    status: r.status,
    method: isMethod(r.method) ? r.method : null,
    grantedOn: r.granted_on ? r.granted_on.slice(0, 10) : null,
    contact: r.contact ?? null,
    quote: r.reply_quote ?? null,
    notes: r.notes ?? null,
    origin: "db",
  };
}

const FULL_COLUMNS = "buyer_slug,buyer_name,province_code,scope,hosts,status,method,granted_on,contact,reply_quote,notes";

/** Seed + every buyer_permissions row (service role). Never throws: on any error, the seed. */
export async function loadPermissionRegistry(db: Pick<SupabaseClient, "from">): Promise<{ registry: PermissionRegistry; tableMissing: boolean }> {
  try {
    const { data, error } = await db.from("buyer_permissions").select(FULL_COLUMNS).limit(2000);
    if (error) {
      if (!isMissingTableError(error)) console.error("[buyer-permissions] read failed:", error.message);
      return { registry: seedRegistry(), tableMissing: isMissingTableError(error) };
    }
    const rows = ((data ?? []) as PermissionRow[]).map(fromPermissionRow).filter((p): p is BuyerPermission => !!p);
    return { registry: mergePermissions(rows), tableMissing: false };
  } catch (err) {
    console.error("[buyer-permissions] read failed:", err instanceof Error ? err.message : err);
    return { registry: seedRegistry(), tableMissing: false };
  }
}

export const BUYER_PERMISSIONS_REVALIDATE = 21600;
const READ_TIMEOUT_MS = 8_000;
const singleFlight = createSingleFlight();

async function fetchPublicPermissions(): Promise<PermissionRow[]> {
  const { data, error } = await createReadClient()
    .from("buyer_permissions_public")
    .select("buyer_slug,scope,status,method,granted_on")
    .limit(2000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(`buyer_permissions_public: ${error.message}`);
  return (data ?? []) as PermissionRow[];
}

const cachedPublicPermissions = unstable_cache(
  async (_projectUrl: string): Promise<PermissionRow[]> => singleFlight("buyer-permissions", fetchPublicPermissions),
  ["buyer-permissions-public-v1"],
  { tags: [BUYER_PERMISSIONS_TAG], revalidate: BUYER_PERMISSIONS_REVALIDATE },
);

/**
 * The registry for pages, once per request and from the data cache across
 * requests. The seed alone without Supabase or before the migration runs.
 */
export const getBuyerPermissionSnapshot = cache(async (): Promise<PermissionRegistry> => {
  if (!isSupabaseConfigured()) return seedRegistry();
  try {
    const rows = await cachedPublicPermissions(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return mergePermissions(rows.map(fromPermissionRow).filter((p): p is BuyerPermission => !!p));
  } catch (e) {
    console.warn("[buyer-permissions] snapshot unavailable", e instanceof Error ? e.message : e);
    return seedRegistry();
  }
});
