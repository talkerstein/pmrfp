import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { chunk, selectIn, type Db } from "@/lib/supabase/select-in";
import { detectBadgeInstall, groupBySlug, INSTALL_KINDS, websiteDomain, type BadgeHitRow } from "@/lib/badge/install";
import { badgeRewardEnabled, isPayingSubscription, REWARD_DAYS } from "@/lib/badge/reward";
import { loadHitRows, loadRewards } from "@/lib/badge/server";
import { listRfps } from "@/lib/data/rfps";
import { getTaxonomyRows } from "@/lib/data/taxonomy";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { getMajorProjects, type MajorProject } from "@/lib/major-projects/data";
import { hubWins, type HubWin } from "@/lib/gc/hub";
import { AWARD_DAYS, buildLeadProfile, marketCounts, matchLeads, type RegionRow, type TradeRow } from "@/lib/leads/match";
import { leadsForViewer } from "@/lib/leads/view";
import { orgCountries, regionCountryMap } from "@/lib/alerts/country";
import { accountGeo, type CountryCode } from "@/lib/visitor-geo";
import { benchmarkPath, loadBenchmarkData } from "@/lib/data/price-benchmarks-load";
import { canonicalProvince, computeBenchmark, teaserOf, type BenchmarkAward } from "@/lib/data/price-benchmarks";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { foundingScarcity, spotsLeft, type FoundingScarcity } from "@/lib/founding/config";
import { isMissingTableError, trialState } from "@/lib/entitlement/trial";
import { lifecycleEmailConfigured, sendLifecycleEmail } from "@/lib/email/send";
import {
  claimD1Lifecycle, finishD1Lifecycle, inList, isD1Lifecycle, nativeLifecycleDb, readD1, readD1ByIds, readLifecycle, type LifecycleRead,
  recordD1LifecycleSkips, requireD1LifecycleAuthority, useD1Lifecycle, type LifecycleDb,
} from "./d1";
import { localClock } from "./timezone";
import { lifecycleUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";
import {
  BENCHMARK_MIN_AWARDS,
  FREE_HORIZON_MS,
  LIFECYCLE_REPLY_TO,
  RESCUE_HORIZON_MS,
  RESCUE_STEPS,
  STALLED_LIST_DAYS,
  MAX_MEMBERS_PER_RUN,
  MAX_SENDS_PER_RUN,
  RUN_TIME_BUDGET_MS,
  SEND_GAP_MS,
  isStepId,
  lifecycleEnabled,
  lifecycleFrom,
  lifecycleMaxPerDay,
  lifecycleStartAt,
  type StepId,
} from "./config";
import {
  cohortOf,
  describeDecision,
  openSteps,
  memberTimeZone,
  plan,
  type DecideOptions,
  type Decision,
  type MemberFacts,
  type MemberState,
  type SkipReason,
  type StopReason,
  type WaitReason,
} from "./schedule";
import { countryArea, renderStep, sampleCopyData, type CopyData, type RenderedEmail, type RescueCopy } from "./copy";
import type { BadgeCopy } from "./badge-copy";
import { personaOf, type Persona } from "./persona";
import { decideRescue, isInternalEmail, manualOutreach, missingParts, openBidsIn, resumePath, type RescueStopReason, type StalledState } from "./rescue";
import { isPastContract } from "@/lib/data/fomo";
import { countryOf } from "@/lib/visitor-geo";
import { parsePrefSlugs } from "@/lib/auth/signup-prefs";
import { STAGE_LABEL, stageOf, type Stage } from "@/lib/onboarding/steps";

/**
 * The lifecycle engine (service role): load every member who could be due a
 * step, decide (lib/lifecycle/schedule), record skips, send. Shared by the
 * cron (/api/cron/lifecycle) and the admin dry-run (/admin/lifecycle).
 *
 * Reads are batched per run (one query per table, chunked `in` lists); the
 * board, major projects, taxonomy and benchmarks load ONCE, and only when
 * some member is actually at a step that needs them.
 */

const DAY = 86_400_000;

export interface PlannedSend {
  userId: string;
  email: string;
  org: string;
  step: StepId;
  lang: Locale;
  country: CountryCode;
  subject: string;
  words: number;
}

export interface RunReport {
  enabled: boolean;
  dry: boolean;
  skipped?: string;
  considered: number;
  sends: PlannedSend[];
  skips: { userId: string; org: string; step: StepId; reason: SkipReason }[];
  waits: Partial<Record<WaitReason, number>>;
  stops: Partial<Record<StopReason, number>>;
  sent: number;
  failed: number;
  /** The onboarding rescue track (accounts with no company yet). */
  rescue: { considered: number; waits: Partial<Record<WaitReason, number>>; stops: Partial<Record<RescueStopReason, number>> };
  /** LIFECYCLE_START_AT as the run saw it. */
  startAt: { kind: "off" } | { kind: "on"; at: string };
  /** LIFECYCLE_MAX_PER_DAY, and how many lifecycle emails went out in the last 24 hours (null = no ceiling). */
  cap: { max: number; sentLast24h: number } | null;
  /** Every company considered and what the planner would do with it right now. Dry runs only. */
  members?: MemberPlan[];
}

/** One company's line in the dry run's "who gets what". */
export interface MemberPlan {
  userId: string;
  email: string;
  org: string;
  country: CountryCode;
  lang: Locale;
  /** normal = the regular sequence; catch_up = joined before LIFECYCLE_START_AT. */
  cohort: "normal" | "catch_up";
  action: Decision["action"];
  /** The email it would send now (action "send"), else null. */
  step: StepId | null;
  /** Plain words: "send welcome", "wait (quiet_hours)", "nothing (finished)". */
  summary: string;
  /** Steps that would be recorded as skipped first. */
  skipped: StepId[];
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  province: string | null;
  country: string | null;
  organization_type: string;
  status: string;
  is_demo: boolean;
  profile_status: string;
  website: string | null;
  approved_at: string | null;
  created_at: string;
}

interface Member {
  state: MemberState;
  email: string;
  firstName: string | null;
  lang: Locale;
  country: CountryCode;
  org: OrgRow;
  tradeSlugs: string[];
  regionIds: string[];
  /** Badge install detection (lib/badge/install) and the reward granted, for the badge emails. */
  install: ReturnType<typeof detectBadgeInstall>;
  reward: { kind: string; endsAt: string } | null;
}

const NO_FACTS: MemberFacts = {
  hasTrades: false,
  hasAreas: false,
  projects: 0,
  badgeInstalled: false,
  hasWebsite: false,
  badgeDetectedOn: null,
  leadTotal: null,
  benchmarkReady: null,
  canPost: false,
  forumPosts: 0,
  foundingSoldOut: false,
};

/* ------------------------------------------------------------------ shared data, loaded at most once per run */

interface MarketData {
  regions: RegionRow[];
  trades: TradeRow[];
  regionNameById: Map<string, string>;
  countryByRegion: Map<string, CountryCode>;
  rfps: Awaited<ReturnType<typeof listRfps>>;
  projects: MajorProject[];
  wins: HubWin[];
  today: string;
}

function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= load());
}

async function loadTaxonomy(): Promise<Pick<MarketData, "regions" | "trades" | "regionNameById" | "countryByRegion">> {
  const [regions, trades] = await Promise.all([getTaxonomyRows("regions").catch(() => []), getTaxonomyRows("trade_categories").catch(() => [])]);
  const regionRows: RegionRow[] = regions.map((r) => ({ id: r.id, slug: r.slug, name: r.name, province: r.province ?? null, country: r.country ?? null, parent_id: r.parent_id ?? null }));
  return {
    regions: regionRows,
    trades: trades.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    regionNameById: new Map(regionRows.map((r) => [r.id, r.name])),
    countryByRegion: regionCountryMap(regionRows),
  };
}

async function loadMarket(tax: Awaited<ReturnType<typeof loadTaxonomy>>): Promise<MarketData> {
  const today = torontoToday();
  const [rfps, projects] = await Promise.all([listRfps().catch(() => []), getMajorProjects().catch(() => [] as MajorProject[])]);
  const wins = hubWins(rfps.filter((r) => !r.isDemo), [], { today, days: AWARD_DAYS });
  return { ...tax, rfps, projects, wins, today };
}

/** One company's market: counts and up to 3 free-view lead titles. */
function marketFor(m: Member, md: MarketData) {
  const profile = buildLeadProfile({
    country: m.country,
    org: { city: m.org.city, province: m.org.province },
    tradeSlugs: m.tradeSlugs,
    regionIds: m.regionIds,
    regions: md.regions,
    trades: md.trades,
  });
  const leads = matchLeads({
    profile,
    rfps: md.rfps,
    projects: m.country === "CA" ? md.projects : [],
    regionNameById: md.regionNameById,
    today: md.today,
    wins: md.wins,
  });
  return {
    profile,
    counts: marketCounts(leads, md.today),
    titles: leadsForViewer(leads, false).map((l) => l.title),
  };
}

interface BenchFact {
  tradeSlug: string;
  trade: string;
  province: string;
  valued: number;
  examples: { title: string; amount: number; date: string }[];
  /** Trades with a priced range (≥ BENCHMARK_MIN_AWARDS) in the member's province. */
  ready: number;
}

/** The member's best-priced trade in their own province (country-first: the province decides the currency). */
function benchmarkFor(m: Member, data: { awards: BenchmarkAward[]; categories: { slug: string; name: string }[]; today: string }): BenchFact | null {
  const province = canonicalProvince(m.org.province);
  if (!province) return null;
  let best: BenchFact | null = null;
  let ready = 0;
  for (const slug of m.tradeSlugs.slice(0, 5)) {
    const cat = data.categories.find((c) => c.slug === slug);
    if (!cat) continue;
    const b = computeBenchmark(data.awards, { trade: cat.name, province }, data.today);
    if (b.country !== m.country) continue;
    if (b.valued < BENCHMARK_MIN_AWARDS) continue;
    ready++;
    if (!best || b.valued > best.valued) {
      best = {
        tradeSlug: slug,
        trade: cat.name,
        province,
        valued: b.valued,
        examples: teaserOf(b).examples.filter((e) => e.amount !== null).map((e) => ({ title: e.title, amount: e.amount!, date: e.date })),
        ready: 0,
      };
    }
  }
  return best ? { ...best, ready } : null;
}

/* ------------------------------------------------------------------ loading members */

function primaryCountry(org: OrgRow, regionIds: string[], byRegion: ReadonlyMap<string, CountryCode>): CountryCode {
  const own = accountGeo(org)?.country;
  if (own === "US" || own === "CA") return own;
  return orgCountries(org, regionIds, byRegion).has("CA") ? "CA" : "US";
}

const MEMBERSHIP_COLUMNS = "organization_id,user_id,created_at";
const ORG_COLUMNS = "id,name,slug,city,province,country,organization_type,status,is_demo,profile_status,website,approved_at,created_at";

function readByIds<T>(
  db: LifecycleDb, ids: string[], sql: string, query: (c: string[], legacy: Db) => ReturnType<Parameters<typeof selectIn<T>>[1]>,
) {
  if (!isD1Lifecycle(db)) return selectIn<T>(ids, (c) => query(c, db));
  return readD1ByIds<T>(db.app, ids, sql).then((rows) => ({ rows, error: null }),
    (): LifecycleRead<T> => ({ rows: [], error: { message: "D1 lifecycle query unavailable" } }));
}

const disabledPreference = (v: unknown) => v === false || v === 0;

async function loadMembers(
  db: LifecycleDb,
  now: Date,
  countryByRegion: ReadonlyMap<string, CountryCode>,
  opts: { startAt: Date | null },
): Promise<{ members: Member[]; error: string | null }> {
  const since = new Date(now.getTime() - FREE_HORIZON_MS).toISOString();
  const trialEndSince = new Date(now.getTime() - 12 * DAY).toISOString();
  type Membership = { organization_id: string; user_id: string; created_at: string };

  const membershipSql = `SELECT ${MEMBERSHIP_COLUMNS} FROM organization_members`;
  const [recent, trials, approvedRecent, older] = await Promise.all([
    readLifecycle<Membership>(db, `${membershipSql} WHERE julianday(created_at)>=julianday(?) ORDER BY julianday(created_at),user_id,organization_id LIMIT ?`,
      [since, MAX_MEMBERS_PER_RUN], (legacy) => legacy.from("organization_members").select(MEMBERSHIP_COLUMNS).gte("created_at", since).order("created_at", { ascending: true }).limit(MAX_MEMBERS_PER_RUN)),
    readLifecycle<{ organization_id: string }>(db, "SELECT organization_id FROM trade_trials WHERE julianday(ends_at)>=julianday(?) ORDER BY ends_at,organization_id LIMIT ?",
      [trialEndSince, MAX_MEMBERS_PER_RUN], (legacy) => legacy.from("trade_trials").select("organization_id").gte("ends_at", trialEndSince).limit(MAX_MEMBERS_PER_RUN)),
    readLifecycle<{ id: string }>(db, "SELECT id FROM organizations WHERE julianday(approved_at)>=julianday(?) ORDER BY approved_at,id LIMIT ?",
      [since, MAX_MEMBERS_PER_RUN], (legacy) => legacy.from("organizations").select("id").gte("approved_at", since).limit(MAX_MEMBERS_PER_RUN)),
    opts.startAt
      ? readLifecycle<Membership>(db, `${membershipSql} WHERE julianday(created_at)<julianday(?) ORDER BY julianday(created_at) DESC,user_id,organization_id LIMIT ?`,
        [since, MAX_MEMBERS_PER_RUN], (legacy) => legacy.from("organization_members").select(MEMBERSHIP_COLUMNS).lt("created_at", since).order("created_at", { ascending: false }).limit(MAX_MEMBERS_PER_RUN))
      : Promise.resolve({ rows: [] as Membership[], error: null }),
  ]);
  const cohortError = recent.error ?? older.error ?? (isD1Lifecycle(db) ? trials.error ?? approvedRecent.error : null);
  if (cohortError) return { members: [], error: cohortError.message };
  const trialOrgIds = trials.rows.map((t) => t.organization_id);
  const approvedOrgIds = approvedRecent.rows.map((o) => o.id);
  const trialMembers = await readByIds<Membership>(db, [...trialOrgIds, ...approvedOrgIds], `${membershipSql} WHERE organization_id ${inList}`,
    (c, legacy) => legacy.from("organization_members").select(MEMBERSHIP_COLUMNS).in("organization_id", c));
  if (isD1Lifecycle(db) && trialMembers.error) return { members: [], error: trialMembers.error.message };
  const memberships = [...recent.rows, ...trialMembers.rows, ...older.rows];
  if (!memberships.length) return { members: [], error: null };

  const orgIds = [...new Set(memberships.map((m) => m.organization_id))];
  const orgRes = await readByIds<OrgRow>(db, orgIds, `SELECT ${ORG_COLUMNS} FROM organizations WHERE id ${inList}`,
    (c, legacy) => legacy.from("organizations").select(ORG_COLUMNS).in("id", c));
  if (orgRes.error) return { members: [], error: orgRes.error.message };
  const orgs = new Map(orgRes.rows.filter((o) => o.organization_type === "trade_company").map((o) => [o.id, o]));

  // One row per user: their most recent trade company.
  const byUser = new Map<string, { organization_id: string; created_at: string }>();
  for (const m of memberships) {
    if (!orgs.has(m.organization_id)) continue;
    const cur = byUser.get(m.user_id);
    if (!cur || Date.parse(cur.created_at) < Date.parse(m.created_at)) byUser.set(m.user_id, m);
  }
  const userIds = [...byUser.keys()];
  if (!userIds.length) return { members: [], error: null };
  const tradeOrgIds = [...new Set([...byUser.values()].map((m) => m.organization_id))];
  const slugs = tradeOrgIds.map((id) => orgs.get(id)!.slug);

  const [profiles, prefs, sends, attrib, posts, subs, trialRows, cats, regs, studies, badges, rewards] = await Promise.all([
    readByIds<{ id: string; email: string; full_name: string | null; status: string; primary_role: string }>(db, userIds, `SELECT id,email,full_name,status,primary_role FROM users_profile WHERE id ${inList}`,
      (c, legacy) => legacy.from("users_profile").select("id,email,full_name,status,primary_role").in("id", c),
    ),
    readByIds<{ user_id: string; new_rfps: string | null; channel_email: boolean | 0 | 1 | null; lifecycle_emails: boolean | 0 | 1 | null }>(db, userIds, `SELECT user_id,new_rfps,channel_email,lifecycle_emails FROM notification_preferences WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("notification_preferences").select("user_id,new_rfps,channel_email,lifecycle_emails").in("user_id", c),
    ),
    readByIds<{ user_id: string; step: string; status: string; sent_at: string }>(db, userIds, `SELECT user_id,step,status,sent_at FROM lifecycle_sends WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("lifecycle_sends").select("user_id,step,status,sent_at").in("user_id", c),
    ),
    readByIds<{ user_id: string; lang: string | null }>(db, userIds, `SELECT user_id,lang FROM signup_attribution WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("signup_attribution").select("user_id,lang").in("user_id", c)),
    readByIds<{ author_id: string }>(db, userIds, `SELECT author_id FROM forum_posts WHERE author_id ${inList} ORDER BY id LIMIT 5000`,
      (c, legacy) => legacy.from("forum_posts").select("author_id").in("author_id", c).limit(5000)),
    readByIds<{ organization_id: string; status: string; tier: string | null; stripe_subscription_id: string | null }>(db, tradeOrgIds, `SELECT organization_id,status,tier,stripe_subscription_id FROM subscriptions WHERE organization_id ${inList}`,
      (c, legacy) => legacy.from("subscriptions").select("organization_id,status,tier,stripe_subscription_id").in("organization_id", c),
    ),
    readByIds<{ organization_id: string; started_at: string; ends_at: string }>(db, tradeOrgIds, `SELECT organization_id,started_at,ends_at FROM trade_trials WHERE organization_id ${inList}`,
      (c, legacy) => legacy.from("trade_trials").select("organization_id,started_at,ends_at").in("organization_id", c),
    ),
    readByIds<{ organization_id: string; trade_categories: { slug: string } | string | null }>(db, tradeOrgIds, `SELECT oc.organization_id,json_object('slug',tc.slug) AS trade_categories FROM organization_categories oc LEFT JOIN trade_categories tc ON tc.id=oc.category_id WHERE oc.organization_id ${inList}`,
      (c, legacy) => legacy.from("organization_categories").select("organization_id, trade_categories(slug)").in("organization_id", c),
    ),
    readByIds<{ organization_id: string; region_id: string }>(db, tradeOrgIds, `SELECT organization_id,region_id FROM organization_regions WHERE organization_id ${inList}`,
      (c, legacy) => legacy.from("organization_regions").select("organization_id,region_id").in("organization_id", c)),
    readByIds<{ organization_id: string }>(db, tradeOrgIds, `SELECT organization_id FROM case_studies WHERE organization_id ${inList} ORDER BY id LIMIT 5000`,
      (c, legacy) => legacy.from("case_studies").select("organization_id").in("organization_id", c).limit(5000)),
    // The badge loading from the company's OWN website on 2+ different days (lib/badge/install).
    isD1Lifecycle(db) ? readD1ByIds<BadgeHitRow>(db.app, slugs,
      `SELECT day,kind,slug,referrer FROM badge_hits WHERE slug ${inList} AND referrer<>'' AND kind ${inList} ORDER BY day,slug LIMIT 5000`,
      JSON.stringify(INSTALL_KINDS)).then((rows) => ({ rows, error: null }),
        (): LifecycleRead<BadgeHitRow> => ({ rows: [], error: { message: "D1 badge history unavailable" } })) : loadHitRows(db, slugs),
    isD1Lifecycle(db) ? readD1ByIds<{ organization_id: string; kind: string; trial_ends_after: string }>(db.app, tradeOrgIds,
      `SELECT organization_id,kind,trial_ends_after FROM badge_rewards WHERE organization_id ${inList}`)
      .then((rows) => new Map(rows.map((r) => [r.organization_id, { kind: r.kind, endsAt: r.trial_ends_after }]))).catch(() => null)
      : loadRewards(db, tradeOrgIds),
  ]);
  if (sends.error) return { members: [], error: isMissingTableError(sends.error) ? "lifecycle_sends table missing (run migration 20261016000020)" : sends.error.message };
  if (prefs.error) return { members: [], error: `notification_preferences: ${prefs.error.message} (run migration 20261016000020)` };
  if (subs.error) return { members: [], error: `subscriptions: ${subs.error.message}` };
  if (isD1Lifecycle(db) && [profiles, attrib, posts, trialRows, cats, regs, studies, badges].some((r) => r.error)) {
    return { members: [], error: "D1 lifecycle member facts unavailable" };
  }
  if (rewards === null) return { members: [], error: "D1 badge rewards unavailable" };

  const emails = profiles.rows.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
  const [suppressed, digest] = await Promise.all([
    readByIds<{ email_key: string }>(db, emails, `SELECT email_key FROM email_suppressions WHERE email_key ${inList}`,
      (c, legacy) => legacy.from("email_suppressions").select("email_key").in("email_key", c)),
    readByIds<{ email_key: string; status: string; last_sent_at: string | null }>(db, emails, `SELECT email_key,status,last_sent_at FROM digest_subscribers WHERE email_key ${inList}`,
      (c, legacy) => legacy.from("digest_subscribers").select("email_key,status,last_sent_at").in("email_key", c),
    ),
  ]);
  if (isD1Lifecycle(db) && digest.error) return { members: [], error: "D1 digest history unavailable" };
  if (suppressed.error && !isMissingTableError(suppressed.error)) return { members: [], error: `email_suppressions: ${suppressed.error.message}` };

  const profileById = new Map(profiles.rows.map((p) => [p.id, p]));
  const prefById = new Map(prefs.rows.map((p) => [p.user_id, p]));
  const langById = new Map(attrib.rows.map((a) => [a.user_id, a.lang]));
  const postsBy = new Map<string, number>();
  for (const p of posts.rows) postsBy.set(p.author_id, (postsBy.get(p.author_id) ?? 0) + 1);
  const paidOrgs = new Set(subs.rows.filter(isPayingSubscription).map((s) => s.organization_id));
  const trialByOrg = new Map(trialRows.rows.map((t) => [t.organization_id, { startedAt: t.started_at, endsAt: t.ends_at }]));
  const tradesByOrg = new Map<string, string[]>();
  for (const r of cats.rows) {
    const category = typeof r.trade_categories === "string" ? JSON.parse(r.trade_categories) as { slug: string | null } : r.trade_categories;
    if (category?.slug) tradesByOrg.set(r.organization_id, [...(tradesByOrg.get(r.organization_id) ?? []), category.slug]);
  }
  const regionsByOrg = new Map<string, string[]>();
  for (const r of regs.rows) regionsByOrg.set(r.organization_id, [...(regionsByOrg.get(r.organization_id) ?? []), r.region_id]);
  const projectsByOrg = new Map<string, number>();
  for (const s of studies.rows) projectsByOrg.set(s.organization_id, (projectsByOrg.get(s.organization_id) ?? 0) + 1);
  // A failed badge_hits read just means "no install seen": the badge emails go out as if nothing is installed.
  const hitsBySlug = groupBySlug(badges.error ? [] : badges.rows);
  const suppressedSet = new Set(suppressed.rows.map((s) => s.email_key));
  const digestByEmail = new Map(digest.rows.map((d) => [d.email_key, d]));
  const recordedBy = new Map<string, Set<StepId>>();
  const lastSentBy = new Map<string, string>();
  const sentAtBy = new Map<string, Partial<Record<StepId, string>>>();
  for (const s of sends.rows) {
    if (!isStepId(s.step)) continue;
    if (!recordedBy.has(s.user_id)) recordedBy.set(s.user_id, new Set());
    recordedBy.get(s.user_id)!.add(s.step);
    if ((s.status === "sent" || s.status === "sending") && (!lastSentBy.has(s.user_id) || Date.parse(lastSentBy.get(s.user_id)!) < Date.parse(s.sent_at))) lastSentBy.set(s.user_id, s.sent_at);
    if (s.status === "sent") sentAtBy.set(s.user_id, { ...(sentAtBy.get(s.user_id) ?? {}), [s.step]: s.sent_at });
  }

  const members: Member[] = [];
  for (const [userId, mem] of byUser) {
    const profile = profileById.get(userId);
    const org = orgs.get(mem.organization_id)!;
    if (!profile?.email) continue;
    const emailKey = profile.email.trim().toLowerCase();
    const pref = prefById.get(userId);
    const dig = digestByEmail.get(emailKey);
    const tradeSlugs = tradesByOrg.get(org.id) ?? [];
    const regionIds = regionsByOrg.get(org.id) ?? [];
    const rawLang = langById.get(userId);
    const install = detectBadgeInstall(org.website, hitsBySlug.get(org.slug) ?? [], org.slug);
    const state: MemberState = {
      userId,
      joinedAt: mem.created_at,
      province: org.province,
      active:
        profile.status === "active" &&
        org.status === "active" &&
        !org.is_demo &&
        // A listing turned down or suspended gets no sequence: it has nothing live to build on.
        !["rejected", "suspended"].includes(org.profile_status) &&
        !["admin", "super_admin"].includes(profile.primary_role),
      paid: paidOrgs.has(org.id),
      trial: trialByOrg.get(org.id) ?? null,
      optedOut: disabledPreference(pref?.lifecycle_emails) || disabledPreference(pref?.channel_email) || pref?.new_rfps === "off" || dig?.status === "unsubscribed",
      suppressed: suppressedSet.has(emailKey) || dig?.status === "bounced",
      recorded: recordedBy.get(userId) ?? new Set(),
      lastSentAt: lastSentBy.get(userId) ?? null,
      digestSentAt: dig?.last_sent_at ?? null,
      pendingReview: org.profile_status === "pending_review",
      profileApproved: org.profile_status === "approved",
      approvedAt: org.approved_at,
      sentAt: sentAtBy.get(userId) ?? {},
      internal: isInternalEmail(profile.email),
      facts: {
        ...NO_FACTS,
        hasTrades: tradeSlugs.length > 0,
        hasAreas: regionIds.length > 0,
        projects: projectsByOrg.get(org.id) ?? 0,
        hasWebsite: websiteDomain(org.website) !== null,
        badgeInstalled: install.detected,
        badgeDetectedOn: install.detectedOn,
        canPost: org.profile_status === "approved",
        forumPosts: postsBy.get(userId) ?? 0,
      },
    };
    members.push({
      state,
      email: profile.email,
      firstName: profile.full_name?.trim().split(/\s+/)[0] || null,
      lang: isEnabledLocale(rawLang) ? rawLang : "en",
      country: primaryCountry(org, regionIds, countryByRegion),
      org,
      tradeSlugs,
      regionIds,
      install,
      reward: rewards.get(org.id) ?? null,
    });
  }
  return { members, error: null };
}

/* ------------------------------------------------------------------ stalled sign-ups (onboarding rescue) */

export interface StalledSignup {
  state: StalledState;
  email: string;
  fullName: string | null;
  firstName: string | null;
  role: string;
  lang: Locale;
  country: CountryCode;
  createdAt: string;
  confirmedAt: string | null;
  provider: string | null;
  stage: Stage;
  /** form_error: the first field that failed. */
  stageDetail: string | null;
  prefs: { company: string | null; trades: string[]; regions: string[] };
  orgKind: string | null;
  /** Province / state from the sign-up region picks (quiet hours, examples). */
  province: string | null;
  /** Rescue emails recorded for them (sent / skipped / failed). */
  rescueSends: { step: StepId; status: string; sentAt: string }[];
}

interface AuthInfo {
  confirmedAt: string | null;
  provider: string | null;
  meta: Record<string, unknown>;
}

type AuthAdmin = { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data: { user: unknown } | null; error: unknown }> } } };

/** Email confirmation + sign-up picks from auth (service role), a few at a time. Unknown on any error (never sends then). */
async function authInfo(db: LifecycleDb, ids: string[]): Promise<Map<string, AuthInfo>> {
  if (isD1Lifecycle(db)) {
    const rows = await readD1ByIds<{ id: string; confirmed: string; provider: string | null; metadata: string | null }>(db.auth, ids,
      `SELECT u.id,coalesce(json_extract(m.metadata,'$.email_confirmed_at'),u.updatedAt,u.createdAt) AS confirmed,
          coalesce(json_extract(m.metadata,'$.raw_app_meta_data.provider'),
            (SELECT CASE WHEN a.providerId='credential' THEN 'email' ELSE a.providerId END
             FROM account a WHERE a.userId=u.id ORDER BY a.createdAt LIMIT 1)) AS provider,
          json_extract(m.metadata,'$.raw_user_meta_data') AS metadata
        FROM user u LEFT JOIN _auth_source_metadata m ON m.user_id=u.id
        WHERE u.id ${inList} AND u.emailVerified=1
          AND (u.banned=0 OR (u.banned=1 AND julianday(u.banExpires)<=julianday('now')))`);
    return new Map(rows.map((r) => [r.id, {
      confirmedAt: r.confirmed, provider: r.provider, meta: r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : {},
    }]));
  }
  const out = new Map<string, AuthInfo>();
  const get = (db as unknown as AuthAdmin).auth?.admin?.getUserById;
  if (typeof get !== "function") return out;
  for (const c of chunk(ids, 8)) {
    await Promise.all(
      c.map(async (id) => {
        try {
          const { data, error } = await get.call((db as unknown as AuthAdmin).auth!.admin, id);
          const u = data?.user as { email_confirmed_at?: string | null; app_metadata?: { provider?: string }; user_metadata?: Record<string, unknown> } | null;
          if (error || !u) return;
          out.set(id, { confirmedAt: u.email_confirmed_at ?? null, provider: u.app_metadata?.provider ?? null, meta: u.user_metadata ?? {} });
        } catch {
          /* unknown: treated as unconfirmed */
        }
      }),
    );
  }
  return out;
}

const regionIsUs = (r: { country?: string | null }) => ["usa", "us", "united states"].includes((r.country ?? "").trim().toLowerCase());

/**
 * Accounts that started but never finished onboarding: signed up within
 * `horizonMs`, in one of `roles`, and onboarding not completed OR no company
 * linked. Internal / test / demo addresses are left out entirely.
 */
export async function loadStalled(
  db: LifecycleDb,
  now: Date,
  tax: Pick<MarketData, "regions">,
  opts: { horizonMs: number; roles: readonly string[]; limit?: number },
): Promise<{ stalled: StalledSignup[]; error: string | null }> {
  const since = new Date(now.getTime() - opts.horizonMs).toISOString();
  const columns = "id,email,full_name,status,primary_role,onboarding_completed,created_at";
  type Profile = { id: string; email: string; full_name: string | null; status: string; primary_role: string; onboarding_completed: boolean | 0 | 1; created_at: string };
  const limit = opts.limit ?? MAX_MEMBERS_PER_RUN;
  const res = await readLifecycle<Profile>(db,
    `SELECT ${columns} FROM users_profile WHERE julianday(created_at)>=julianday(?) AND primary_role ${inList}
      ORDER BY julianday(created_at) DESC,id LIMIT ?`, [since, JSON.stringify(opts.roles), limit],
    (legacy) => legacy.from("users_profile").select(columns).gte("created_at", since)
      .in("primary_role", [...opts.roles]).order("created_at", { ascending: false }).limit(limit));
  if (res.error) return { stalled: [], error: `users_profile: ${res.error.message}` };
  const rows = res.rows.filter((p) => p.email && (typeof p.onboarding_completed === "boolean" ||
    (isD1Lifecycle(db) && (p.onboarding_completed === 0 || p.onboarding_completed === 1))) &&
    opts.roles.includes(p.primary_role) && !isInternalEmail(p.email));
  if (!rows.length) return { stalled: [], error: null };
  const memberships = await readByIds<{ user_id: string }>(db, rows.map((p) => p.id),
    `SELECT user_id FROM organization_members WHERE user_id ${inList}`,
    (c, legacy) => legacy.from("organization_members").select("user_id").in("user_id", c));
  if (memberships.error) return { stalled: [], error: `organization_members: ${memberships.error.message}` };
  const hasCompany = new Set(memberships.rows.map((m) => m.user_id));
  const candidates = rows.filter((p) => !p.onboarding_completed || !hasCompany.has(p.id));
  if (!candidates.length) return { stalled: [], error: null };
  const ids = candidates.map((p) => p.id);
  const emails = candidates.map((p) => p.email.trim().toLowerCase());

  const [auth, prefs, sends, attrib, steps, suppressed, digest] = await Promise.all([
    authInfo(db, ids),
    readByIds<{ user_id: string; new_rfps: string | null; channel_email: boolean | 0 | 1 | null; lifecycle_emails: boolean | 0 | 1 | null }>(db, ids, `SELECT user_id,new_rfps,channel_email,lifecycle_emails FROM notification_preferences WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("notification_preferences").select("user_id,new_rfps,channel_email,lifecycle_emails").in("user_id", c),
    ),
    readByIds<{ user_id: string; step: string; status: string; sent_at: string }>(db, ids, `SELECT user_id,step,status,sent_at FROM lifecycle_sends WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("lifecycle_sends").select("user_id,step,status,sent_at").in("user_id", c)),
    readByIds<{ user_id: string; lang: string | null; country: string | null }>(db, ids, `SELECT user_id,lang,country FROM signup_attribution WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("signup_attribution").select("user_id,lang,country").in("user_id", c)),
    readByIds<{ user_id: string; step: string; detail: string | null }>(db, ids, `SELECT user_id,step,detail FROM onboarding_steps WHERE user_id ${inList}`,
      (c, legacy) => legacy.from("onboarding_steps").select("user_id,step,detail").in("user_id", c)),
    readByIds<{ email_key: string }>(db, emails, `SELECT email_key FROM email_suppressions WHERE email_key ${inList}`,
      (c, legacy) => legacy.from("email_suppressions").select("email_key").in("email_key", c)),
    readByIds<{ email_key: string; status: string; last_sent_at: string | null }>(db, emails, `SELECT email_key,status,last_sent_at FROM digest_subscribers WHERE email_key ${inList}`,
      (c, legacy) => legacy.from("digest_subscribers").select("email_key,status,last_sent_at").in("email_key", c)),
  ]);
  if (sends.error) return { stalled: [], error: isMissingTableError(sends.error) ? "lifecycle_sends table missing (run migration 20261016000020)" : sends.error.message };
  if (prefs.error) return { stalled: [], error: `notification_preferences: ${prefs.error.message}` };
  if (isD1Lifecycle(db) && (digest.error || attrib.error || steps.error)) return { stalled: [], error: "D1 onboarding facts unavailable" };
  if (suppressed.error && !isMissingTableError(suppressed.error)) return { stalled: [], error: `email_suppressions: ${suppressed.error.message}` };

  const prefBy = new Map(prefs.rows.map((p) => [p.user_id, p]));
  const attribBy = new Map(attrib.rows.map((a) => [a.user_id, a]));
  const suppressedSet = new Set(suppressed.rows.map((s) => s.email_key));
  const digestBy = new Map(digest.rows.map((d) => [d.email_key, d]));
  const stepsBy = new Map<string, Set<string>>();
  const errorBy = new Map<string, string>();
  // A missing onboarding_steps table (migration not run yet) = nothing tracked.
  for (const s of steps.error ? [] : steps.rows) {
    if (!stepsBy.has(s.user_id)) stepsBy.set(s.user_id, new Set());
    stepsBy.get(s.user_id)!.add(s.step);
    if (s.step === "form_error" && s.detail) errorBy.set(s.user_id, s.detail);
  }
  const sendsBy = new Map<string, { step: StepId; status: string; sentAt: string }[]>();
  for (const s of sends.rows) {
    if (!isStepId(s.step)) continue;
    sendsBy.set(s.user_id, [...(sendsBy.get(s.user_id) ?? []), { step: s.step, status: s.status, sentAt: s.sent_at }]);
  }
  const regionBySlug = new Map(tax.regions.map((r) => [r.slug, r]));

  const stalled: StalledSignup[] = [];
  for (const p of candidates) {
    const a = auth.get(p.id) ?? null;
    const meta = a?.meta ?? {};
    const prefRegions = parsePrefSlugs(meta.pref_regions).filter((slug) => regionBySlug.has(slug));
    const company = typeof meta.pref_company === "string" ? meta.pref_company.trim().slice(0, 120) || null : null;
    const firstRegion = prefRegions.map((slug) => regionBySlug.get(slug)!).find(Boolean) ?? null;
    const attr = attribBy.get(p.id);
    const country: CountryCode = firstRegion ? (regionIsUs(firstRegion) ? "US" : "CA") : attr?.country === "US" ? "US" : "CA";
    const province = prefRegions.map((slug) => regionBySlug.get(slug)!.province).find((x): x is string => Boolean(x)) ?? (firstRegion && regionIsUs(firstRegion) && firstRegion.slug !== "united-states" ? firstRegion.name : null);
    const emailKey = p.email.trim().toLowerCase();
    const pref = prefBy.get(p.id);
    const dig = digestBy.get(emailKey);
    const userSends = sendsBy.get(p.id) ?? [];
    const recorded = new Set(userSends.map((s) => s.step));
    const lastSent = userSends.filter((s) => s.status === "sent" || s.status === "sending").map((s) => s.sentAt).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
    const completed = Boolean(p.onboarding_completed) && hasCompany.has(p.id);
    const steps = stepsBy.get(p.id) ?? new Set<string>();
    const stage = stageOf({ emailConfirmed: Boolean(a?.confirmedAt), steps, onboardingCompleted: Boolean(p.onboarding_completed), hasCompany: hasCompany.has(p.id) });
    const rawLang = attr?.lang;
    stalled.push({
      state: {
        userId: p.id,
        startedAt: a?.confirmedAt && Date.parse(a.confirmedAt) > Date.parse(p.created_at) ? a.confirmedAt : p.created_at,
        province,
        active: p.status === "active" && p.primary_role === "trade",
        internal: false,
        emailConfirmed: Boolean(a?.confirmedAt),
        completed,
        optedOut: disabledPreference(pref?.lifecycle_emails) || disabledPreference(pref?.channel_email) || pref?.new_rfps === "off" || dig?.status === "unsubscribed",
        suppressed: suppressedSet.has(emailKey) || dig?.status === "bounced",
        recorded,
        lastSentAt: lastSent,
        digestSentAt: dig?.last_sent_at ?? null,
      },
      email: p.email,
      fullName: p.full_name,
      firstName: p.full_name?.trim().split(/\s+/)[0] || null,
      role: p.primary_role,
      lang: isEnabledLocale(rawLang) ? rawLang : "en",
      country,
      createdAt: p.created_at,
      confirmedAt: a?.confirmedAt ?? null,
      provider: a?.provider ?? null,
      stage,
      stageDetail: errorBy.get(p.id) ?? null,
      prefs: { company, trades: parsePrefSlugs(meta.pref_categories), regions: prefRegions },
      orgKind: typeof meta.org_kind === "string" ? meta.org_kind : null,
      province,
      rescueSends: userSends.filter((s) => (RESCUE_STEPS as readonly string[]).includes(s.step)),
    });
  }
  return { stalled, error: null };
}

/** What the rescue email for this account says (real counts only). */
function rescueCopyData(s: StalledSignup, step: StepId, md: MarketData | null, tax: Awaited<ReturnType<typeof loadTaxonomy>>): CopyData {
  const lang = s.lang;
  const known = new Map(tax.trades.map((t) => [t.slug, t]));
  const tradeSlugs = s.prefs.trades.filter((slug) => known.has(slug));
  const tradeNames = tradeSlugs.map((slug) => tradeName(known.get(slug)!.name, lang));
  const regionBySlug = new Map(tax.regions.map((r) => [r.slug, r]));
  const firstRegion = s.prefs.regions.map((slug) => regionBySlug.get(slug)).find((r) => r && r.slug !== "canada" && r.slug !== "united-states");
  let area: string | null = firstRegion ? regionName(firstRegion.name, lang) : s.province ? regionName(s.province, lang) : null;

  let examples: RescueCopy["examples"] = null;
  if (step === "rescue_1d" && md) {
    if (tradeSlugs.length) {
      // Their sign-up areas, else their whole country.
      const regionIds = s.prefs.regions.map((slug) => regionBySlug.get(slug)?.id).filter((x): x is string => Boolean(x));
      const countryRegionIds = md.regions.filter((r) => (regionIsUs(r) ? "US" : "CA") === s.country).map((r) => r.id);
      const profile = buildLeadProfile({
        country: s.country,
        org: { city: null, province: s.province },
        tradeSlugs,
        regionIds: regionIds.length ? regionIds : countryRegionIds,
        regions: md.regions,
        trades: md.trades,
      });
      const leads = matchLeads({ profile, rfps: md.rfps, projects: s.country === "CA" ? md.projects : [], regionNameById: md.regionNameById, today: md.today, wins: md.wins });
      examples = { scope: "trade", total: leads.length, titles: leadsForViewer(leads, false).slice(0, 3).map((l) => l.title) };
      if (!regionIds.length) area = countryArea(s.country, lang);
    } else {
      const inCountry = (r: { province?: string | null }) => countryOf(r) === s.country;
      let bids = openBidsIn(md.rfps, { inCountry, province: s.province, today: md.today, isPast: isPastContract });
      // Counted by province, so name the province (not a city they picked).
      area = s.province ? regionName(s.province, lang) : countryArea(s.country, lang);
      if (!bids.length && s.province) {
        bids = openBidsIn(md.rfps, { inCountry, province: null, today: md.today, isPast: isPastContract });
        area = countryArea(s.country, lang);
      }
      examples = { scope: "area", total: bids.length, titles: bids.slice(0, 3).map((r) => r.title) };
    }
  }
  const missing = missingParts({ stage: s.stage, prefCompany: Boolean(s.prefs.company), prefTrades: tradeSlugs.length > 0, prefAreas: s.prefs.regions.length > 0 });
  return {
    lang,
    country: s.country,
    firstName: s.firstName,
    company: s.prefs.company ?? "",
    trades: tradeNames,
    area,
    hasTrades: tradeSlugs.length > 0,
    hasAreas: s.prefs.regions.length > 0,
    persona: personaOf(tradeSlugs),
    market: { openBids: 0, projects: 0, winners: 0, packages: 0, total: 0 },
    leadTitles: [],
    hasProject: false,
    badge: null,
    proBenchmarks: 0,
    benchmark: null,
    foundingScarcity: "quiet",
    trial: null,
    rescue: { missing, resumePath: resumePath({ orgKind: s.orgKind }), examples },
  };
}

export interface StalledRow {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  company: string | null;
  ageHours: number;
  confirmed: boolean;
  provider: string | null;
  stage: Stage;
  stageLabel: string;
  stageDetail: string | null;
  rescueSent: StepId[];
  /** What the rescue track would do now (dry). */
  next: string;
  manual: { subject: string; text: string };
}

/**
 * /admin/lifecycle "Stalled sign-ups": every unfinished account from the
 * last STALLED_LIST_DAYS days (trades, suppliers and property managers), for
 * a personal note. Read-only.
 */
export async function listStalledSignups(now: Date = new Date()): Promise<{ rows: StalledRow[]; error: string | null }> {
  if (!useD1Lifecycle() && !isServiceConfigured()) return { rows: [], error: "no service client" };
  const db = useD1Lifecycle() ? nativeLifecycleDb() : createServiceClient();
  const tax = await loadTaxonomy();
  const { stalled, error } = await loadStalled(db, now, tax, { horizonMs: STALLED_LIST_DAYS * DAY, roles: ["trade", "supplier", "property_manager"], limit: 500 });
  if (error) return { rows: [], error };
  const rows = stalled.map((s): StalledRow => {
    const d = decideRescue(s.state, now);
    const next =
      s.role !== "trade" ? "not emailed (rescue is for trades)" : d.action === "send" ? `would send ${d.step}` : d.action === "wait" ? `waiting (${d.reason})` : `stopped (${d.reason})`;
    return {
      userId: s.state.userId,
      email: s.email,
      name: s.fullName,
      role: s.orgKind === "builder" ? "general_contractor" : s.role,
      company: s.prefs.company,
      ageHours: Math.max(0, Math.round((now.getTime() - Date.parse(s.createdAt)) / 3_600_000)),
      confirmed: s.state.emailConfirmed,
      provider: s.provider,
      stage: s.stage,
      stageLabel: STAGE_LABEL[s.stage],
      stageDetail: s.stageDetail,
      rescueSent: s.rescueSends.filter((x) => x.status === "sent").map((x) => x.step),
      next,
      manual: manualOutreach({ email: s.email, firstName: s.firstName, company: s.prefs.company, role: s.role }),
    };
  });
  return { rows, error: null };
}

/* ------------------------------------------------------------------ trial activity (trial_day7 only) */

async function trialActivity(db: LifecycleDb, m: Member): Promise<{ alertsSent: number; saved: number; interests: number }> {
  const since = m.state.trial?.startedAt ?? new Date(0).toISOString();
  if (isD1Lifecycle(db)) {
    const [counts] = await readD1<{ alertsSent: number; saved: number; interests: number }>(db.app, `SELECT
      (SELECT count(*) FROM lead_alert_log WHERE user_id=? AND julianday(sent_at)>=julianday(?)) AS alertsSent,
      (SELECT count(*) FROM saved_rfps WHERE user_id=? AND julianday(created_at)>=julianday(?)) AS saved,
      (SELECT count(*) FROM rfp_interests WHERE trade_organization_id=? AND julianday(created_at)>=julianday(?)) AS interests`,
      m.state.userId, since, m.state.userId, since, m.org.id, since);
    return counts;
  }
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    return error ? 0 : (n ?? 0);
  };
  const [alertsSent, saved, interests] = await Promise.all([
    count(db.from("lead_alert_log").select("lead_key", { count: "exact", head: true }).eq("user_id", m.state.userId).gte("sent_at", since)),
    count(db.from("saved_rfps").select("id", { count: "exact", head: true }).eq("user_id", m.state.userId).gte("created_at", since)),
    count(db.from("rfp_interests").select("id", { count: "exact", head: true }).eq("trade_organization_id", m.org.id).gte("created_at", since)),
  ]);
  return { alertsSent, saved, interests };
}

/* ------------------------------------------------------------------ the run */

const MARKET_STEPS: ReadonlySet<StepId> = new Set(["market", "trial_offer", "trial_day1", "trial_day7", "trial_winback"]);
const BENCH_STEPS: ReadonlySet<StepId> = new Set(["market", "benchmark", "trial_offer"]);

export function lifecycleLinkBase(env = process.env): string {
  const canonical = "https://pmrfp.com";
  if (env.PMRFP_VPS_LIVE_AUTH === "enabled") return canonical;
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL || canonical);
    if (url.protocol === "https:" && !url.username && !url.password &&
      url.hostname !== "example.invalid" && !url.hostname.endsWith(".invalid")) return url.origin;
  } catch {
    // An invalid site setting cannot be used in customer-facing links.
  }
  return canonical;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runLifecycle(opts: { dry: boolean; now?: Date; maxSends?: number; sendGapMs?: number } = { dry: true }): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const enabled = lifecycleEnabled();
  const report: RunReport = {
    enabled,
    dry: opts.dry,
    considered: 0,
    sends: [],
    skips: [],
    waits: {},
    stops: {},
    sent: 0,
    failed: 0,
    rescue: { considered: 0, waits: {}, stops: {} },
    startAt: { kind: "off" },
    cap: null,
  };
  if (!useD1Lifecycle() && !isServiceConfigured()) return { ...report, skipped: "no service client" };
  if (!opts.dry && !enabled) return { ...report, skipped: "LIFECYCLE_EMAILS_ENABLED is off" };
  if (!opts.dry && !lifecycleEmailConfigured()) return { ...report, skipped: "lifecycle email transport not configured" };

  // The go-live cutoff. A value that isn't a date stops the run: guessing "off" would let old accounts catch up in a burst.
  const startSetting = lifecycleStartAt();
  if (startSetting.kind === "invalid") return { ...report, skipped: `LIFECYCLE_START_AT is not a date ("${startSetting.raw.slice(0, 40)}"): use e.g. 2026-10-23 or 2026-10-23T09:00:00-04:00` };
  const startAt = startSetting.kind === "on" ? startSetting.at : null;
  report.startAt = startAt ? { kind: "on", at: startAt.toISOString() } : { kind: "off" };
  const decideOpts: DecideOptions = { startAt };

  const base = lifecycleLinkBase();
  // Every send carries a signed one-click unsubscribe link and the List-Unsubscribe headers (lib/email/send). Never send without one.
  if (!opts.dry && !lifecycleUnsubscribeUrl(base, "probe")) return { ...report, skipped: "no unsubscribe signing secret (UNSUBSCRIBE_SECRET): emails would go out without a one-click unsubscribe" };

  const db = useD1Lifecycle() ? nativeLifecycleDb() : createServiceClient();
  if (!opts.dry && isD1Lifecycle(db)) {
    if (process.env.PMRFP_SMTP_ENABLED !== "enabled" || !process.env.UNSUBSCRIBE_SECRET) {
      return { ...report, skipped: "D1 lifecycle requires Hostinger SMTP and an unsubscribe secret" };
    }
    await requireD1LifecycleAuthority(db.app);
  }
  const probe = await readLifecycle(db, "SELECT id FROM lifecycle_sends LIMIT 1", [],
    (legacy) => legacy.from("lifecycle_sends").select("id").limit(1));
  if (probe.error) return { ...report, skipped: isMissingTableError(probe.error) ? "lifecycle_sends table missing (run migration 20261016000020)" : probe.error.message };

  const tax = await loadTaxonomy();
  const { members, error } = await loadMembers(db, now, tax.countryByRegion, { startAt });
  if (error) return { ...report, skipped: error };
  report.considered = members.length;
  if (opts.dry) report.members = [];

  // Count attempts, including failures, against the Hostinger mailbox budget.
  const smtp = process.env.PMRFP_SMTP_ENABLED === "enabled";
  const maxPerDay = lifecycleMaxPerDay() ?? (smtp ? 30 : null);
  let dayBudget = Number.POSITIVE_INFINITY;
  if (maxPerDay) {
    const last24 = new Date(now.getTime() - DAY).toISOString();
    const { count, error: capErr } = isD1Lifecycle(db)
      ? { count: (await readD1<{ n: number }>(db.app, `SELECT count(*) AS n FROM lifecycle_sends
          WHERE status IN ('sent','sending','failed') AND julianday(sent_at)>=julianday(?)`, last24))[0].n, error: null }
      : await db.from("lifecycle_sends").select("id", { count: "exact", head: true })
        .in("status", smtp ? ["sent", "sending", "failed"] : ["sent", "sending"]).gte("sent_at", last24);
    if (capErr) return { ...report, skipped: `could not count the last 24 hours of sends: ${capErr.message}` };
    report.cap = { max: maxPerDay, sentLast24h: count ?? 0 };
    dayBudget = Math.max(0, maxPerDay - (count ?? 0));
  }

  const market = lazy(() => loadMarket(tax));
  const bench = lazy(async () => {
    const d = await loadBenchmarkData();
    return { awards: d.awards, categories: d.categories, today: d.today };
  });
  const scarcity = lazy(async (): Promise<FoundingScarcity> => {
    const sold = await cachedLifetimeCount();
    return foundingScarcity(sold == null ? null : spotsLeft(sold));
  });

  const from = lifecycleFrom();
  const maxSends = opts.maxSends ?? MAX_SENDS_PER_RUN;
  // The per-run ceiling and the rolling 24-hour ceiling, whichever is lower.
  let budget = Math.min(maxSends, dayBudget);
  // Space sends and stop before the function's time limit.
  const gapMs = opts.sendGapMs ?? SEND_GAP_MS;
  const runStart = Date.now();
  let lastSendAt = 0;
  const outOfTime = () => !opts.dry && Date.now() - runStart > RUN_TIME_BUDGET_MS;
  const pace = async () => {
    const wait = lastSendAt + gapMs - Date.now();
    if (lastSendAt && wait > 0) await sleep(wait);
    lastSendAt = Date.now();
  };

  // 1. Onboarding rescue: trade accounts with no company yet. Time-sensitive, so first.
  const stalledRes = await loadStalled(db, now, tax, { horizonMs: RESCUE_HORIZON_MS, roles: ["trade"] });
  if (stalledRes.error) {
    if (isD1Lifecycle(db)) return { ...report, skipped: stalledRes.error };
    console.error("[lifecycle] rescue load failed", stalledRes.error);
  }
  report.rescue.considered = stalledRes.stalled.length;
  for (const s of stalledRes.stalled) {
    if (budget <= 0) break;
    const decision = decideRescue(s.state, now);
    if (decision.action === "wait") {
      report.rescue.waits[decision.reason] = (report.rescue.waits[decision.reason] ?? 0) + 1;
      continue;
    }
    if (decision.action === "stop") {
      report.rescue.stops[decision.reason] = (report.rescue.stops[decision.reason] ?? 0) + 1;
      continue;
    }
    const step = decision.step;
    const data = rescueCopyData(s, step, step === "rescue_1d" ? await market() : null, tax);
    const unsub = lifecycleUnsubscribeUrl(base, s.state.userId);
    const email = renderStep(step, data, { base, unsubscribeUrl: unsub });
    const label = s.prefs.company ?? "(no company yet)";
    report.sends.push({ userId: s.state.userId, email: s.email, org: label, step, lang: s.lang, country: s.country, subject: email.subject, words: email.words });
    budget--;
    if (opts.dry) continue;
    if (outOfTime()) break;
    await pace();
    const res = await claimAndSend(db, { userId: s.state.userId, orgId: null, step, lang: s.lang, to: s.email, from, email, unsub }, now, s.state.province, maxPerDay);
    if (res === "sent") report.sent++;
    else if (res === "failed") report.failed++;
  }

  // 2. Companies: review_pending, the free track, the trial track.
  for (const m of members) {
    // A dry run keeps going past the ceiling so the preview lists everyone; a real run stops.
    const exhausted = budget <= 0;
    if (exhausted && !opts.dry) break;
    const open = new Set(openSteps(m.state, now, decideOpts));
    let mk: ReturnType<typeof marketFor> | null = null;
    let bf: BenchFact | null = null;
    if (!m.state.facts.hasTrades) {
      // No trades picked = nothing can match: no leads, no benchmark.
      m.state.facts.leadTotal = 0;
      m.state.facts.benchmarkReady = false;
    } else if ([...open].some((s) => MARKET_STEPS.has(s))) {
      mk = marketFor(m, await market());
      m.state.facts.leadTotal = mk.counts.total;
    }
    if (m.state.facts.hasTrades && [...open].some((s) => BENCH_STEPS.has(s))) {
      bf = benchmarkFor(m, await bench());
      m.state.facts.benchmarkReady = Boolean(bf);
    }
    if (open.has("founding")) m.state.facts.foundingSoldOut = (await scarcity()) === "soldout";

    const { skips, decision } = plan(m.state, now, decideOpts);
    report.members?.push({
      userId: m.state.userId,
      email: m.email,
      org: m.org.name,
      country: m.country,
      lang: m.lang,
      cohort: cohortOf(m.state, startAt).mode,
      action: exhausted && decision.action === "send" ? "wait" : decision.action,
      step: decision.action === "send" && !exhausted ? decision.step : null,
      summary: exhausted && decision.action === "send" ? `send ${decision.step} (held back: daily limit reached)` : describeDecision(decision),
      skipped: skips.map((s) => s.step),
    });
    for (const s of skips) report.skips.push({ userId: m.state.userId, org: m.org.name, step: s.step, reason: s.reason });
    if (!opts.dry && skips.length && isD1Lifecycle(db)) {
      await recordD1LifecycleSkips(db.app, m.state.userId, m.org.id, m.lang, skips);
    } else if (!opts.dry && skips.length && !isD1Lifecycle(db)) {
      const { error: skipErr } = await db.from("lifecycle_sends").upsert(
        skips.map((s) => ({ user_id: m.state.userId, organization_id: m.org.id, step: s.step, status: "skipped", detail: s.reason, lang: m.lang })),
        { onConflict: "user_id,step", ignoreDuplicates: true },
      );
      if (skipErr) console.error("[lifecycle] skip record failed", skipErr.message);
    }
    if (decision.action === "wait") {
      report.waits[decision.reason] = (report.waits[decision.reason] ?? 0) + 1;
      continue;
    }
    if (decision.action === "stop") {
      report.stops[decision.reason] = (report.stops[decision.reason] ?? 0) + 1;
      continue;
    }
    if (decision.action !== "send" || exhausted) continue;
    const step = decision.step;

    if (!mk && MARKET_STEPS.has(step) && m.state.facts.hasTrades) mk = marketFor(m, await market());
    const data = await copyDataFor(db, m, step, { mk, bf, scarcity: await scarcity(), now });
    const unsub = lifecycleUnsubscribeUrl(base, m.state.userId);
    const email = renderStep(step, data, { base, unsubscribeUrl: unsub });
    report.sends.push({ userId: m.state.userId, email: m.email, org: m.org.name, step, lang: m.lang, country: m.country, subject: email.subject, words: email.words });
    budget--;
    if (opts.dry) continue;

    if (outOfTime()) break;
    await pace();
    const res = await claimAndSend(db, { userId: m.state.userId, orgId: m.org.id, step, lang: m.lang, to: m.email, from, email, unsub }, now, m.state.province, maxPerDay);
    if (res === "sent") report.sent++;
    else if (res === "failed") report.failed++;
  }
  return report;
}

/**
 * Record first, then send: the unique (user_id, step) means a racing run or
 * a retry never sends the same step twice.
 */
async function claimAndSend(
  db: LifecycleDb,
  p: { userId: string; orgId: string | null; step: StepId; lang: Locale; to: string; from: string; email: RenderedEmail; unsub: string | null },
  now: Date,
  province: string | null,
  maxPerDay: number | null,
): Promise<"sent" | "failed" | "claimed_elsewhere"> {
  let id: string | null;
  if (isD1Lifecycle(db)) {
    if (!p.unsub || !maxPerDay) throw new Error("D1 lifecycle delivery is not configured");
    const verified = await db.auth.prepare(`SELECT id FROM user WHERE id=? AND lower(trim(email))=?
      AND emailVerified=1 AND (banned=0 OR (banned=1 AND julianday(banExpires)<=julianday('now')))`)
      .bind(p.userId, p.to.trim().toLowerCase()).first();
    if (!verified) return "claimed_elsewhere";
    const actualNow = new Date();
    const tz = memberTimeZone(province);
    const today = localClock(now, tz).date;
    if (localClock(actualNow, tz).date !== today) return "claimed_elsewhere";
    // Find local midnight without assuming a UTC offset or a 24-hour calendar day.
    let low = Math.floor(now.getTime() / 1000) - 26 * 3600;
    let high = Math.ceil(now.getTime() / 1000);
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (localClock(new Date(mid * 1000), tz).date === today) high = mid;
      else low = mid;
    }
    id = await claimD1Lifecycle(db.app, p, {
      now: actualNow.toISOString(), todayStart: new Date(high * 1000).toISOString(),
      last24: new Date(actualNow.getTime() - DAY).toISOString(), maxPerDay,
    });
  } else {
    const { data: claimed, error: claimErr } = await db
      .from("lifecycle_sends")
      .upsert({ user_id: p.userId, organization_id: p.orgId, step: p.step, status: "sending", lang: p.lang }, { onConflict: "user_id,step", ignoreDuplicates: true })
      .select("id");
    if (claimErr) console.error("[lifecycle] claim failed", claimErr.message);
    id = claimErr ? null : (claimed?.[0] as { id: string } | undefined)?.id ?? null;
  }
  if (!id) return "claimed_elsewhere";
  const res = await sendLifecycleEmail({
    to: p.to,
    from: p.from,
    replyTo: LIFECYCLE_REPLY_TO,
    subject: p.email.subject,
    text: p.email.text,
    html: p.email.html,
    unsubscribeUrl: p.unsub,
    step: p.step,
  });
  if (isD1Lifecycle(db)) {
    await finishD1Lifecycle(db.app, id, p.to, res);
    return res.ok ? "sent" : "failed";
  }
  if (res.invalidRecipient) {
    const email = p.to.trim().toLowerCase();
    const { error } = await db.from("email_suppressions")
      .upsert({ email_key: email, reason: "bounce", detail: "Hostinger SMTP rejected the recipient address" },
        { onConflict: "email_key", ignoreDuplicates: true });
    if (error) throw new Error("Lifecycle bounce suppression could not be saved");
    const { error: digestError } = await db.from("digest_subscribers")
      .update({ status: "bounced", updated_at: new Date().toISOString() }).eq("email_key", email);
    if (digestError) console.error("[lifecycle] digest bounce status unavailable");
  }
  const { error: receiptError } = await db
    .from("lifecycle_sends")
    .update({ status: res.ok ? "sent" : "failed", resend_id: res.id, detail: res.ok ? null : (res.error ?? "send failed").slice(0, 300), sent_at: new Date().toISOString() })
    .eq("id", id);
  if (receiptError) throw new Error("Lifecycle delivery receipt could not be saved");
  return res.ok ? "sent" : "failed";
}

/**
 * What the badge emails say about this company. The reward line is only ever
 * true: an offer only while BADGE_REWARD_ENABLED is on and this company could
 * still earn it (free, no reward yet, a real website that isn't ours); "granted"
 * only when its badge_rewards row exists.
 */
function badgeCopyFor(m: Member): BadgeCopy {
  const { install } = m;
  let reward: BadgeCopy["reward"] = null;
  if (m.reward) reward = { state: "granted", days: REWARD_DAYS, endsAt: m.reward.endsAt };
  else if (badgeRewardEnabled() && !m.state.paid && install.domain && !install.ownDomain) reward = { state: "offer", days: REWARD_DAYS, endsAt: null };
  return { slug: m.org.slug, website: install.domain, detectedDomain: install.detected ? install.domain : null, reward };
}

async function copyDataFor(
  db: LifecycleDb,
  m: Member,
  step: StepId,
  ctx: { mk: ReturnType<typeof marketFor> | null; bf: BenchFact | null; scarcity: FoundingScarcity; now: Date },
): Promise<CopyData> {
  const lang = m.lang;
  const counts = ctx.mk?.counts ?? { openBids: 0, projects: 0, winners: 0, packages: 0, total: 0 };
  const tax = ctx.mk?.profile;
  const tradeNames = tax ? [...tax.nameBySlug.values()].map((n) => tradeName(n, lang)) : [];
  const province = m.org.province ? regionName(canonicalProvince(m.org.province) ?? m.org.province, lang) : null;
  const area = m.org.city || province || (tax ? [...tax.provinces].map((p) => regionName(p, lang))[0] ?? null : null);
  let trial: CopyData["trial"] = null;
  if (m.state.trial) {
    const ts = trialState(m.state.trial, ctx.now);
    const activity = step === "trial_day7" ? await trialActivity(db, m) : { alertsSent: 0, saved: 0, interests: 0 };
    trial = { endsAt: m.state.trial.endsAt, daysLeft: ts.daysLeft, ...activity };
  }
  return {
    lang,
    country: m.country,
    firstName: m.firstName,
    company: m.org.name,
    trades: tradeNames.length ? tradeNames : m.tradeSlugs.map((s) => s.replace(/-/g, " ")),
    area,
    hasTrades: m.state.facts.hasTrades,
    hasAreas: m.state.facts.hasAreas,
    persona: personaOf(m.tradeSlugs),
    market: counts,
    leadTitles: ctx.mk?.titles.slice(0, 3) ?? [],
    hasProject: m.state.facts.projects > 0,
    badge: badgeCopyFor(m),
    proBenchmarks: ctx.bf?.ready ?? 0,
    benchmark: ctx.bf
      ? {
          trade: tradeName(ctx.bf.trade, lang),
          province: regionName(ctx.bf.province, lang),
          valued: ctx.bf.valued,
          examples: ctx.bf.examples,
          path: benchmarkPath(ctx.bf.tradeSlug, ctx.bf.province),
        }
      : null,
    foundingScarcity: ctx.scarcity,
    trial,
  };
}

/* ------------------------------------------------------------------ admin preview + test send */

export function previewEmail(
  step: StepId,
  lang: Locale,
  country: CountryCode,
  unsubscribeUserId = "preview-user",
  persona: Persona = "specialty",
  /** The badge emails: show the reward line (the live BADGE_REWARD_ENABLED flag by default, or the admin's toggle) and/or a company with no website. */
  opts: { reward?: boolean; website?: boolean } = {},
): RenderedEmail {
  const base = lifecycleLinkBase();
  const data = sampleCopyData(step, lang, country, persona, { reward: opts.reward ?? badgeRewardEnabled(), website: opts.website });
  return renderStep(step, data, { base, unsubscribeUrl: lifecycleUnsubscribeUrl(base, unsubscribeUserId) });
}

/** The sample email to ONE admin address, subject marked [Test]. Not recorded in lifecycle_sends. */
export async function sendTestToAdmin(p: {
  to: string;
  userId: string;
  step: StepId;
  lang: Locale;
  country: CountryCode;
  persona?: Persona;
  reward?: boolean;
  website?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const email = previewEmail(p.step, p.lang, p.country, p.userId, p.persona, { reward: p.reward, website: p.website });
  const base = lifecycleLinkBase();
  const res = await sendLifecycleEmail({
    to: p.to,
    from: lifecycleFrom(),
    replyTo: LIFECYCLE_REPLY_TO,
    subject: `[Test] ${email.subject}`,
    text: email.text,
    html: email.html,
    unsubscribeUrl: lifecycleUnsubscribeUrl(base, p.userId),
    step: p.step,
  });
  return { ok: res.ok, error: res.error };
}
