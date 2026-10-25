import type { SupabaseClient } from "@supabase/supabase-js";
import { emailDomain, isFreeEmailDomain } from "@/lib/dedupe/email";
import { websiteDomain } from "@/lib/badge/install";
import { isInternalEmail } from "@/lib/lifecycle/rescue";
import { scoreOrgRisk, type OrgRisk, type OrgRiskInput } from "./org-risk";

/**
 * The spam check around the pure score (lib/spam/org-risk): reads what the
 * score needs (blocked domains, other organizations from the same owner, the
 * country the visitor signed up from) and writes the result to
 * organization_risk (admin-only) plus the public organizations.risk_flagged.
 * Service-role client in, never throws: a failed read scores as if the
 * signal were absent, so a database hiccup can't hold an honest member.
 */
type Db = SupabaseClient;

/** The domains blocked even before the table exists (migration 20261024000100 seeds the same two). */
export const SEED_BLOCKED_DOMAINS = ["bearseoservice.com", "marlinleads.com"] as const;

export async function loadBlockedDomains(db: Db): Promise<string[]> {
  try {
    const { data, error } = await db.from("blocked_domains").select("domain").limit(5000);
    if (error) return [...SEED_BLOCKED_DOMAINS];
    // The table is the list once it exists (the migration seeds the two); removing a domain there unblocks it.
    return [...new Set(((data ?? []) as { domain: string }[]).map((r) => r.domain))];
  } catch {
    return [...SEED_BLOCKED_DOMAINS];
  }
}

export interface ScreenInput extends Omit<OrgRiskInput, "blockedDomains" | "othersOnEmailDomain" | "othersOnWebsiteDomain" | "signupCountry"> {
  /** The company being edited (excluded from the "other organizations" counts); null for a new one. */
  organizationId?: string | null;
  /** The signed-in person (for the sign-up country). */
  userId: string;
}

export interface ScreenResult extends OrgRisk {
  /** Staff, test and house companies are not screened. */
  skipped: boolean;
}

const SKIPPED: ScreenResult = { score: 0, reasons: [], hold: false, reject: false, blocked: false, skipped: true };

/** Other live organizations whose owners use this company email domain. */
async function othersOnEmailDomain(db: Db, domain: string, exceptOrg: string | null): Promise<number> {
  try {
    const pattern = `%@${domain}`;
    const [byOrgEmail, users] = await Promise.all([
      db.from("organizations").select("id").ilike("email", pattern).neq("status", "deleted").limit(50),
      db.from("users_profile").select("id").ilike("email", pattern).limit(50),
    ]);
    const orgs = new Set<string>(((byOrgEmail.data ?? []) as { id: string }[]).map((r) => r.id));
    const userIds = ((users.data ?? []) as { id: string }[]).map((r) => r.id);
    if (userIds.length) {
      const { data } = await db.from("organization_members").select("organization_id").in("user_id", userIds);
      for (const m of (data ?? []) as { organization_id: string }[]) orgs.add(m.organization_id);
    }
    if (exceptOrg) orgs.delete(exceptOrg);
    return orgs.size;
  } catch {
    return 0;
  }
}

/** Other live organizations with the same website domain. */
async function othersOnWebsite(db: Db, domain: string, exceptOrg: string | null): Promise<number> {
  try {
    const { data } = await db.from("organizations").select("id,website").ilike("website", `%${domain}%`).neq("status", "deleted").limit(50);
    return ((data ?? []) as { id: string; website: string | null }[]).filter((o) => o.id !== exceptOrg && websiteDomain(o.website) === domain).length;
  } catch {
    return 0;
  }
}

/** Reads the signals and scores one listing. Internal / test / trusted companies come back skipped. */
export async function screenOrganization(db: Db, input: ScreenInput): Promise<ScreenResult> {
  const mails = [input.email, input.accountEmail].filter((e): e is string => Boolean(e));
  if (mails.length && mails.every((e) => isInternalEmail(e))) return SKIPPED;
  if (input.organizationId) {
    try {
      const { data } = await db.from("organizations").select("link_trusted,is_demo").eq("id", input.organizationId).maybeSingle<{ link_trusted: boolean | null; is_demo: boolean | null }>();
      if (data?.link_trusted || data?.is_demo) return SKIPPED;
    } catch {
      // not fatal
    }
  }

  const bizDomains = [...new Set(mails.map((e) => emailDomain(e)).filter((d) => d && !isFreeEmailDomain(d)))];
  const site = websiteDomain(input.website);
  const [blockedDomains, sameMail, sameSite, attr] = await Promise.all([
    loadBlockedDomains(db),
    bizDomains.length ? Promise.all(bizDomains.map((d) => othersOnEmailDomain(db, d, input.organizationId ?? null))).then((xs) => Math.max(0, ...xs)) : Promise.resolve(0),
    site ? othersOnWebsite(db, site, input.organizationId ?? null) : Promise.resolve(0),
    db.from("signup_attribution").select("country").eq("user_id", input.userId).maybeSingle<{ country: string | null }>().then((r) => r.data?.country ?? null, () => null),
  ]);

  const risk = scoreOrgRisk({
    ...input,
    blockedDomains,
    othersOnEmailDomain: sameMail,
    othersOnWebsiteDomain: sameSite,
    signupCountry: attr,
  });
  return { ...risk, skipped: false };
}

/**
 * Saves the result: the admin-only organization_risk row and the public
 * risk_flagged boolean. A clean score removes a stale flag (and keeps the
 * row only if an admin had decided on it). Never throws.
 */
export async function recordOrgRisk(
  db: Db,
  organizationId: string,
  risk: ScreenResult,
  source: "onboarding" | "profile_edit",
  held: boolean,
): Promise<void> {
  if (risk.skipped) return;
  try {
    if (risk.hold) {
      await db.from("organization_risk").upsert(
        {
          organization_id: organizationId,
          score: risk.score,
          reasons: risk.reasons,
          held,
          blocked: risk.blocked,
          source,
          decision: null,
          decided_by: null,
          decided_at: null,
          evaluated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      await db.from("organizations").update({ risk_flagged: true }).eq("id", organizationId);
    } else {
      const { data } = await db.from("organization_risk").select("decision").eq("organization_id", organizationId).maybeSingle<{ decision: string | null }>();
      if (data && !data.decision) {
        await db
          .from("organization_risk")
          .update({ score: risk.score, reasons: risk.reasons, held: false, blocked: false, source, evaluated_at: new Date().toISOString() })
          .eq("organization_id", organizationId);
      }
      await db.from("organizations").update({ risk_flagged: false }).eq("id", organizationId).eq("risk_flagged", true);
    }
  } catch (e) {
    console.warn("[spam] could not record the risk check:", e instanceof Error ? e.message : e);
  }
}
