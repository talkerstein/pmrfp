/**
 * Same-day "new job" emails when a PM job is published (pure; tested in
 * test/unit/pm-job-flow.test.ts). The server half is lib/pm-jobs/server.ts.
 *
 * Who gets one: every member of every approved, active, non-demo trade
 * company or supplier whose trades include one of the job's trades and whose
 * area covers the job's place (lib/pm-jobs/regions, both ways), in the same
 * country, free and Pro alike. Skipped: suspended accounts, anyone who turned
 * opportunity emails off (notification_preferences new_rfps 'off' or email
 * off, which the unsubscribe link sets), anyone who asked for them weekly
 * (the Monday digest carries the job instead), the poster's own company, and
 * anyone already sent this job (lead_alert_log key "pmjob:<id>"; the weekly
 * digest skips jobs a person already got this way).
 *
 * Behind PM_JOB_ALERTS_ENABLED (default off). Off, a publish still works and
 * the admin sees how many trades would have been emailed.
 */
import type { CountryCode } from "@/lib/visitor-geo";
import { RegionIndex, jobPlace, regionMatches, tradeArea, type RegionRow } from "./regions";
import { RESPONDER_ORG_TYPES } from "./rules";

export function pmJobAlertsEnabled(env: string | undefined = process.env.PM_JOB_ALERTS_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** lead_alert_log key for one job. */
export function pmJobAlertKey(rfpId: string): string {
  return `pmjob:${rfpId}`;
}

/** Most recipients one job can email in one go (a typo in a job's trades shouldn't email the whole board). */
export const MAX_ALERTS_PER_JOB = 400;

export interface AlertJob {
  id: string;
  region_id: string | null;
  city: string | null;
  province: string | null;
  country: CountryCode;
  categoryIds: string[];
  posted_by_user_id: string | null;
  posted_by_organization_id: string | null;
}

export interface AlertOrg {
  id: string;
  name: string;
  organization_type: string;
  status: string;
  profile_status: string;
  is_demo?: boolean | null;
  city: string | null;
  province: string | null;
  countries: ReadonlySet<CountryCode>;
}

export interface AlertAudienceInput {
  job: AlertJob;
  regions: readonly RegionRow[];
  orgs: readonly AlertOrg[];
  catsByOrg: ReadonlyMap<string, ReadonlySet<string>>;
  regionsByOrg: ReadonlyMap<string, readonly string[]>;
  usersByOrg: ReadonlyMap<string, readonly string[]>;
  /** Active accounts only (suspended ones left out by the caller or here). */
  users: ReadonlyMap<string, { email: string | null; status?: string | null }>;
  /** user ids who turned opportunity emails off. */
  optedOut: ReadonlySet<string>;
  /** user ids who asked for opportunity emails weekly: no same-day email; the Monday digest carries the job. */
  weekly?: ReadonlySet<string>;
  /** user ids already sent this job. */
  alreadySent: ReadonlySet<string>;
  /** Pro or trial companies (only for the admin's count; everyone gets the same email). */
  proOrgIds?: ReadonlySet<string>;
}

export interface AlertRecipient {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  pro: boolean;
}

export interface AlertAudience {
  place: string | null;
  /** Matching companies (before per-person skips). */
  orgs: { id: string; name: string; city: string | null; pro: boolean }[];
  recipients: AlertRecipient[];
  skipped: { optedOut: number; weekly: number; alreadySent: number; noEmail: number };
  /** More matched than MAX_ALERTS_PER_JOB; the rest wait for the next run. */
  truncated: boolean;
}

export function selectAlertAudience(input: AlertAudienceInput, max: number = MAX_ALERTS_PER_JOB): AlertAudience {
  const idx = new RegionIndex(input.regions);
  const { job } = input;
  const place = jobPlace(job, idx, job.country);
  const jobCats = new Set(job.categoryIds);
  const skipped = { optedOut: 0, weekly: 0, alreadySent: 0, noEmail: 0 };
  const orgs: AlertAudience["orgs"] = [];
  const recipients: AlertRecipient[] = [];
  const seenUsers = new Set<string>();
  let truncated = false;
  if (!place || !jobCats.size) return { place, orgs, recipients, skipped, truncated };

  for (const org of input.orgs) {
    if (!(RESPONDER_ORG_TYPES as readonly string[]).includes(org.organization_type)) continue;
    if (org.status !== "active" || org.profile_status !== "approved" || org.is_demo) continue;
    if (job.posted_by_organization_id && org.id === job.posted_by_organization_id) continue;
    // Countries never mix.
    if (!org.countries.has(job.country)) continue;
    const cats = input.catsByOrg.get(org.id);
    if (!cats || ![...cats].some((c) => jobCats.has(c))) continue;
    const area = tradeArea(org, input.regionsByOrg.get(org.id) ?? [], idx, job.country);
    if (!regionMatches(place, area, idx)) continue;
    const pro = input.proOrgIds?.has(org.id) ?? false;
    orgs.push({ id: org.id, name: org.name, city: org.city, pro });
    for (const userId of input.usersByOrg.get(org.id) ?? []) {
      if (seenUsers.has(userId) || userId === job.posted_by_user_id) continue;
      seenUsers.add(userId);
      const user = input.users.get(userId);
      if (!user?.email || user.status === "suspended" || user.status === "deleted") {
        skipped.noEmail++;
        continue;
      }
      if (input.optedOut.has(userId)) {
        skipped.optedOut++;
        continue;
      }
      if (input.weekly?.has(userId)) {
        skipped.weekly++;
        continue;
      }
      if (input.alreadySent.has(userId)) {
        skipped.alreadySent++;
        continue;
      }
      if (recipients.length >= max) {
        truncated = true;
        continue;
      }
      recipients.push({ userId, email: user.email, orgId: org.id, orgName: org.name, pro });
    }
  }
  return { place, orgs, recipients, skipped, truncated };
}

/** notification_preferences rows → the users who turned opportunity emails off (the unsubscribe link sets new_rfps 'off'). */
export function optedOutUsers(prefs: readonly { user_id: string; new_rfps?: string | null; channel_email?: boolean | null }[]): Set<string> {
  return new Set(prefs.filter((p) => p.new_rfps === "off" || p.channel_email === false).map((p) => p.user_id));
}

/** …and the ones who asked for them weekly (new_rfps 'weekly'). No row = the default, daily. */
export function weeklyUsers(prefs: readonly { user_id: string; new_rfps?: string | null }[]): Set<string> {
  return new Set(prefs.filter((p) => p.new_rfps === "weekly").map((p) => p.user_id));
}

/** What the admin sees after a publish (or in the preview). */
export type AlertOutcome =
  | { state: "sent"; count: number }
  | { state: "off"; wouldEmail: number }
  | { state: "blocked"; wouldEmail: number; reason: "mailing_address" | "unsubscribe" | "not_pm_job" | "not_published" }
  | { state: "none" };
