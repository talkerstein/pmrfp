import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
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
import { foundingScarcity, isLifetimeSubscriptionId, spotsLeft, type FoundingScarcity } from "@/lib/founding/config";
import { isMissingTableError, trialState } from "@/lib/entitlement/trial";
import { emailConfigured, sendLifecycleEmail } from "@/lib/email/send";
import { lifecycleUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { isEnabledLocale, type Locale } from "@/i18n/config";
import { regionName, tradeName } from "@/i18n/terms";
import {
  BENCHMARK_MIN_AWARDS,
  FREE_HORIZON_MS,
  LIFECYCLE_REPLY_TO,
  MAX_MEMBERS_PER_RUN,
  MAX_SENDS_PER_RUN,
  isStepId,
  lifecycleEnabled,
  lifecycleFrom,
  type StepId,
} from "./config";
import { openSteps, plan, type MemberFacts, type MemberState, type SkipReason, type StopReason, type WaitReason } from "./schedule";
import { renderStep, sampleCopyData, type CopyData, type RenderedEmail } from "./copy";
import { personaOf, type Persona } from "./persona";

/**
 * The lifecycle engine (service role): load every member who could be due a
 * step, decide (lib/lifecycle/schedule), record skips, send. Shared by the
 * cron (/api/cron/lifecycle) and the admin dry-run (/admin/lifecycle).
 *
 * Reads are batched per run (one query per table, chunked `in` lists); the
 * board, major projects, taxonomy and benchmarks load ONCE, and only when
 * some member is actually at a step that needs them.
 */

type Db = SupabaseClient;
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
}

const chunk = <T,>(xs: T[], n = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** `select … in (ids)` over chunks; rows from every chunk. Errors → null (caller decides). */
async function selectIn<T>(
  ids: string[],
  q: (chunkIds: string[]) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<{ rows: T[]; error: { message: string; code?: string } | null }> {
  const rows: T[] = [];
  for (const c of chunk([...new Set(ids)])) {
    if (!c.length) continue;
    const { data, error } = await q(c);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, error: null };
}

const NO_FACTS: MemberFacts = {
  hasTrades: false,
  hasAreas: false,
  projects: 0,
  badgeInstalled: false,
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

async function loadMembers(db: Db, now: Date, countryByRegion: ReadonlyMap<string, CountryCode>): Promise<{ members: Member[]; error: string | null }> {
  const since = new Date(now.getTime() - FREE_HORIZON_MS).toISOString();
  const trialEndSince = new Date(now.getTime() - 12 * DAY).toISOString();

  const [recent, trials] = await Promise.all([
    db
      .from("organization_members")
      .select("organization_id,user_id,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(MAX_MEMBERS_PER_RUN),
    db.from("trade_trials").select("organization_id").gte("ends_at", trialEndSince).limit(MAX_MEMBERS_PER_RUN),
  ]);
  if (recent.error) return { members: [], error: recent.error.message };
  const trialOrgIds = ((trials.data ?? []) as { organization_id: string }[]).map((t) => t.organization_id);
  const trialMembers = await selectIn<{ organization_id: string; user_id: string; created_at: string }>(trialOrgIds, (c) =>
    db.from("organization_members").select("organization_id,user_id,created_at").in("organization_id", c),
  );
  const memberships = [...((recent.data ?? []) as { organization_id: string; user_id: string; created_at: string }[]), ...trialMembers.rows];
  if (!memberships.length) return { members: [], error: null };

  const orgIds = [...new Set(memberships.map((m) => m.organization_id))];
  const orgRes = await selectIn<OrgRow>(orgIds, (c) =>
    db.from("organizations").select("id,name,slug,city,province,country,organization_type,status,is_demo,profile_status,created_at").in("id", c),
  );
  if (orgRes.error) return { members: [], error: orgRes.error.message };
  const orgs = new Map(orgRes.rows.filter((o) => o.organization_type === "trade_company").map((o) => [o.id, o]));

  // One row per user: their most recent trade company.
  const byUser = new Map<string, { organization_id: string; created_at: string }>();
  for (const m of memberships) {
    if (!orgs.has(m.organization_id)) continue;
    const cur = byUser.get(m.user_id);
    if (!cur || cur.created_at < m.created_at) byUser.set(m.user_id, m);
  }
  const userIds = [...byUser.keys()];
  if (!userIds.length) return { members: [], error: null };
  const tradeOrgIds = [...new Set([...byUser.values()].map((m) => m.organization_id))];
  const slugs = tradeOrgIds.map((id) => orgs.get(id)!.slug);

  const [profiles, prefs, sends, attrib, posts, subs, trialRows, cats, regs, studies, badges] = await Promise.all([
    selectIn<{ id: string; email: string; full_name: string | null; status: string; primary_role: string }>(userIds, (c) =>
      db.from("users_profile").select("id,email,full_name,status,primary_role").in("id", c),
    ),
    selectIn<{ user_id: string; new_rfps: string | null; channel_email: boolean | null; lifecycle_emails: boolean | null }>(userIds, (c) =>
      db.from("notification_preferences").select("user_id,new_rfps,channel_email,lifecycle_emails").in("user_id", c),
    ),
    selectIn<{ user_id: string; step: string; status: string; sent_at: string }>(userIds, (c) =>
      db.from("lifecycle_sends").select("user_id,step,status,sent_at").in("user_id", c),
    ),
    selectIn<{ user_id: string; lang: string | null }>(userIds, (c) => db.from("signup_attribution").select("user_id,lang").in("user_id", c)),
    selectIn<{ author_id: string }>(userIds, (c) => db.from("forum_posts").select("author_id").in("author_id", c).limit(5000)),
    selectIn<{ organization_id: string; status: string; tier: string | null; stripe_subscription_id: string | null }>(tradeOrgIds, (c) =>
      db.from("subscriptions").select("organization_id,status,tier,stripe_subscription_id").in("organization_id", c),
    ),
    selectIn<{ organization_id: string; started_at: string; ends_at: string }>(tradeOrgIds, (c) =>
      db.from("trade_trials").select("organization_id,started_at,ends_at").in("organization_id", c),
    ),
    selectIn<{ organization_id: string; trade_categories: { slug: string } | null }>(tradeOrgIds, (c) =>
      db.from("organization_categories").select("organization_id, trade_categories(slug)").in("organization_id", c),
    ),
    selectIn<{ organization_id: string; region_id: string }>(tradeOrgIds, (c) => db.from("organization_regions").select("organization_id,region_id").in("organization_id", c)),
    selectIn<{ organization_id: string }>(tradeOrgIds, (c) => db.from("case_studies").select("organization_id").in("organization_id", c).limit(5000)),
    selectIn<{ slug: string; referrer: string }>(slugs, (c) => db.from("badge_hits").select("slug,referrer").eq("kind", "listed").neq("referrer", "").in("slug", c).limit(5000)),
  ]);
  if (sends.error) return { members: [], error: isMissingTableError(sends.error) ? "lifecycle_sends table missing (run migration 20261016000020)" : sends.error.message };
  if (prefs.error) return { members: [], error: `notification_preferences: ${prefs.error.message} (run migration 20261016000020)` };
  if (subs.error) return { members: [], error: `subscriptions: ${subs.error.message}` };

  const emails = profiles.rows.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
  const [suppressed, digest] = await Promise.all([
    selectIn<{ email_key: string }>(emails, (c) => db.from("email_suppressions").select("email_key").in("email_key", c)),
    selectIn<{ email_key: string; status: string; last_sent_at: string | null }>(emails, (c) =>
      db.from("digest_subscribers").select("email_key,status,last_sent_at").in("email_key", c),
    ),
  ]);
  if (suppressed.error && !isMissingTableError(suppressed.error)) return { members: [], error: `email_suppressions: ${suppressed.error.message}` };

  const profileById = new Map(profiles.rows.map((p) => [p.id, p]));
  const prefById = new Map(prefs.rows.map((p) => [p.user_id, p]));
  const langById = new Map(attrib.rows.map((a) => [a.user_id, a.lang]));
  const postsBy = new Map<string, number>();
  for (const p of posts.rows) postsBy.set(p.author_id, (postsBy.get(p.author_id) ?? 0) + 1);
  const paidOrgs = new Set(
    subs.rows
      .filter((s) => (s.status === "active" || s.status === "comped") && (s.tier === "pro" || s.tier === "featured" || isLifetimeSubscriptionId(s.stripe_subscription_id)))
      .map((s) => s.organization_id),
  );
  const trialByOrg = new Map(trialRows.rows.map((t) => [t.organization_id, { startedAt: t.started_at, endsAt: t.ends_at }]));
  const tradesByOrg = new Map<string, string[]>();
  for (const r of cats.rows) if (r.trade_categories?.slug) tradesByOrg.set(r.organization_id, [...(tradesByOrg.get(r.organization_id) ?? []), r.trade_categories.slug]);
  const regionsByOrg = new Map<string, string[]>();
  for (const r of regs.rows) regionsByOrg.set(r.organization_id, [...(regionsByOrg.get(r.organization_id) ?? []), r.region_id]);
  const projectsByOrg = new Map<string, number>();
  for (const s of studies.rows) projectsByOrg.set(s.organization_id, (projectsByOrg.get(s.organization_id) ?? 0) + 1);
  const badgeSlugs = new Set(badges.rows.filter((b) => b.referrer).map((b) => b.slug));
  const suppressedSet = new Set(suppressed.rows.map((s) => s.email_key));
  const digestByEmail = new Map(digest.rows.map((d) => [d.email_key, d]));
  const recordedBy = new Map<string, Set<StepId>>();
  const lastSentBy = new Map<string, string>();
  for (const s of sends.rows) {
    if (!isStepId(s.step)) continue;
    if (!recordedBy.has(s.user_id)) recordedBy.set(s.user_id, new Set());
    recordedBy.get(s.user_id)!.add(s.step);
    if ((s.status === "sent" || s.status === "sending") && (!lastSentBy.has(s.user_id) || lastSentBy.get(s.user_id)! < s.sent_at)) lastSentBy.set(s.user_id, s.sent_at);
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
    const state: MemberState = {
      userId,
      joinedAt: mem.created_at,
      province: org.province,
      active:
        profile.status === "active" &&
        org.status === "active" &&
        !org.is_demo &&
        !["admin", "super_admin"].includes(profile.primary_role),
      paid: paidOrgs.has(org.id),
      trial: trialByOrg.get(org.id) ?? null,
      optedOut: pref?.lifecycle_emails === false || pref?.channel_email === false || pref?.new_rfps === "off" || dig?.status === "unsubscribed",
      suppressed: suppressedSet.has(emailKey) || dig?.status === "bounced",
      recorded: recordedBy.get(userId) ?? new Set(),
      lastSentAt: lastSentBy.get(userId) ?? null,
      digestSentAt: dig?.last_sent_at ?? null,
      facts: {
        ...NO_FACTS,
        hasTrades: tradeSlugs.length > 0,
        hasAreas: regionIds.length > 0,
        projects: projectsByOrg.get(org.id) ?? 0,
        badgeInstalled: badgeSlugs.has(org.slug),
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
    });
  }
  return { members, error: null };
}

/* ------------------------------------------------------------------ trial activity (trial_day7 only) */

async function trialActivity(db: Db, m: Member): Promise<{ alertsSent: number; saved: number; interests: number }> {
  const since = m.state.trial?.startedAt ?? new Date(0).toISOString();
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

export async function runLifecycle(opts: { dry: boolean; now?: Date; maxSends?: number } = { dry: true }): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const enabled = lifecycleEnabled();
  const report: RunReport = { enabled, dry: opts.dry, considered: 0, sends: [], skips: [], waits: {}, stops: {}, sent: 0, failed: 0 };
  if (!isServiceConfigured()) return { ...report, skipped: "no service client" };
  if (!opts.dry && !enabled) return { ...report, skipped: "LIFECYCLE_EMAILS_ENABLED is off" };
  if (!opts.dry && !emailConfigured()) return { ...report, skipped: "RESEND_API_KEY not set" };

  const db = createServiceClient();
  const probe = await db.from("lifecycle_sends").select("id").limit(1);
  if (probe.error) return { ...report, skipped: isMissingTableError(probe.error) ? "lifecycle_sends table missing (run migration 20261016000020)" : probe.error.message };

  const tax = await loadTaxonomy();
  const { members, error } = await loadMembers(db, now, tax.countryByRegion);
  if (error) return { ...report, skipped: error };
  report.considered = members.length;

  const market = lazy(() => loadMarket(tax));
  const bench = lazy(async () => {
    const d = await loadBenchmarkData();
    return { awards: d.awards, categories: d.categories, today: d.today };
  });
  const scarcity = lazy(async (): Promise<FoundingScarcity> => {
    const sold = await cachedLifetimeCount();
    return foundingScarcity(sold == null ? null : spotsLeft(sold));
  });

  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/+$/, "");
  const from = lifecycleFrom();
  const maxSends = opts.maxSends ?? MAX_SENDS_PER_RUN;
  let budget = maxSends;

  for (const m of members) {
    if (budget <= 0) break;
    const open = new Set(openSteps(m.state, now));
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

    const { skips, decision } = plan(m.state, now);
    for (const s of skips) report.skips.push({ userId: m.state.userId, org: m.org.name, step: s.step, reason: s.reason });
    if (!opts.dry && skips.length) {
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
    if (decision.action !== "send") continue;
    const step = decision.step;

    if (!mk && MARKET_STEPS.has(step) && m.state.facts.hasTrades) mk = marketFor(m, await market());
    const data = await copyDataFor(db, m, step, { mk, bf, scarcity: await scarcity(), now });
    const unsub = lifecycleUnsubscribeUrl(base, m.state.userId);
    const email = renderStep(step, data, { base, unsubscribeUrl: unsub });
    report.sends.push({ userId: m.state.userId, email: m.email, org: m.org.name, step, lang: m.lang, country: m.country, subject: email.subject, words: email.words });
    budget--;
    if (opts.dry) continue;

    // Record first: the unique (user_id, step) means a racing run or a retry never sends twice.
    const { data: claimed, error: claimErr } = await db
      .from("lifecycle_sends")
      .upsert({ user_id: m.state.userId, organization_id: m.org.id, step, status: "sending", lang: m.lang }, { onConflict: "user_id,step", ignoreDuplicates: true })
      .select("id");
    if (claimErr || !claimed?.length) {
      if (claimErr) console.error("[lifecycle] claim failed", claimErr.message);
      continue;
    }
    const res = await sendLifecycleEmail({ to: m.email, from, replyTo: LIFECYCLE_REPLY_TO, subject: email.subject, text: email.text, html: email.html, unsubscribeUrl: unsub, step });
    await db
      .from("lifecycle_sends")
      .update({ status: res.ok ? "sent" : "failed", resend_id: res.id, detail: res.ok ? null : (res.error ?? "send failed").slice(0, 300), sent_at: new Date().toISOString() })
      .eq("id", (claimed[0] as { id: string }).id);
    if (res.ok) report.sent++;
    else report.failed++;
  }
  return report;
}

async function copyDataFor(
  db: Db,
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
    hasBadge: m.state.facts.badgeInstalled,
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

export function previewEmail(step: StepId, lang: Locale, country: CountryCode, unsubscribeUserId = "preview-user", persona: Persona = "specialty"): RenderedEmail {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/+$/, "");
  return renderStep(step, sampleCopyData(step, lang, country, persona), { base, unsubscribeUrl: lifecycleUnsubscribeUrl(base, unsubscribeUserId) });
}

/** The sample email to ONE admin address, subject marked [Test]. Not recorded in lifecycle_sends. */
export async function sendTestToAdmin(p: { to: string; userId: string; step: StepId; lang: Locale; country: CountryCode; persona?: Persona }): Promise<{ ok: boolean; error?: string }> {
  const email = previewEmail(p.step, p.lang, p.country, p.userId, p.persona);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/+$/, "");
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
