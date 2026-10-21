/**
 * "From buyers you follow": which new listings belong to a followed buyer,
 * and who hears about them when (pure; test/unit/buyer-follows.test.ts).
 * The database side is ./alerts-server.ts.
 *
 * A listing belongs to a buyer page when:
 *   1. a verified public buyer posted it (posted_by_organization_id is the
 *      organization that manages the page: B2's town job posts);
 *   2. it was imported with the buyer's permission (the city flow: the
 *      source's permission names the buyer);
 *   3. it's an imported public tender naming the buyer, by the same rules
 *      the buyer page uses for its "open bids" (lib/buyers/model openBidsFor
 *      for researched buyers, townOpenBids for municipalities; a bid naming
 *      "Township of Wellington North" isn't given to "Wellington");
 *   4. or the page already lists it (the shared snapshot).
 *
 * Who hears, and when:
 *   - Trade Pro and trial: the same day, one email per run with every new
 *     listing from the buyers they follow (behind BUYER_FOLLOW_ALERTS_ENABLED).
 *   - Free: a "From buyers you follow" section in the Monday roundup.
 * Never twice: not a listing the person already got by the daily category
 * and region digest or a PM job alert (both log a notifications 'rfp_alert'
 * for /rfps/<slug>), nor one already sent as a follow alert (lead_alert_log
 * "follow:<id>", lib/follows/rules followAlertKey). Opportunity-email
 * settings are respected (off, or weekly), as is a suspended account.
 * Canada only: listings outside Canada never match a (Canadian) buyer page.
 */
import { buyerKeyOf } from "@/lib/intel/model";
import { openBidsFor, openTexts, pageKind, townOpenBids, type BuyerPage } from "@/lib/buyers/model";
import { isUsState } from "@/lib/geo";
import type { RfpListItem } from "@/lib/data/types";
import { formalNameEn, formalNameFr } from "@/lib/towns/names";

export interface FollowListing {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  deadline: string | null;
  /** rfp_posts.province ("Ontario"; free text on member posts). */
  province: string | null;
  sourceType: string | null;
  postedByOrganizationId: string | null;
  publishedAt: string | null;
}

/** Canada only: a listing in the U.S. never belongs to a (Canadian) buyer page. */
const inCanada = (l: Pick<FollowListing, "province">) => !isUsState(l.province);
const pageKeyOf = (p: Pick<BuyerPage, "provinceSlug" | "buyer">) => `${p.provinceSlug}/${p.buyer.slug}`;

export interface MatchContext {
  /** Every buyer page (the shared snapshot): towns need all their neighbours' names to match precisely. */
  pages: readonly BuyerPage[];
  /** Only these page keys are wanted (the followed ones). */
  wanted: ReadonlySet<string>;
  /** buyer_pages: managing organization id → page key. */
  managedByOrg: ReadonlyMap<string, string>;
  /** A listing imported with a buyer's permission: that buyer's slug and province code (lib/tenders/sources). */
  permissionOf: (slug: string) => { buyerSlug: string; provinceCode: string } | null;
}

/** listing id → the followed page keys it belongs to. */
export function listingBuyerKeys(listings: readonly FollowListing[], ctx: MatchContext): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  const add = (id: string, key: string) => {
    if (!ctx.wanted.has(key)) return;
    if (!out.has(id)) out.set(id, new Set());
    out.get(id)!.add(key);
  };
  const canadian = listings.filter(inCanada);
  const bySlug = new Map(canadian.map((l) => [l.slug, l]));
  const wantedPages = ctx.pages.filter((p) => ctx.wanted.has(pageKeyOf(p)));

  for (const l of canadian) {
    // 1. A verified public buyer's own post.
    if (l.postedByOrganizationId) {
      const key = ctx.managedByOrg.get(l.postedByOrganizationId);
      if (key) add(l.id, key);
    }
    // 2. Imported with the buyer's permission.
    const perm = l.sourceType === "public_source" ? ctx.permissionOf(l.slug) : null;
    if (perm) for (const p of wantedPages) if (p.buyer.slug === perm.buyerSlug && p.buyer.provinceCode === perm.provinceCode) add(l.id, pageKeyOf(p));
  }

  // 3. Public tenders naming the buyer (same text rules as the buyer pages).
  const asItems: RfpListItem[] = canadian
    .filter((l) => l.sourceType === "public_source")
    .map((l) => ({ slug: l.slug, title: l.title, summary: l.summary, province: l.province, deadline: l.deadline, status: "open", sourceType: l.sourceType, categories: [], regionName: null, propertyTypeName: null, city: null, isDemo: false, photoUrls: [] }));
  const open = openTexts(asItems);
  if (open.length) {
    for (const p of wantedPages) {
      if (pageKind(p) === "town") continue;
      for (const b of openBidsFor(p.buyer, p.province, open)) {
        const l = bySlug.get(b.slug);
        if (l) add(l.id, pageKeyOf(p));
      }
    }
    if (wantedPages.some((p) => pageKind(p) === "town")) {
      const needles = ctx.pages
        .filter((p) => pageKind(p) === "town" && p.town)
        .flatMap((p) => [...new Set([buyerKeyOf(formalNameEn(p.town!)), buyerKeyOf(formalNameFr(p.town!))])].map((n) => ({ key: pageKeyOf(p), province: p.province, needle: ` ${n} ` })));
      for (const [key, bids] of townOpenBids(needles, open)) {
        if (!ctx.wanted.has(key)) continue;
        for (const b of bids) {
          const l = bySlug.get(b.slug);
          if (l) add(l.id, key);
        }
      }
    }
  }

  // 4. What the page already lists.
  for (const p of wantedPages) {
    for (const b of p.openBids) {
      const l = bySlug.get(b.slug);
      if (l) add(l.id, pageKeyOf(p));
    }
  }
  return new Map([...out].map(([id, keys]) => [id, [...keys].sort()]));
}

export interface FollowItem {
  listing: FollowListing;
  /** The followed pages it came from. */
  keys: string[];
}

/** Each follower's new listings from the buyers they follow (newest first). */
export function followedListingsByUser(
  listings: readonly FollowListing[],
  keysByListing: ReadonlyMap<string, readonly string[]>,
  follows: readonly { userId: string; key: string }[],
): Map<string, FollowItem[]> {
  const usersByKey = new Map<string, Set<string>>();
  for (const f of follows) {
    if (!usersByKey.has(f.key)) usersByKey.set(f.key, new Set());
    usersByKey.get(f.key)!.add(f.userId);
  }
  const out = new Map<string, FollowItem[]>();
  const sorted = [...listings].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.slug.localeCompare(b.slug));
  for (const l of sorted) {
    const keys = keysByListing.get(l.id);
    if (!keys?.length) continue;
    const byUser = new Map<string, string[]>();
    for (const k of keys) for (const u of usersByKey.get(k) ?? []) byUser.set(u, [...(byUser.get(u) ?? []), k]);
    for (const [u, ks] of byUser) out.set(u, [...(out.get(u) ?? []), { listing: l, keys: ks }]);
  }
  return out;
}

/** Most listings one follow email carries (the rest wait for the next run). */
export const MAX_ITEMS_PER_EMAIL = 20;

export interface FollowAlertInput {
  byUser: ReadonlyMap<string, readonly FollowItem[]>;
  users: ReadonlyMap<string, { email: string | null; status?: string | null }>;
  /** Trade Pro or trial (lib/pm-jobs/server proOrgIds over the person's companies). */
  pro: ReadonlySet<string>;
  /** Opportunity emails off (new_rfps 'off' or email off; the unsubscribe link sets it). */
  optedOut: ReadonlySet<string>;
  /** Asked for opportunity emails weekly: no same-day email. */
  weekly: ReadonlySet<string>;
  /** "<userId>|<slug>" already emailed by the daily digest or a PM job alert (notifications 'rfp_alert'). */
  sentRfp: ReadonlySet<string>;
  /** "<userId>|<listing id>" already sent as a follow alert (lead_alert_log). */
  sentFollow: ReadonlySet<string>;
}

export interface FollowAlertRecipient {
  userId: string;
  email: string;
  items: FollowItem[];
}

export interface FollowAlertPlan {
  recipients: FollowAlertRecipient[];
  /** Listings across every email. */
  items: number;
  skipped: { free: number; optedOut: number; weekly: number; alreadySent: number; noEmail: number };
}

/**
 * The same-day emails (Trade Pro and trial only): one per person, with each
 * new listing from a buyer they follow that they haven't already been sent
 * by category matching or an earlier follow alert. Free followers are
 * counted, never emailed here (their listings go in the Monday roundup).
 */
export function planFollowAlerts(input: FollowAlertInput): FollowAlertPlan {
  const skipped = { free: 0, optedOut: 0, weekly: 0, alreadySent: 0, noEmail: 0 };
  const recipients: FollowAlertRecipient[] = [];
  let items = 0;
  for (const [userId, all] of input.byUser) {
    if (!input.pro.has(userId)) {
      skipped.free++;
      continue;
    }
    const user = input.users.get(userId);
    if (!user?.email || user.status === "suspended" || user.status === "deleted") {
      skipped.noEmail++;
      continue;
    }
    if (input.optedOut.has(userId)) {
      skipped.optedOut++;
      continue;
    }
    if (input.weekly.has(userId)) {
      skipped.weekly++;
      continue;
    }
    const fresh = all.filter((i) => !input.sentRfp.has(`${userId}|${i.listing.slug}`) && !input.sentFollow.has(`${userId}|${i.listing.id}`));
    skipped.alreadySent += all.length - fresh.length;
    if (!fresh.length) continue;
    const take = fresh.slice(0, MAX_ITEMS_PER_EMAIL);
    recipients.push({ userId, email: user.email, items: take });
    items += take.length;
  }
  return { recipients, items, skipped };
}

/**
 * The Monday roundup's "From buyers you follow" for one free account: what
 * its followed buyers listed this week, minus what's already in the
 * roundup's own matches or was already sent (a PM job alert).
 */
export function weeklyFollowSection(items: readonly FollowItem[] | undefined, opts: { alreadyListed: ReadonlySet<string>; sentRfp?: ReadonlySet<string>; userId: string; max?: number }): FollowItem[] {
  return (items ?? [])
    .filter((i) => !opts.alreadyListed.has(i.listing.id) && !opts.sentRfp?.has(`${opts.userId}|${i.listing.slug}`))
    .slice(0, opts.max ?? 5);
}
