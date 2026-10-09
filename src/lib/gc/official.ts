import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { publicTenderSource } from "@/lib/tenders/sources";
import { awardNoticeUrl } from "@/lib/tenders/awards";
import { TORONTO_PORTAL_URL } from "@/lib/tenders/toronto";
import { NS_PORTAL_URL } from "@/lib/tenders/nova-scotia";

/**
 * The official notice behind a past public contract on the board, for pages
 * built from award data (/gc-hub, /contract-winners/<slug>). The public
 * rfp_public view carries no source_url, so:
 *   • CanadaBuys award URLs are rebuilt from the slug (exact);
 *   • SEAO award URLs are read from rfp_award_links (migration
 *     20261009000001 — award rows only, never an open tender's bid link);
 *   • Toronto and Nova Scotia publish no per-award page, so — like SEAO
 *     until that view exists — we link the official portal the award was
 *     published on, and say so (exact: false).
 */

export interface OfficialNotice {
  url: string;
  /** True when the link opens this contract's own notice, false for the portal. */
  exact: boolean;
}

/** Official portal per award feed (lib/tenders/sources keys). */
export const AWARD_PORTALS: Record<string, string> = {
  awards: "https://canadabuys.canada.ca/en/tender-opportunities",
  seao: "https://seao.gouv.qc.ca/",
  "toronto-awards": TORONTO_PORTAL_URL,
  "ns-awards": NS_PORTAL_URL,
};

/** Open-data licence per award feed, for the source line. */
export const AWARD_LICENCES: Record<string, string> = {
  awards: "https://open.canada.ca/en/open-government-licence-canada",
  seao: "https://creativecommons.org/licenses/by/4.0/",
  "toronto-awards": "https://open.toronto.ca/open-data-licence/",
  "ns-awards": "https://novascotia.ca/opendata/licence.asp",
};

/** What we know from the slug alone; null for anything that isn't an award notice. */
export function officialNoticeFromSlug(slug: string): OfficialNotice | null {
  const src = publicTenderSource(slug);
  if (!src.past) return null;
  if (src.key === "awards") {
    const ref = slug.split("-cba-").pop();
    return ref ? { url: awardNoticeUrl(ref), exact: true } : null;
  }
  const portal = AWARD_PORTALS[src.key];
  return portal ? { url: portal, exact: false } : null;
}

/** Feeds whose stored source_url is the award's own notice (the others store the portal). */
const PER_NOTICE_FEEDS = new Set(["seao"]);

/** Only http(s) links on the official host of the slug's own feed. */
export function isOfficialUrl(url: string, slug: string): boolean {
  const portal = AWARD_PORTALS[publicTenderSource(slug).key];
  if (!portal) return false;
  try {
    const u = new URL(url);
    const host = new URL(portal).hostname.replace(/^www\./, "");
    return (u.protocol === "https:" || u.protocol === "http:") && (u.hostname === host || u.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** slug → official notice for every award slug given. Never throws. */
export async function officialNotices(slugs: string[]): Promise<Map<string, OfficialNotice>> {
  const out = new Map<string, OfficialNotice>();
  const lookup: string[] = [];
  for (const slug of new Set(slugs)) {
    const n = officialNoticeFromSlug(slug);
    if (!n) continue;
    out.set(slug, n);
    if (!n.exact && PER_NOTICE_FEEDS.has(publicTenderSource(slug).key)) lookup.push(slug);
  }
  if (!lookup.length || !isSupabaseConfigured()) return out;
  const supabase = createReadClient();
  for (let i = 0; i < lookup.length; i += 100) {
    try {
      const { data, error } = await supabase
        .from("rfp_award_links")
        .select("slug,source_url")
        .in("slug", lookup.slice(i, i + 100));
      // Before the migration runs the view is missing: keep the portal links.
      if (error || !data) break;
      for (const r of data as { slug: string; source_url: string | null }[]) {
        if (r.source_url && isOfficialUrl(r.source_url, r.slug)) out.set(r.slug, { url: r.source_url, exact: true });
      }
    } catch {
      break;
    }
  }
  return out;
}
