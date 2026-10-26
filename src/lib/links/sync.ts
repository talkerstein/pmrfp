import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { selectIn } from "@/lib/supabase/select-in";
import { detectBadgeInstall, groupBySlug, registrableDomain, websiteDomain } from "@/lib/badge/install";
import { loadAllHitRows } from "@/lib/badge/server";
import { isPayingSubscription } from "@/lib/badge/reward";
import { emailDomain, isFreeEmailDomain } from "@/lib/dedupe/email";
import { descriptionLength, profileIndexable } from "./indexing";
import { linkEarned, type LinkOrg } from "./policy";

/**
 * The daily pass behind "earn the link" (cron /api/cron/link-signals). Public
 * pages must not read subscriptions, badge_hits or users, so this copies the
 * answers onto the organization row where the page can read them cheaply:
 *   link_paid               active paid plan (Trade Pro, Featured, lifetime; not past due, not a trial)
 *   link_badge              badge loaded from the company's own website on 2+ days
 *   link_earned_at          the first time the whole rule (lib/links/policy) held
 *   email_domain_verified   the owner's sign-in email is on the company's own website domain
 *   profile_indexable       the quality bar (lib/links/indexing); the sitemap leaves out `false`
 * Only rows whose values changed are written. Writes nothing in a dry run.
 */

const PAGE = 1000;

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  email: string | null;
  profile_status: string;
  status: string;
  approved_at: string | null;
  logo_url: string | null;
  short_description: string | null;
  full_description: string | null;
  link_trusted: boolean | null;
  link_paid: boolean | null;
  link_badge: boolean | null;
  link_earned_at: string | null;
  risk_flagged: boolean | null;
  email_domain_verified: boolean | null;
  profile_indexable: boolean | null;
}

const COLS =
  "id,slug,name,website,email,profile_status,status,approved_at,logo_url,short_description,full_description,link_trusted,link_paid,link_badge,link_earned_at,risk_flagged,email_domain_verified,profile_indexable";

export interface LinkSyncReport {
  dry: boolean;
  skipped?: string;
  considered: number;
  changed: number;
  earned: number;
  paid: number;
  badge: number;
  notIndexable: number;
}

export async function syncLinkSignals(opts: { dry?: boolean; now?: Date } = {}): Promise<LinkSyncReport> {
  const dry = Boolean(opts.dry);
  const now = opts.now ?? new Date();
  const report: LinkSyncReport = { dry, considered: 0, changed: 0, earned: 0, paid: 0, badge: 0, notIndexable: 0 };
  if (!isServiceConfigured()) return { ...report, skipped: "no service client" };
  const db = createServiceClient();

  const orgs: OrgRow[] = [];
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await db
      .from("organizations")
      .select(COLS)
      .in("organization_type", ["trade_company", "supplier"])
      .eq("is_demo", false)
      .neq("status", "deleted")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ...report, skipped: `organizations: ${error.message} (run migration 20261024000100)` };
    const page = (data ?? []) as OrgRow[];
    orgs.push(...page);
    if (page.length < PAGE) break;
  }
  report.considered = orgs.length;
  if (!orgs.length) return report;

  const ids = orgs.map((o) => o.id);
  const [hits, subs, members, projects] = await Promise.all([
    loadAllHitRows(db),
    selectIn<{ organization_id: string; status: string; tier: string | null; stripe_subscription_id: string | null }>(ids, (c) =>
      db.from("subscriptions").select("organization_id,status,tier,stripe_subscription_id").in("organization_id", c),
    ),
    selectIn<{ organization_id: string; user_id: string }>(ids, (c) => db.from("organization_members").select("organization_id,user_id").in("organization_id", c)),
    selectIn<{ organization_id: string }>(ids, (c) => db.from("case_studies").select("organization_id").eq("status", "published").in("organization_id", c)),
  ]);
  if (hits.error) return { ...report, skipped: `badge_hits: ${hits.error.message}` };
  if (subs.error) return { ...report, skipped: `subscriptions: ${subs.error.message}` };
  const users = await selectIn<{ id: string; email: string }>(
    members.rows.map((m) => m.user_id),
    (c) => db.from("users_profile").select("id,email").in("id", c),
  );

  const bySlug = groupBySlug(hits.rows);
  const paid = new Set(subs.rows.filter(isPayingSubscription).map((s) => s.organization_id));
  const emailOf = new Map(users.rows.map((u) => [u.id, u.email]));
  const ownersMail = new Map<string, string[]>();
  for (const m of members.rows) {
    const e = emailOf.get(m.user_id);
    if (e) ownersMail.set(m.organization_id, [...(ownersMail.get(m.organization_id) ?? []), e]);
  }
  const projectCount = new Map<string, number>();
  for (const p of projects.error ? [] : projects.rows) projectCount.set(p.organization_id, (projectCount.get(p.organization_id) ?? 0) + 1);

  for (const o of orgs) {
    const install = detectBadgeInstall(o.website, bySlug.get(o.slug) ?? [], o.slug);
    const link_badge = install.detected && !install.ownDomain;
    const link_paid = paid.has(o.id);
    const site = websiteDomain(o.website);
    const mails = [o.email, ...(ownersMail.get(o.id) ?? [])].filter((e): e is string => Boolean(e));
    const email_domain_verified =
      Boolean(site) && mails.some((e) => {
        const d = emailDomain(e);
        return d && !isFreeEmailDomain(d) && registrableDomain(d) === site;
      });

    const asLink: LinkOrg = {
      slug: o.slug,
      website: o.website,
      profileStatus: o.profile_status,
      status: o.status,
      approvedAt: o.approved_at,
      linkTrusted: o.link_trusted,
      paid: link_paid,
      badgeInstalled: link_badge,
      riskFlagged: o.risk_flagged,
    };
    const earned = linkEarned(asLink, now);
    const link_earned_at = earned ? (o.link_earned_at ?? now.toISOString()) : null;
    const profile_indexable = profileIndexable({
      approved: o.profile_status === "approved" && o.status === "active",
      riskFlagged: o.risk_flagged,
      descriptionLength: descriptionLength(o.short_description, o.full_description),
      hasLogo: Boolean(o.logo_url),
      projectCount: projectCount.get(o.id) ?? 0,
      emailDomainVerified: email_domain_verified,
    });

    if (earned) report.earned++;
    if (link_paid) report.paid++;
    if (link_badge) report.badge++;
    if (!profile_indexable) report.notIndexable++;

    const patch: Record<string, unknown> = {};
    if (Boolean(o.link_paid) !== link_paid) patch.link_paid = link_paid;
    if (Boolean(o.link_badge) !== link_badge) patch.link_badge = link_badge;
    if (Boolean(o.email_domain_verified) !== email_domain_verified) patch.email_domain_verified = email_domain_verified;
    if (o.profile_indexable !== profile_indexable) patch.profile_indexable = profile_indexable;
    if ((o.link_earned_at ?? null) !== link_earned_at) patch.link_earned_at = link_earned_at;
    if (!Object.keys(patch).length) continue;
    report.changed++;
    if (dry) continue;
    const { error } = await db.from("organizations").update(patch).eq("id", o.id);
    if (error) console.warn(`[links] sync ${o.slug}: ${error.message}`);
  }
  return report;
}
