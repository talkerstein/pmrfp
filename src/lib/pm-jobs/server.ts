import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEnabledLocale } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";
import { listingCountry, orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { sendPmJobAlert } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { isSchemaMissing } from "@/lib/projects/compat";
import type { CountryCode } from "@/lib/visitor-geo";
import {
  MAX_ALERTS_PER_JOB,
  optedOutUsers,
  weeklyUsers,
  pmJobAlertKey,
  pmJobAlertsEnabled,
  selectAlertAudience,
  type AlertAudience,
  type AlertOrg,
} from "./alerts";
import type { EmailLang } from "./email-copy";
import type { RegionRow } from "./regions";
import { FREE_MONTHLY_RESPONSES, RESPONDER_ORG_TYPES, isPmJob, monthStart, respondDecision, responseAllowance, type Allowance } from "./rules";
import { isUsState } from "@/lib/geo";

/**
 * Database side of the PM job flow (service role; server only). Reads in
 * chunks and pages so a big trade list never hits the API's 1,000-row cap.
 */

type Db = SupabaseClient;
type Row = Record<string, unknown>;

const PAGE = 1000;
const CHUNK = 150;

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
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

/** Each user's language (signup_attribution.lang), English when unknown. */
export async function recipientLangs(db: Db, userIds: readonly string[]): Promise<Map<string, EmailLang>> {
  const out = new Map<string, EmailLang>();
  if (!userIds.length) return out;
  const { rows } = await inChunks<{ user_id: string; lang: string | null }>(userIds, (c) => db.from("signup_attribution").select("user_id,lang").in("user_id", c));
  for (const r of rows) if (isEnabledLocale(r.lang)) out.set(r.user_id, r.lang);
  return out;
}

export async function langOf(db: Db, userId: string | null | undefined, preferred?: string | null): Promise<EmailLang> {
  if (isEnabledLocale(preferred)) return preferred;
  if (!userId) return "en";
  return (await recipientLangs(db, [userId])).get(userId) ?? "en";
}

/**
 * Free responses a company used this calendar month (Toronto time). Null when
 * the column doesn't exist yet (migration 20261021000020 not applied): free
 * responses are then unavailable, as before.
 */
export async function freeResponsesUsed(db: Db, orgId: string, now: Date = new Date()): Promise<number | null> {
  const { count, error } = await db
    .from("rfp_interests")
    .select("id", { count: "exact", head: true })
    .eq("trade_organization_id", orgId)
    .eq("used_free_allowance", true)
    .gte("created_at", monthStart(now));
  if (error) return isSchemaMissing(error) ? null : FREE_MONTHLY_RESPONSES;
  return count ?? 0;
}

/** Companies with Trade Pro now: an active/comped Pro or Featured subscription, or a running trial. */
export async function proOrgIds(db: Db, now: Date = new Date()): Promise<Set<string>> {
  const out = new Set<string>();
  const subs = await db.from("subscriptions").select("organization_id,status,tier").in("status", ["active", "comped"]);
  if (subs.error) {
    const legacy = await db.from("subscriptions").select("organization_id").in("status", ["active", "comped"]);
    for (const s of (legacy.data ?? []) as Row[]) out.add(String(s.organization_id));
  } else {
    for (const s of (subs.data ?? []) as Row[]) if (s.tier === "pro" || s.tier === "featured") out.add(String(s.organization_id));
  }
  const trials = await db.from("trade_trials").select("organization_id").gt("ends_at", now.toISOString());
  for (const t of (trials.data ?? []) as Row[]) out.add(String(t.organization_id));
  return out;
}

export interface JobRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  source_type: string | null;
  region_id: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  posted_by_user_id: string | null;
  posted_by_organization_id: string | null;
  published_at?: string | null;
  rfp_categories: { category_id: string; trade_categories: { name: string } | null }[];
}

const JOB_COLS =
  "id,title,slug,summary,status,source_type,region_id,city,province,deadline,posted_by_user_id,posted_by_organization_id,published_at, rfp_categories(category_id, trade_categories(name))";

export async function loadJob(db: Db, rfpId: string): Promise<JobRow | null> {
  const { data } = await db.from("rfp_posts").select(JOB_COLS).eq("id", rfpId).maybeSingle();
  return (data as unknown as JobRow | null) ?? null;
}

export interface AudienceResult {
  job: JobRow;
  country: CountryCode;
  audience: AlertAudience;
  /** lead_alert_log is missing (migration 20261016000002): nothing can be recorded, so nothing is sent. */
  logMissing: boolean;
  placeName: string | null;
}

/** Who a published (or about-to-be-published) job would email right now. */
export async function loadAlertAudience(db: Db, job: JobRow): Promise<AudienceResult> {
  const categoryIds = job.rfp_categories.map((c) => c.category_id);
  const { data: regionData } = await db.from("regions").select("id,name,slug,parent_id,province,country");
  const regions = (regionData ?? []) as RegionRow[];
  const byRegion = regionCountryMap(regions);
  const country = listingCountry(job, byRegion);

  const empty: AlertAudience = { place: null, orgs: [], recipients: [], skipped: { optedOut: 0, weekly: 0, alreadySent: 0, noEmail: 0 }, truncated: false };
  if (!categoryIds.length) return { job, country, audience: empty, logMissing: false, placeName: null };

  // Companies in the job's trades.
  const { rows: catRows } = await pageAll<{ organization_id: string; category_id: string }>((a, b) =>
    db.from("organization_categories").select("organization_id,category_id").in("category_id", categoryIds).order("organization_id").range(a, b),
  );
  const candidateIds = [...new Set(catRows.map((r) => r.organization_id))];
  const { rows: orgRows } = await inChunks<Row>(candidateIds, (c) =>
    db
      .from("organizations")
      .select("id,name,organization_type,status,profile_status,is_demo,city,province,country")
      .in("id", c)
      .in("organization_type", ["trade_company", "supplier"])
      .eq("status", "active")
      .eq("profile_status", "approved"),
  );
  const orgIds = orgRows.map((o) => String(o.id));
  const [{ rows: allCats }, { rows: regRows }, { rows: memberRows }] = await Promise.all([
    inChunks<{ organization_id: string; category_id: string }>(orgIds, (c) => db.from("organization_categories").select("organization_id,category_id").in("organization_id", c)),
    inChunks<{ organization_id: string; region_id: string }>(orgIds, (c) => db.from("organization_regions").select("organization_id,region_id").in("organization_id", c)),
    inChunks<{ organization_id: string; user_id: string }>(orgIds, (c) => db.from("organization_members").select("organization_id,user_id").in("organization_id", c)),
  ]);
  const catsByOrg = groupSet(allCats, "organization_id", "category_id");
  const regionsByOrg = new Map([...groupSet(regRows, "organization_id", "region_id")].map(([k, v]) => [k, [...v]]));
  const usersByOrg = new Map([...groupSet(memberRows, "organization_id", "user_id")].map(([k, v]) => [k, [...v]]));
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];

  const [{ rows: profiles }, { rows: prefs }, sentRes, pro] = await Promise.all([
    inChunks<{ id: string; email: string | null; status: string | null }>(userIds, (c) => db.from("users_profile").select("id,email,status").in("id", c)),
    inChunks<{ user_id: string; new_rfps: string | null; channel_email: boolean | null }>(userIds, (c) =>
      db.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", c),
    ),
    inChunks<{ user_id: string }>(userIds, (c) => db.from("lead_alert_log").select("user_id").eq("lead_key", pmJobAlertKey(job.id)).in("user_id", c)),
    proOrgIds(db),
  ]);
  const logMissing = Boolean(sentRes.error && isMissingTableError(sentRes.error));

  const orgs: AlertOrg[] = orgRows.map((o) => ({
    id: String(o.id),
    name: String(o.name ?? ""),
    organization_type: String(o.organization_type),
    status: String(o.status),
    profile_status: String(o.profile_status),
    is_demo: Boolean(o.is_demo),
    city: (o.city as string | null) ?? null,
    province: (o.province as string | null) ?? null,
    countries: orgCountries({ province: (o.province as string | null) ?? null, country: (o.country as string | null) ?? null }, regionsByOrg.get(String(o.id)) ?? [], byRegion),
  }));

  const audience = selectAlertAudience(
    {
      job: {
        id: job.id,
        region_id: job.region_id,
        city: job.city,
        province: job.province,
        country,
        categoryIds,
        posted_by_user_id: job.posted_by_user_id,
        posted_by_organization_id: job.posted_by_organization_id,
      },
      regions,
      orgs,
      catsByOrg,
      regionsByOrg,
      usersByOrg,
      users: new Map(profiles.map((p) => [p.id, { email: p.email, status: p.status }])),
      optedOut: optedOutUsers(prefs),
      weekly: weeklyUsers(prefs),
      // An unknown error reading the log: treat everyone as sent (never repeat).
      alreadySent: sentRes.error && !logMissing ? new Set(userIds) : new Set(sentRes.rows.map((r) => r.user_id)),
      proOrgIds: pro,
    },
    MAX_ALERTS_PER_JOB,
  );
  const placeRow = audience.place ? regions.find((r) => r.id === audience.place) : null;
  return { job, country, audience, logMissing, placeName: placeRow?.name ?? null };
}

export type AlertRunState = "sent" | "off" | "dry" | "blocked";

export interface AlertRunResult {
  state: AlertRunState;
  /** Why nothing went out (state 'blocked'). */
  reason?: "not_found" | "not_pm_job" | "not_published" | "mailing_address" | "unsubscribe" | "log_missing";
  /** Recipients right now (before sending). */
  wouldEmail: number;
  sent: number;
  /** Matching companies (preview). */
  orgs: { name: string; city: string | null; pro: boolean }[];
  skipped?: AlertAudience["skipped"];
  truncated?: boolean;
}

/**
 * Email every matching trade about a published PM job, once each.
 * `dry`: report only. With PM_JOB_ALERTS_ENABLED off, it reports what would
 * have gone out and sends nothing. Each recipient is recorded in
 * lead_alert_log right before their email (a duplicate claim means another
 * run already took them), so a timeout never loses or repeats anyone: the
 * hourly catch-up (cron/pm-job-alerts) finishes the rest.
 */
export async function runPmJobAlerts(
  db: Db,
  rfpId: string,
  opts: { dry?: boolean; budgetMs?: number; enabled?: boolean; now?: () => number } = {},
): Promise<AlertRunResult> {
  const job = await loadJob(db, rfpId);
  const none = (reason: AlertRunResult["reason"]): AlertRunResult => ({ state: "blocked", reason, wouldEmail: 0, sent: 0, orgs: [] });
  if (!job) return none("not_found");
  if (!isPmJob(job)) return none("not_pm_job");
  const result = await loadAlertAudience(db, job);
  const { audience } = result;
  const base: AlertRunResult = {
    state: "dry",
    wouldEmail: audience.recipients.length,
    sent: 0,
    orgs: audience.orgs.map((o) => ({ name: o.name, city: o.city, pro: o.pro })),
    skipped: audience.skipped,
    truncated: audience.truncated,
  };
  if (opts.dry) return base;
  if (job.status !== "published") return { ...base, state: "blocked", reason: "not_published" };
  const enabled = opts.enabled ?? pmJobAlertsEnabled();
  if (!enabled) return { ...base, state: "off" };
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  if (!mailingAddress) return { ...base, state: "blocked", reason: "mailing_address" };
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
  if (!unsubscribeUrl(siteBase, "check")) return { ...base, state: "blocked", reason: "unsubscribe" };
  if (result.logMissing) return { ...base, state: "blocked", reason: "log_missing" };

  const clock = opts.now ?? Date.now;
  const started = clock();
  const budget = opts.budgetMs ?? 45_000;
  const langs = await recipientLangs(db, audience.recipients.map((r) => r.userId));
  const tradeNames = job.rfp_categories.map((c) => c.trade_categories?.name).filter((n): n is string => Boolean(n));
  let sent = 0;
  for (const r of audience.recipients) {
    if (clock() - started > budget) break;
    // Claim first: only the run that inserts the row sends.
    const { data: claimed, error } = await db
      .from("lead_alert_log")
      .upsert({ user_id: r.userId, lead_key: pmJobAlertKey(job.id) }, { onConflict: "user_id,lead_key", ignoreDuplicates: true })
      .select("user_id");
    if (error) {
      console.error("[pm-job-alerts] log failed", error.message);
      break;
    }
    if (!(claimed as unknown[] | null)?.length) continue;
    const lang = langs.get(r.userId) ?? "en";
    const unsub = unsubscribeUrl(siteBase, r.userId)!;
    const place = [job.city, job.province ? regionName(job.province, lang) : null].filter(Boolean).join(", ") || (result.placeName ? regionName(result.placeName, lang) : null);
    await sendPmJobAlert(r.email, {
      lang,
      title: job.title,
      slug: job.slug,
      trade: tradeNames[0] ? tradeName(tradeNames[0], lang) : null,
      place,
      deadline: job.deadline,
      summary: job.summary,
      pro: r.pro,
      freeLimit: FREE_MONTHLY_RESPONSES,
      unsubscribeUrl: unsub,
      mailingAddress,
    });
    // In-app, and the daily Pro digest skips what this already sent (same type + link).
    await db.from("notifications").insert({
      user_id: r.userId,
      type: "rfp_alert",
      title: "New matching opportunity",
      message: job.title,
      link_url: `/rfps/${job.slug}`,
    });
    sent++;
  }
  return { ...base, state: "sent", sent };
}

export interface RespondState {
  rfpId: string;
  title: string;
  /** When this company already responded (ISO), else null. */
  already: string | null;
  refusal: ReturnType<typeof respondDecision>["refusal"];
  free: boolean;
  allowance: Allowance;
  currency: "CAD" | "USD";
}

/**
 * The listing page's "Respond" box for a signed-in company: can it respond
 * here, did it already, and (free accounts) how many responses are left.
 * Null when it doesn't apply (no company, a public tender, not a PM job for a
 * free account). Reads with the service role: a free account can't read the
 * full listing row, and only the listing id and title reach the page.
 */
export async function respondStateFor(
  db: Db,
  slug: string,
  viewer: { userId: string; pro: boolean; org: { id: string; organization_type: string; status: string; profile_status: string } | null },
): Promise<RespondState | null> {
  // Only companies that respond to jobs (a poster viewing a job gets no box).
  if (!viewer.org || !(RESPONDER_ORG_TYPES as readonly string[]).includes(viewer.org.organization_type)) return null;
  const { data } = await db
    .from("rfp_posts")
    .select("id,title,status,source_type,province,posted_by_user_id,posted_by_organization_id")
    .eq("slug", slug)
    .maybeSingle();
  const rfp = data as { id: string; title: string; status: string; source_type: string | null; province: string | null; posted_by_user_id: string | null; posted_by_organization_id: string | null } | null;
  if (!rfp || rfp.source_type === "public_source") return null;
  if (!viewer.pro && !isPmJob(rfp)) return null;
  const [{ data: mine }, used] = await Promise.all([
    db.from("rfp_interests").select("created_at").eq("rfp_id", rfp.id).eq("trade_organization_id", viewer.org.id).maybeSingle(),
    viewer.pro ? Promise.resolve(0) : freeResponsesUsed(db, viewer.org.id),
  ]);
  const decision = respondDecision({ signedIn: true, org: viewer.org, pro: viewer.pro, rfp, userId: viewer.userId, usedThisMonth: used ?? Infinity });
  // Before the migration (used === null) a free account can't respond yet: no box.
  if (used === null && !viewer.pro) return null;
  return {
    rfpId: rfp.id,
    title: rfp.title,
    already: (mine as { created_at: string } | null)?.created_at ?? null,
    refusal: decision.refusal,
    free: decision.free,
    allowance: responseAllowance({ pro: viewer.pro, usedThisMonth: used ?? 0 }),
    currency: isUsState(rfp.province) ? "USD" : "CAD",
  };
}

/** Listings waiting at /admin/rfps (the admin nav badge and the new-post email). */
export async function pendingReviewCount(db: Db): Promise<number> {
  const { count, error } = await db.from("rfp_posts").select("id", { count: "exact", head: true }).eq("status", "pending_review");
  return error ? 0 : (count ?? 0);
}

function groupSet<T extends Record<string, unknown>>(rows: readonly T[], key: keyof T, val: keyof T): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = String(r[key]);
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(String(r[val]));
  }
  return out;
}
