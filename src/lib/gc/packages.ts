import { publicTenderSource } from "@/lib/tenders/sources";
import { isPastContract } from "@/lib/data/fomo";

/**
 * GC sub-trade packages: a general contractor posts one package per trade
 * ("Roofing package — Etobicoke school renovation"). A package is an ordinary
 * rfp_posts row with source_type 'gc_package', so it rides the same publish,
 * digest, Pro-gating and express-interest paths as a PM-posted RFP. Pure
 * helpers only — safe to import anywhere.
 */

export const GC_PACKAGE = "gc_package";

export const GC_BADGE = "GC sub-trade package";

/** Shown when a package is posted before migration 20260924000002 has run. */
export const GC_UNAVAILABLE_MESSAGE =
  "Sub-trade packages aren't switched on yet. We're turning them on shortly — please try again later, or post this as a regular RFP for now.";

export function isGcPackage(r: { sourceType: string | null }): boolean {
  return r.sourceType === GC_PACKAGE;
}

/** Card/page badge for where a listing came from, or null for a plain PM RFP. */
export function sourceTypeLabel(sourceType: string | null, slug: string): string | null {
  if (sourceType === GC_PACKAGE) return GC_BADGE;
  if (sourceType === "public_source") return publicTenderSource(slug).badge;
  return null;
}

/** A trade name mid-sentence: "Roofing" → "roofing", "HVAC" stays, "EV Charging" → "EV charging". */
export function tradeWords(trade: string): string {
  return trade
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(" ");
}

/** "Roofing package — Etobicoke school renovation" */
export function gcPackageTitle(trade: string, projectName: string): string {
  const t = `${trade.trim()} package — ${projectName.trim().replace(/\s+/g, " ")}`;
  return t.length > 180 ? `${t.slice(0, 177)}…` : t;
}

const SLUG = /^[a-z0-9][a-z0-9-]{2,199}$/;

/**
 * The award a package belongs to, from whatever the GC pasted: a bare slug,
 * "/rfps/<slug>" or a full pmrfp.com link. Null when it isn't one.
 */
export function parseAwardRef(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname;
  } catch {
    return null;
  }
  const m = path.match(/(?:^|\/)rfps\/([^/?#]+)\/?$/);
  const slug = (m ? m[1] : path).toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

/** Only real public award notices can be a package's "related contract". */
export function isLinkableAward(r: { slug: string; sourceType: string | null }): boolean {
  return isPastContract(r);
}

/**
 * Did the insert fail because the GC-package migration hasn't run? Covers the
 * check constraint (23514), PostgREST's unknown-column error (PGRST204) and
 * Postgres' (42703).
 */
export function isGcSchemaMissingError(err: { code?: string | null; message?: string | null } | null): boolean {
  if (!err) return false;
  if (err.code === "23514" || err.code === "PGRST204" || err.code === "42703") return true;
  return /gc_project_name|awarded_rfp_id|source_type_check/i.test(err.message ?? "");
}

/** Where the "post a package" flow starts, with the award prefilled. */
export function gcPostPath(awardSlug?: string | null): string {
  return awardSlug ? `/gc-packages/new?award=${encodeURIComponent(awardSlug)}` : "/gc-packages/new";
}

/** The dashboard form itself (signed-in buyers). */
export function gcFormPath(awardSlug?: string | null): string {
  return `/pm-dashboard/rfps/new?kind=gc${awardSlug ? `&award=${encodeURIComponent(awardSlug)}` : ""}`;
}
