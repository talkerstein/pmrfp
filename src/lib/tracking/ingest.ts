import { isOwnHost } from "@/lib/attribution/channel";
import { hasUtm, type FirstTouch, type Utm } from "@/lib/attribution/cookie";
import type { BeaconItem } from "./beacon";
import { bufferEvent, bufferListingView, bufferPageView, bufferReferrer, bufferVisitor } from "./buffer";
import { langOfPath } from "./events";

/**
 * Turns a parsed beacon into buffered rows (lib/tracking/buffer). Pure apart
 * from the buffer, so it's unit-tested without Next.js. The facts come from
 * the request (lib/tracking/request): day, hashed visitor, country, the
 * signed-in user id when the session cookie has one, our own host.
 */

export interface BeaconFacts {
  day: string;
  /** visitorHash() for this browser today. */
  hash: string;
  country: string | null;
  userId: string | null;
  /** The request's host: a referrer from it is internal, not a referrer. */
  host: string;
  /** The first-touch cookie, for campaign tags on events. */
  ft: FirstTouch | null;
  now?: Date;
}

/** The campaign to put on an event: the last tagged visit, else the first touch. */
export function campaignOf(ft: FirstTouch | null): Utm {
  if (!ft) return {};
  return ft.last && hasUtm(ft.last) ? ft.last : ft.utm;
}

export function ingestBeacon(items: readonly BeaconItem[], f: BeaconFacts): { pageViews: number; listingViews: number; events: number } {
  const country = f.country ?? "";
  const counts = { pageViews: 0, listingViews: 0, events: 0 };
  if (!items.length) return counts;
  const firstPath = items.find((i) => i.path)?.path ?? "/";
  bufferVisitor({ day: f.day, h: f.hash, country, lang: langOfPath(firstPath), signed_in: !!f.userId });
  const utm = campaignOf(f.ft);
  for (const item of items) {
    if (item.t === "pv") {
      bufferPageView(f.day, item.path, country);
      if (item.ref && !isOwnHost(item.ref, [f.host])) bufferReferrer(f.day, item.ref, country);
      counts.pageViews++;
    } else if (item.t === "lv") {
      if (bufferListingView({ day: f.day, slug: item.slug, h: f.hash, user_id: f.userId, country: f.country, lang: langOfPath(item.path) })) {
        counts.listingViews++;
      }
    } else {
      bufferEvent({
        event: item.event,
        path: item.path || null,
        lang: item.path ? langOfPath(item.path) : null,
        country: f.country,
        role: null,
        user_id: f.userId,
        anon_hash: f.hash,
        utm_source: utm.source ?? null,
        utm_medium: utm.medium ?? null,
        utm_campaign: utm.campaign ?? null,
        props: item.props,
        at: (f.now ?? new Date()).toISOString(),
      });
      counts.events++;
    }
  }
  return counts;
}
