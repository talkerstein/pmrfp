import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { selectIn, type Db, type SelectError } from "@/lib/supabase/select-in";
import { isMissingTableError } from "@/lib/entitlement/trial";
import { isInternalEmail } from "@/lib/lifecycle/rescue";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { inList, readD1, readD1ByIds, useD1Lifecycle } from "@/lib/lifecycle/d1";
import { applyNativeBadgeReward, readNativeBadgeHits, type BadgeMember } from "./d1";
import { BADGE_STEPS, type BadgeStep } from "@/lib/lifecycle/config";
import { INSTALL_KINDS, detectBadgeInstall, groupBySlug, type BadgeHitRow, type BadgeInstall } from "./install";
import { REWARD_DAYS, REWARD_SOURCE, badgeRewardEnabled, isPayingSubscription, planTrialChange, rewardRefusal, trialAfter, type RewardRefusal, type TrialChange, type TrialRowLite } from "./reward";

/**
 * Badge install status and the reward, with the service role.
 *   loadHitRows               the badge_hits rows for some slugs (the lifecycle engine, the dashboard)
 *   getOrgBadgeStatus         one company's status for its own dashboard
 *   listCompanyBadgeStatus    every company, for /admin/badge-installs
 *   runBadgeRewards           the cron pass that grants the one-time reward (BADGE_REWARD_ENABLED)
 * Rules: lib/badge/install (detection), lib/badge/reward (eligibility).
 */

const PAGE = 1000;
const MAX_HIT_ROWS = 50_000;

const hitCols = "day,kind,slug,referrer";

/** badge_hits rows with a real referrer, for these slugs. Never throws. */
export async function loadHitRows(db: Db, slugs: string[]): Promise<{ rows: BadgeHitRow[]; error: SelectError | null }> {
  return selectIn<BadgeHitRow>(slugs, (c) =>
    db.from("badge_hits").select(hitCols).in("kind", [...INSTALL_KINDS]).neq("referrer", "").in("slug", c).limit(5000),
  );
}

/** Every badge_hits row with a real referrer (installs are few: one row per day, badge and site). */
export async function loadAllHitRows(db: Db): Promise<{ rows: BadgeHitRow[]; error: SelectError | null }> {
  const rows: BadgeHitRow[] = [];
  for (let from = 0; from < MAX_HIT_ROWS; from += PAGE) {
    const { data, error } = await db
      .from("badge_hits")
      .select(hitCols)
      .in("kind", [...INSTALL_KINDS])
      .neq("referrer", "")
      .order("day", { ascending: true })
      .order("slug", { ascending: true })
      .order("referrer", { ascending: true })
      .order("kind", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows, error };
    const page = (data ?? []) as BadgeHitRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, error: null };
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  organization_type: string;
  status: string;
  is_demo: boolean;
  profile_status: string;
}
const orgCols = "id,name,slug,website,organization_type,status,is_demo,profile_status";

type Subscription = { organization_id: string; status: string; tier: string | null; stripe_subscription_id: string | null };

interface RewardRow {
  organization_id: string;
  granted_at: string;
  kind: "start" | "extend" | "reopen";
  trial_ends_after: string;
}

function badgeRows<T>(
  db: Db | null, app: D1Binding | null, ids: string[], sql: string,
  legacy: (db: Db, c: string[]) => ReturnType<Parameters<typeof selectIn<T>>[1]>,
  ...params: string[]
) {
  if (app) return readD1ByIds<T>(app, ids, sql, ...params).then((rows) => ({ rows, error: null }));
  return selectIn<T>(ids, (c) => legacy(db!, c));
}

async function badgeHistory(db: Db | null) {
  if (db) return loadAllHitRows(db);
  return { rows: await readNativeBadgeHits(), error: null };
}

/* ------------------------------------------------------------------ one company (its own dashboard) */

export interface OrgBadgeStatus {
  install: BadgeInstall;
  reward: { kind: RewardRow["kind"]; endsAt: string } | null;
}

/** The company's own badge status. The caller has already checked the session owns this company. Null when the data isn't available. */
export async function getOrgBadgeStatus(org: { id: string; slug: string; website: string | null }): Promise<OrgBadgeStatus | null> {
  if (!org.slug || (!useD1Lifecycle() && !isServiceConfigured())) return null;
  try {
    if (useD1Lifecycle()) {
      const [hits, reward] = await Promise.all([
        readNativeBadgeHits([org.slug]),
        vpsAppDatabase().prepare("SELECT kind,trial_ends_after FROM badge_rewards WHERE organization_id=?").bind(org.id).first<RewardRow>(),
      ]);
      return { install: detectBadgeInstall(org.website, hits, org.slug), reward: reward ? { kind: reward.kind, endsAt: reward.trial_ends_after } : null };
    }
    const db = createServiceClient();
    const [hits, reward] = await Promise.all([
      loadHitRows(db, [org.slug]),
      db.from("badge_rewards").select("organization_id,granted_at,kind,trial_ends_after").eq("organization_id", org.id).maybeSingle<RewardRow>(),
    ]);
    if (hits.error) return null;
    // A missing badge_rewards table (migration not applied yet) just means no reward.
    const r = reward.error && !isMissingTableError(reward.error) ? null : reward.data;
    return { install: detectBadgeInstall(org.website, hits.rows, org.slug), reward: r ? { kind: r.kind, endsAt: r.trial_ends_after } : null };
  } catch (e) {
    console.warn("[badge] status unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

/* ------------------------------------------------------------------ every company (admin) */

export type CompanyBadgeState = "installed" | "other_sites" | "not_detected" | "no_website" | "pending";

export interface CompanyBadgeRow {
  orgId: string;
  name: string;
  slug: string;
  website: string | null;
  install: BadgeInstall;
  state: CompanyBadgeState;
  /** The lifecycle emails of the badge lane that were recorded for this company, by step. */
  sends: Partial<Record<BadgeStep, { status: string; sentAt: string }>>;
  reward: { kind: RewardRow["kind"]; grantedAt: string; endsAt: string } | null;
  paid: boolean;
}

export function companyBadgeState(o: { profileApproved: boolean; install: BadgeInstall }): CompanyBadgeState {
  if (!o.profileApproved) return "pending";
  if (o.install.detected) return "installed";
  if (!o.install.domain) return "no_website";
  return o.install.otherSites.length || o.install.days ? "other_sites" : "not_detected";
}

/** Every live trade company with its badge status, lifecycle sends and reward. Read-only. */
export async function listCompanyBadgeStatus(): Promise<{ rows: CompanyBadgeRow[]; error: string | null }> {
  if (!useD1Lifecycle() && !isServiceConfigured()) return { rows: [], error: "no service client" };
  try {
    const app = useD1Lifecycle() ? vpsAppDatabase() : null;
    return await readCompanyBadgeStatus(app, app ? null : createServiceClient());
  } catch {
    return { rows: [], error: "Badge data unavailable" };
  }
}

async function readCompanyBadgeStatus(app: D1Binding | null, db: Db | null): Promise<{ rows: CompanyBadgeRow[]; error: string | null }> {
  const orgRes = app
    ? { data: await readD1<OrgRow>(app, `SELECT ${orgCols} FROM organizations WHERE organization_type='trade_company'
        AND is_demo=0 AND status='active' ORDER BY name LIMIT 5000`), error: null }
    : await db!.from("organizations").select(orgCols).eq("organization_type", "trade_company")
      .eq("is_demo", false).eq("status", "active").order("name", { ascending: true }).limit(5000).returns<OrgRow[]>();
  if (orgRes.error) return { rows: [], error: `organizations: ${orgRes.error.message}` };
  const orgs = orgRes.data ?? [];
  const ids = orgs.map((o) => o.id);
  const [hits, sends, rewards, subs] = await Promise.all([
    badgeHistory(db),
    badgeRows<{ organization_id: string; step: string; status: string; sent_at: string }>(db, app, ids,
      `SELECT organization_id,step,status,sent_at FROM lifecycle_sends WHERE organization_id ${inList} AND step ${inList}`,
      (legacy, c) => legacy.from("lifecycle_sends").select("organization_id,step,status,sent_at").in("step", [...BADGE_STEPS]).in("organization_id", c),
      JSON.stringify(BADGE_STEPS)),
    badgeRows<RewardRow>(db, app, ids, `SELECT organization_id,granted_at,kind,trial_ends_after FROM badge_rewards WHERE organization_id ${inList}`,
      (legacy, c) => legacy.from("badge_rewards").select("organization_id,granted_at,kind,trial_ends_after").in("organization_id", c)),
    badgeRows<Subscription>(db, app, ids, `SELECT organization_id,status,tier,stripe_subscription_id FROM subscriptions WHERE organization_id ${inList}`,
      (legacy, c) => legacy.from("subscriptions").select("organization_id,status,tier,stripe_subscription_id").in("organization_id", c)),
  ]);
  if (hits.error) return { rows: [], error: `badge_hits: ${hits.error.message}` };
  // The lifecycle and rewards tables may not exist yet (migration 20261022000200): show what we can.
  const sendRows = sends.error ? [] : sends.rows;
  const rewardRows = rewards.error ? [] : rewards.rows;
  const bySlug = groupBySlug(hits.rows);
  const sendsByOrg = new Map<string, CompanyBadgeRow["sends"]>();
  for (const s of sendRows) {
    const m = sendsByOrg.get(s.organization_id) ?? {};
    m[s.step as BadgeStep] = { status: s.status, sentAt: s.sent_at };
    sendsByOrg.set(s.organization_id, m);
  }
  const rewardByOrg = new Map(rewardRows.map((r) => [r.organization_id, r]));
  const paid = new Set(subs.rows.filter(isPayingSubscription).map((s) => s.organization_id));
  const rows = orgs.map((o): CompanyBadgeRow => {
    const install = detectBadgeInstall(o.website, bySlug.get(o.slug) ?? [], o.slug);
    const r = rewardByOrg.get(o.id);
    return {
      orgId: o.id,
      name: o.name,
      slug: o.slug,
      website: o.website,
      install,
      state: companyBadgeState({ profileApproved: o.profile_status === "approved", install }),
      sends: sendsByOrg.get(o.id) ?? {},
      reward: r ? { kind: r.kind, grantedAt: r.granted_at, endsAt: r.trial_ends_after } : null,
      paid: paid.has(o.id),
    };
  });
  return { rows, error: null };
}

/* ------------------------------------------------------------------ the reward (cron) */

export interface RewardGrant {
  organizationId: string;
  org: string;
  domain: string;
  /** Distinct days the badge loaded from that site. */
  days: number;
  kind: TrialChange["kind"];
  endsAt: string;
}

export interface RewardReport {
  /** BADGE_REWARD_ENABLED. */
  enabled: boolean;
  dry: boolean;
  skipped?: string;
  /** Companies with a detected install on their own site. */
  considered: number;
  /** Granted (or, in a dry run, would be). */
  granted: RewardGrant[];
  /** Why the rest didn't get it. */
  refused: Partial<Record<RewardRefusal | "no_room" | "failed", number>>;
}

const isDuplicate = (e: { code?: string; message?: string } | null | undefined) => Boolean(e && (e.code === "23505" || /duplicate key|already exists/i.test(e.message ?? "")));

/**
 * Grants the one-time reward to every company whose install is detected,
 * who isn't excluded (lib/badge/reward). Order for one company:
 *   1. claim: insert its badge_rewards row (organization_id is the primary
 *      key: a second run or a race stops here and grants nothing);
 *   2. apply the change to trade_trials;
 *   3. if step 2 fails, remove the claim, so the next run can try again.
 * `dry` reads and plans only. Nothing is written unless BADGE_REWARD_ENABLED.
 */
export async function runBadgeRewards(opts: { dry: boolean; now?: Date } = { dry: true }): Promise<RewardReport> {
  const now = opts.now ?? new Date();
  const enabled = badgeRewardEnabled();
  const report: RewardReport = { enabled, dry: opts.dry, considered: 0, granted: [], refused: {} };
  if (!opts.dry && !enabled) return { ...report, skipped: "BADGE_REWARD_ENABLED is off" };
  if (!useD1Lifecycle() && !isServiceConfigured()) return { ...report, skipped: "no service client" };
  const refuse = (why: keyof RewardReport["refused"]) => {
    report.refused[why] = (report.refused[why] ?? 0) + 1;
  };

  try {
    const app = useD1Lifecycle() ? vpsAppDatabase() : null;
    const db = app ? null : createServiceClient();
    const hits = await badgeHistory(db);
    if (hits.error) return { ...report, skipped: isMissingTableError(hits.error) ? "badge_hits table missing" : `badge_hits: ${hits.error.message}` };
    const bySlug = groupBySlug(hits.rows);
    if (!bySlug.size) return report;

    const orgRes = await badgeRows<OrgRow>(db, app, [...bySlug.keys()], `SELECT ${orgCols} FROM organizations WHERE slug ${inList}`,
      (legacy, c) => legacy.from("organizations").select(orgCols).in("slug", c));
    if (orgRes.error) return { ...report, skipped: `organizations: ${orgRes.error.message}` };
    const detected = orgRes.rows
      .map((o) => ({ o, install: detectBadgeInstall(o.website, bySlug.get(o.slug) ?? [], o.slug) }))
      .filter((x) => x.install.detected);
    report.considered = detected.length;
    if (!detected.length) return report;

    const ids = detected.map((x) => x.o.id);
    const [rewards, subs, trials, members] = await Promise.all([
      badgeRows<{ organization_id: string }>(db, app, ids, `SELECT organization_id FROM badge_rewards WHERE organization_id ${inList}`,
        (legacy, c) => legacy.from("badge_rewards").select("organization_id").in("organization_id", c)),
      badgeRows<Subscription>(db, app, ids, `SELECT organization_id,status,tier,stripe_subscription_id FROM subscriptions WHERE organization_id ${inList}`,
        (legacy, c) => legacy.from("subscriptions").select("organization_id,status,tier,stripe_subscription_id").in("organization_id", c)),
      badgeRows<{ organization_id: string; started_at: string; ends_at: string }>(db, app, ids,
        `SELECT organization_id,started_at,ends_at FROM trade_trials WHERE organization_id ${inList}`,
        (legacy, c) => legacy.from("trade_trials").select("organization_id,started_at,ends_at").in("organization_id", c)),
      badgeRows<{ organization_id: string; user_id: string }>(db, app, ids, `SELECT organization_id,user_id FROM organization_members WHERE organization_id ${inList}`,
        (legacy, c) => legacy.from("organization_members").select("organization_id,user_id").in("organization_id", c)),
    ]);
    if (rewards.error) {
      return { ...report, skipped: isMissingTableError(rewards.error) ? "badge_rewards table missing (run migration 20261022000200)" : `badge_rewards: ${rewards.error.message}` };
    }
    if (subs.error) return { ...report, skipped: `subscriptions: ${subs.error.message}` };
    if (trials.error && !isMissingTableError(trials.error)) return { ...report, skipped: `trade_trials: ${trials.error.message}` };

    const users = await badgeRows<Omit<BadgeMember, "organization_id">>(db, app, members.rows.map((m) => m.user_id),
      `SELECT id,email,primary_role FROM users_profile WHERE id ${inList}`,
      (legacy, c) => legacy.from("users_profile").select("id,email,primary_role").in("id", c));
    if (users.error) return { ...report, skipped: `users_profile: ${users.error.message}` };
    const userById = new Map(users.rows.map((u) => [u.id, u]));
    const internalOrgs = new Set<string>();
    const membersByOrg = new Map<string, BadgeMember[]>();
    for (const m of members.rows) {
      const u = userById.get(m.user_id);
      if (!u || isInternalEmail(u.email) || ["admin", "super_admin"].includes(u.primary_role)) internalOrgs.add(m.organization_id);
      if (u) membersByOrg.set(m.organization_id, [...(membersByOrg.get(m.organization_id) ?? []), { ...u, organization_id: m.organization_id }]);
    }
    const rewarded = new Set(rewards.rows.map((r) => r.organization_id));
    const paid = new Set(subs.rows.filter(isPayingSubscription).map((s) => s.organization_id));
    const trialByOrg = new Map<string, TrialRowLite>((trials.error ? [] : trials.rows).map((t) => [t.organization_id, { startedAt: t.started_at, endsAt: t.ends_at }]));

    for (const { o, install } of detected) {
      // A dry run shows who WOULD get it, so it evaluates as if the flag were on.
      const why = rewardRefusal({
        enabled: true,
        install,
        company: {
          organizationType: o.organization_type,
          status: o.status,
          isDemo: o.is_demo,
          profileApproved: o.profile_status === "approved",
          paid: paid.has(o.id),
          alreadyRewarded: rewarded.has(o.id),
          internal: internalOrgs.has(o.id),
        },
      });
      if (why) {
        refuse(why);
        continue;
      }
      const existing = trialByOrg.get(o.id) ?? null;
      const change = planTrialChange(existing, now);
      if (!change) {
        refuse("no_room");
        continue;
      }
      const after = trialAfter(change, existing);
      const grant: RewardGrant = { organizationId: o.id, org: o.name, domain: install.domain!, days: install.days, kind: change.kind, endsAt: after.endsAt };
      if (opts.dry) {
        report.granted.push(grant);
        continue;
      }
      const ok = app
        ? await applyNativeBadgeReward(o, install, change, existing, after, now, membersByOrg.get(o.id) ?? []).catch(() => false)
        : await applyReward(db!, o.id, install, change, existing, after, now);
      if (ok) report.granted.push(grant);
      else refuse("failed");
    }
    return report;
  } catch (e) {
    console.error("[badge-reward] run failed", e);
    return { ...report, skipped: e instanceof Error ? e.message : "run failed" };
  }
}

/** Claim, then change the trial; undo the claim if the trial change fails. True when granted. */
async function applyReward(
  db: Db,
  organizationId: string,
  install: BadgeInstall,
  change: TrialChange,
  before: TrialRowLite | null,
  after: TrialRowLite,
  now: Date,
): Promise<boolean> {
  const { error: claimErr } = await db.from("badge_rewards").insert({
    organization_id: organizationId,
    granted_at: now.toISOString(),
    kind: change.kind,
    days: REWARD_DAYS,
    domain: install.domain,
    distinct_days: install.days,
    detected_on: install.detectedOn,
    trial_started_before: before?.startedAt ?? null,
    trial_ends_before: before?.endsAt ?? null,
    trial_started_after: after.startedAt,
    trial_ends_after: after.endsAt,
  });
  if (claimErr) {
    // Already granted (a racing run): nothing to do. Anything else is logged and retried next hour.
    if (!isDuplicate(claimErr)) console.error("[badge-reward] claim failed", claimErr.message);
    return false;
  }

  let applied = false;
  let message = "";
  if (change.kind === "start") {
    const { error } = await db.from("trade_trials").insert({
      organization_id: organizationId,
      started_by: null,
      started_at: change.startedAt,
      ends_at: change.endsAt,
      source: REWARD_SOURCE,
    });
    applied = !error;
    message = error?.message ?? "";
  } else {
    // Match on the old ends_at, so a trial changed since we read it isn't overwritten.
    const patch = change.kind === "extend" ? { ends_at: change.endsAt } : { started_at: change.startedAt, ends_at: change.endsAt };
    const { data, error } = await db.from("trade_trials").update(patch).eq("organization_id", organizationId).eq("ends_at", change.previousEndsAt).select("organization_id");
    applied = !error && Boolean(data?.length);
    message = error?.message ?? (applied ? "" : "trial changed meanwhile");
  }
  if (applied) return true;

  console.error("[badge-reward] trial change failed", message);
  const { error: undoErr } = await db.from("badge_rewards").delete().eq("organization_id", organizationId);
  if (undoErr) console.error("[badge-reward] could not undo the claim for", organizationId, undoErr.message);
  return false;
}

/** For the thank-you email: this company's reward, if one was granted. */
export async function loadRewards(db: Db, orgIds: string[]): Promise<Map<string, { kind: RewardRow["kind"]; endsAt: string }>> {
  const res = await selectIn<RewardRow>(orgIds, (c) => db.from("badge_rewards").select("organization_id,granted_at,kind,trial_ends_after").in("organization_id", c));
  // A missing table (migration not applied) = no rewards yet.
  if (res.error) return new Map();
  return new Map(res.rows.map((r) => [r.organization_id, { kind: r.kind, endsAt: r.trial_ends_after }]));
}
