import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBuyers } from "@/lib/buyers/load";
import { findBuyerPage } from "@/lib/buyers/model";
import { sendFollowAlert, sendTownJobEmail } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { optedOutUsers, weeklyUsers } from "@/lib/pm-jobs/alerts";
import { proOrgIds, recipientLangs } from "@/lib/pm-jobs/server";
import { cityByBuyer } from "@/lib/tenders/city-sources";
import { publicTenderSource } from "@/lib/tenders/sources";
import { displayTitle } from "@/lib/tenders/title";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { followedListingsByUser, listingBuyerKeys, planFollowAlerts, type FollowItem, type FollowListing, type FollowAlertPlan } from "./alerts";
import { buyerFollowAlertsEnabled, followAlertKey } from "./rules";
import { followAlertEmail, type FollowEmailItem } from "./email-copy";
import { isEnabledLocale } from "@/i18n/config";
import type { D1Binding } from "@/lib/d1/contracts";
import { inList, readD1, readD1ByIds, requireD1LifecycleAuthority } from "@/lib/lifecycle/d1";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";

/**
 * Database side of "From buyers you follow" (service role; server only).
 *
 *   runBuyerFollowAlerts  same-day emails to Trade Pro and trial followers
 *                         (cron/buyer-follow-alerts, hourly). Behind
 *                         BUYER_FOLLOW_ALERTS_ENABLED: off, it only counts
 *                         (the admin sees the dry run at /admin/buyer-sources).
 *   weeklyFollowItems     what each free follower's buyers listed this week,
 *                         for the Monday roundup (cron/tender-digest).
 *
 * Reads: the person's follows, the week's (or window's) listings, the shared
 * buyer snapshot (lib/buyers/load, no queries of its own) and the managed
 * pages. Each (person, listing) is claimed in lead_alert_log
 * ("follow:<listing id>") right before its email, and logged as a
 * notifications 'rfp_alert' for /rfps/<slug>, so neither this nor the daily
 * category digest ever sends it again. A missing log table sends nothing.
 */

type Db = SupabaseClient | D1Binding;
const isD1 = (db: Db): db is D1Binding => "prepare" in db;
type Row = Record<string, unknown>;

const PAGE = 1000;
const CHUNK = 150;

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) return { rows, error };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

async function inChunks<T>(ids: readonly string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await run(unique.slice(i, i + CHUNK));
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: null };
}

/**
 * Rows of `table` for these people and these values of `column` (both lists
 * chunked, every page read), so a long list never makes a too-long URL or
 * hits the API's 1,000-row cap.
 */
async function pairs<T>(
  userIds: readonly string[],
  values: readonly string[],
  run: (users: string[], vals: string[], from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = [];
  const users = [...new Set(userIds)];
  const vals = [...new Set(values)];
  for (let i = 0; i < users.length; i += 50) {
    for (let j = 0; j < vals.length; j += 50) {
      const res = await pageAll<T>((a, b) => run(users.slice(i, i + 50), vals.slice(j, j + 50), a, b));
      if (res.error) return { rows, error: res.error };
      rows.push(...res.rows);
    }
  }
  return { rows, error: null };
}

/** A listing imported with a buyer's permission (the city flow): that buyer. */
function permissionOf(slug: string): { buyerSlug: string; provinceCode: string } | null {
  const perm = publicTenderSource(slug).permission;
  const city = perm ? cityByBuyer(perm.buyerSlug) : null;
  return perm && city ? { buyerSlug: perm.buyerSlug, provinceCode: city.provinceCode } : null;
}

const LISTING_COLS = "id,slug,title,summary,deadline,province,source_type,posted_by_organization_id,buyer_key,published_at";

/** Published, open, non-demo listings since `since` (newest first). U.S. ones are dropped when matching (lib/follows/alerts). */
async function recentListings(db: Db, since: string, today: string, limit = 2000): Promise<{ rows: FollowListing[]; error: boolean }> {
  const { data, error } = isD1(db)
    ? { data: await readD1<Row>(db, `SELECT ${LISTING_COLS} FROM rfp_posts
      WHERE status='published' AND is_demo=0 AND julianday(published_at)>=julianday(?)
        AND (deadline IS NULL OR date(deadline)>=date(?))
      ORDER BY julianday(published_at) DESC LIMIT ?`, since, today, limit), error: null }
    : await db.from("rfp_posts").select(LISTING_COLS).eq("status", "published").eq("is_demo", false)
      .gte("published_at", since).or(`deadline.is.null,deadline.gte.${today}`)
      .order("published_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[follow-alerts] listings read failed", error.message);
    return { rows: [], error: true };
  }
  return {
    rows: ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      title: displayTitle(String(r.title ?? ""), (r.source_type as string | null) ?? null).title,
      summary: (r.summary as string | null) ?? null,
      deadline: (r.deadline as string | null) ?? null,
      province: (r.province as string | null) ?? null,
      sourceType: (r.source_type as string | null) ?? null,
      postedByOrganizationId: (r.posted_by_organization_id as string | null) ?? null,
      buyerKey: (r.buyer_key as string | null) ?? null,
      publishedAt: (r.published_at as string | null) ?? null,
    })),
    error: false,
  };
}

/** buyer_pages: managing organization → page key (public-buyer posts). Empty before migration 20261021000040. */
async function managedByOrg(db: Db): Promise<Map<string, string>> {
  const { data, error } = isD1(db)
    ? { data: await readD1<{ buyer_key: string; organization_id: string }>(db, "SELECT buyer_key,organization_id FROM buyer_pages ORDER BY buyer_key LIMIT 5000"), error: null }
    : await db.from("buyer_pages").select("buyer_key,organization_id").limit(5000);
  if (error) return new Map();
  return new Map(((data ?? []) as { buyer_key: string; organization_id: string }[]).map((r) => [r.organization_id, r.buyer_key]));
}

interface Matched {
  follows: { userId: string; key: string }[];
  listings: FollowListing[];
  byUser: Map<string, FollowItem[]>;
  /** Display names of the followed pages, by key. */
  names: Map<string, string>;
  missing: boolean;
}

/** Follows (all, or `userIds`'), the listings since `since`, and who each listing is for. */
async function matchFollows(db: Db, opts: { since: string; today: string; userIds?: readonly string[] }): Promise<Matched> {
  const empty: Matched = { follows: [], listings: [], byUser: new Map(), names: new Map(), missing: false };
  type FollowRow = { user_id: string; buyer_slug: string };
  const res = isD1(db) ? { error: null, rows: opts.userIds
    ? await readD1ByIds<FollowRow>(db, [...opts.userIds], `SELECT user_id,buyer_slug FROM buyer_follows WHERE user_id ${inList}`)
    : await readD1<FollowRow>(db, "SELECT user_id,buyer_slug FROM buyer_follows ORDER BY user_id,buyer_slug LIMIT 50000") }
    : opts.userIds
    ? await inChunks<{ user_id: string; buyer_slug: string }>(opts.userIds, (c) => db.from("buyer_follows").select("user_id,buyer_slug").in("user_id", c))
    : await pageAll<{ user_id: string; buyer_slug: string }>((a, b) => db.from("buyer_follows").select("user_id,buyer_slug").order("user_id").order("buyer_slug").range(a, b));
  if (res.error) return { ...empty, missing: isMissingTableError(res.error) };
  const follows = res.rows.map((r) => ({ userId: r.user_id, key: r.buyer_slug }));
  if (!follows.length) return empty;
  const [{ rows: listings }, { pages }, managed] = await Promise.all([recentListings(db, opts.since, opts.today), loadBuyers(), managedByOrg(db)]);
  if (!listings.length) return { ...empty, follows };
  const wanted = new Set(follows.map((f) => f.key));
  const keysByListing = listingBuyerKeys(listings, { pages, wanted, managedByOrg: managed, permissionOf });
  const names = new Map<string, string>();
  for (const key of wanted) {
    const [provinceSlug, slug] = key.split("/");
    const p = findBuyerPage(pages, provinceSlug, slug);
    if (p) names.set(key, buyerDisplayName(p, "en"));
  }
  return { follows, listings, byUser: followedListingsByUser(listings, keysByListing, follows), names, missing: false };
}

export interface FollowAlertRun {
  state: "sent" | "off" | "dry" | "blocked";
  reason?: "table_missing" | "mailing_address" | "unsubscribe" | "log_missing";
  enabled: boolean;
  /** People with a follow; listings in the window. */
  followers: number;
  listings: number;
  /** Same-day emails that would go out now (Trade Pro and trial), and the listings in them. */
  wouldEmail: number;
  wouldList: number;
  sent: number;
  skipped: FollowAlertPlan["skipped"];
}

/** Members of each person's companies that have Trade Pro or a trial now. */
async function proUsers(db: Db, userIds: readonly string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  if (isD1(db)) {
    const rows = await readD1ByIds<{ user_id: string }>(db, [...userIds],
      `SELECT DISTINCT m.user_id FROM organization_members m JOIN organizations o ON o.id=m.organization_id
       WHERE m.user_id ${inList} AND o.is_demo=0 AND o.status='active' AND ${activePro}`);
    return new Set(rows.map(row => row.user_id));
  }
  const [pro, { rows: members }] = await Promise.all([
    proOrgIds(db),
    inChunks<{ user_id: string; organization_id: string }>(userIds, (c) => db.from("organization_members").select("user_id,organization_id").in("user_id", c)),
  ]);
  return new Set(members.filter((m) => pro.has(m.organization_id)).map((m) => m.user_id));
}

const activePro = `(EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id=o.id
    AND s.status IN ('active','comped') AND s.tier IN ('pro','featured'))
  OR EXISTS (SELECT 1 FROM trade_trials t WHERE t.organization_id=o.id AND o.organization_type='trade_company'
    AND julianday(t.started_at)<=julianday('now') AND julianday(t.ends_at)>julianday('now')))`;

type Profile = { id: string; email: string | null; status: string | null };
type Pref = { user_id: string; new_rfps: string | null; channel_email: boolean | null };
type Notice = { user_id: string; link_url: string };
type Receipt = { user_id: string; lead_key: string };

const allowedMailbox = `NOT EXISTS (SELECT 1 FROM email_suppressions e WHERE e.email_key=lower(trim(u.email)))
  AND NOT EXISTS (SELECT 1 FROM digest_subscribers d WHERE d.email_key=lower(trim(u.email))
    AND d.status IN ('bounced','unsubscribed'))`;

async function d1RecipientData(db: D1Binding, users: string[], links: string[], keys: string[], weekAgo: string) {
  const [profiles, prefs, notified, receipts] = await Promise.all([
    readD1ByIds<Profile>(db, users, `SELECT id,email,status FROM users_profile u WHERE id ${inList} AND status='active' AND ${allowedMailbox}`),
    readD1ByIds<Omit<Pref, "channel_email"> & { channel_email: 0 | 1 | null }>(db, users,
      `SELECT user_id,new_rfps,channel_email FROM notification_preferences WHERE user_id ${inList}`),
    readD1ByIds<Notice>(db, users, `SELECT user_id,link_url FROM notifications WHERE user_id ${inList}
      AND type='rfp_alert' AND julianday(created_at)>=julianday(?) AND link_url ${inList}`, weekAgo, JSON.stringify(links)),
    readD1ByIds<Receipt>(db, users, `SELECT user_id,lead_key FROM lead_alert_log WHERE user_id ${inList}
      AND lead_key ${inList}`, JSON.stringify(keys)),
  ]);
  return [{ rows: profiles }, { rows: prefs.map(row => ({ ...row, channel_email: row.channel_email === null ? null : row.channel_email === 1 })) },
    { rows: notified }, { rows: receipts, error: null }, await proUsers(db, users)] as const;
}

async function claimD1Follow(db: D1Binding, user: { userId: string; email: string }, item: FollowItem, weekAgo: string) {
  return db.prepare(`INSERT INTO lead_alert_log(user_id,lead_key)
    SELECT u.id,? FROM users_profile u LEFT JOIN notification_preferences p ON p.user_id=u.id
    WHERE u.id=? AND u.email=? AND u.status='active' AND ${customerAppAuthority} AND ${allowedMailbox}
      AND coalesce(p.channel_email,1)=1 AND coalesce(p.new_rfps,'daily') NOT IN ('off','weekly')
      AND EXISTS (SELECT 1 FROM buyer_follows f WHERE f.user_id=u.id AND f.buyer_slug ${inList})
      AND EXISTS (SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
        WHERE m.user_id=u.id AND o.status='active' AND o.is_demo=0 AND ${activePro})
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.type='rfp_alert'
        AND n.link_url=? AND julianday(n.created_at)>=julianday(?))
    ON CONFLICT(user_id,lead_key) DO NOTHING RETURNING user_id`)
    .bind(followAlertKey(item.listing.id), user.userId, user.email, JSON.stringify(item.keys), `/rfps/${item.listing.slug}`, weekAgo)
    .first<{ user_id: string }>();
}

/**
 * Same-day follow emails. `dry`: report only. With BUYER_FOLLOW_ALERTS_ENABLED
 * off it reports what would go out (state "off") and sends nothing.
 */
export async function runBuyerFollowAlerts(
  db: Db,
  opts: { dry?: boolean; enabled?: boolean; windowHours?: number; now?: Date; budgetMs?: number } = {},
): Promise<FollowAlertRun> {
  const now = opts.now ?? new Date();
  const enabled = opts.enabled ?? buyerFollowAlertsEnabled();
  const since = new Date(now.getTime() - (opts.windowHours ?? 36) * 3_600_000).toISOString();
  const today = now.toISOString().slice(0, 10);
  if (isD1(db)) await requireD1LifecycleAuthority(db);
  const m = await matchFollows(db, { since, today });
  const base: FollowAlertRun = {
    state: opts.dry ? "dry" : "off",
    enabled,
    followers: new Set(m.follows.map((f) => f.userId)).size,
    listings: m.listings.length,
    wouldEmail: 0,
    wouldList: 0,
    sent: 0,
    skipped: { free: 0, optedOut: 0, weekly: 0, alreadySent: 0, noEmail: 0 },
  };
  if (m.missing) return { ...base, state: "blocked", reason: "table_missing" };
  const userIds = [...m.byUser.keys()];
  if (!userIds.length) return base;

  // Only the listings someone follows (usually a handful, not the whole window).
  const candidates = [...new Map([...m.byUser.values()].flat().map((i) => [i.listing.id, i.listing])).values()];
  const links = candidates.map((l) => `/rfps/${l.slug}`);
  const followKeys = candidates.map((l) => followAlertKey(l.id));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ rows: profiles }, { rows: prefs }, { rows: notified }, logRes, pro] = isD1(db) ? await d1RecipientData(db, userIds, links, followKeys, weekAgo) : await Promise.all([
    inChunks<{ id: string; email: string | null; status: string | null }>(userIds, (c) => db.from("users_profile").select("id,email,status").in("id", c)),
    inChunks<{ user_id: string; new_rfps: string | null; channel_email: boolean | null }>(userIds, (c) => db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", c)),
    // What the daily category digest and PM job alerts already sent (same notifications log they write).
    pairs<{ user_id: string; link_url: string }>(userIds, links, (u, v, a, b) =>
      db.from("notifications").select("user_id,link_url").eq("type", "rfp_alert").gte("created_at", weekAgo).in("user_id", u).in("link_url", v).order("id").range(a, b),
    ),
    pairs<{ user_id: string; lead_key: string }>(userIds, followKeys, (u, v, a, b) => db.from("lead_alert_log").select("user_id,lead_key").in("user_id", u).in("lead_key", v).order("user_id").order("lead_key").range(a, b)),
    proUsers(db, userIds),
  ]);
  const logMissing = Boolean(logRes.error && isMissingTableError(logRes.error));
  const plan = planFollowAlerts({
    byUser: m.byUser,
    users: new Map(profiles.map((p) => [p.id, { email: p.email, status: p.status }])),
    pro,
    optedOut: optedOutUsers(prefs),
    weekly: weeklyUsers(prefs),
    sentRfp: new Set(notified.map((n) => `${n.user_id}|${n.link_url.replace(/^\/rfps\//, "")}`)),
    // An unknown error reading the log: treat everything as sent (never repeat).
    sentFollow: logRes.error && !logMissing ? new Set(userIds.flatMap((u) => m.listings.map((l) => `${u}|${l.id}`))) : new Set(logRes.rows.map((r) => `${r.user_id}|${r.lead_key.slice("follow:".length)}`)),
  });
  const counted = { ...base, wouldEmail: plan.recipients.length, wouldList: plan.items, skipped: plan.skipped };
  if (opts.dry) return { ...counted, state: "dry" };
  if (!enabled) return { ...counted, state: "off" };
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  if (!mailingAddress) return { ...counted, state: "blocked", reason: "mailing_address" };
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
  if (!unsubscribeUrl(siteBase, "check")) return { ...counted, state: "blocked", reason: "unsubscribe" };
  if (logMissing) return { ...counted, state: "blocked", reason: "log_missing" };

  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const recipientIds = plan.recipients.map(r => r.userId);
  const langs = isD1(db) ? new Map((await readD1ByIds<{ user_id: string; lang: string }>(db, recipientIds,
    `SELECT user_id,lang FROM signup_attribution WHERE user_id ${inList}`))
    .flatMap(row => isEnabledLocale(row.lang) ? [[row.user_id, row.lang] as const] : []))
    : await recipientLangs(db, recipientIds);
  let sent = 0;
  for (const r of plan.recipients) {
    if (Date.now() - started > budget) break;
    // Claim first: only the run that inserts the row sends that listing.
    const claimed: FollowItem[] = [];
    for (const item of r.items) {
      if (isD1(db)) {
        if (await claimD1Follow(db, r, item, weekAgo)) claimed.push(item);
        continue;
      }
      const { data, error } = await db
        .from("lead_alert_log")
        .upsert({ user_id: r.userId, lead_key: followAlertKey(item.listing.id) }, { onConflict: "user_id,lead_key", ignoreDuplicates: true })
        .select("user_id");
      if (error) {
        console.error("[follow-alerts] log failed", error.message);
        return { ...counted, state: "sent", sent };
      }
      if ((data as unknown[] | null)?.length) claimed.push(item);
    }
    if (!claimed.length) continue;
    const items: FollowEmailItem[] = claimed.map((i) => ({
      title: i.listing.title,
      slug: i.listing.slug,
      deadline: i.listing.deadline,
      buyer: i.keys.map((k) => m.names.get(k)).find(Boolean) ?? "",
    }));
    const lang = langs.get(r.userId) ?? "en";
    const unsubscribe = unsubscribeUrl(siteBase, r.userId)!;
    const notices = claimed.map(i => ({
      id: crypto.randomUUID(), user_id: r.userId, type: "rfp_alert", title: "New from a buyer you follow",
      message: i.listing.title, link_url: `/rfps/${i.listing.slug}`,
    }));
    if (isD1(db)) {
      await sendTownJobEmail(r.email, followAlertEmail(lang, {
        base: siteBase, items, unsubscribeUrl: unsubscribe, mailingAddress,
      }), lang, "follow-alert", unsubscribe, { smtpOnly: true });
      await db.batch(notices.map(n => db.prepare(`INSERT INTO notifications (id,user_id,type,title,message,link_url)
        VALUES (?,?,?,?,?,?)`).bind(n.id, n.user_id, n.type, n.title, n.message, n.link_url)));
    } else {
      await sendFollowAlert(r.email, { lang, items, unsubscribeUrl: unsubscribe, mailingAddress });
      await db.from("notifications").insert(notices);
    }
    sent++;
  }
  return { ...counted, state: "sent", sent };
}

/**
 * For the Monday roundup: each of these people's listings this week from
 * buyers they follow, with the buyer's name. Empty (cheaply) when nobody
 * follows anything or the table isn't there yet.
 */
export async function weeklyFollowItems(db: Db, opts: { userIds: readonly string[]; since: string; today: string }): Promise<{ byUser: Map<string, FollowItem[]>; names: Map<string, string> }> {
  if (!opts.userIds.length) return { byUser: new Map(), names: new Map() };
  try {
    const m = await matchFollows(db, { since: opts.since, today: opts.today, userIds: opts.userIds });
    return { byUser: m.byUser, names: m.names };
  } catch (err) {
    console.error("[follow-alerts] weekly section failed", err instanceof Error ? err.message : err);
    return { byUser: new Map(), names: new Map() };
  }
}
