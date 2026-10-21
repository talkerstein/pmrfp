import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * Approved companies stay approved when they edit their profile
 * (lib/organizations/profile-review, the /dashboard/company save action and
 * the /admin/organizations "edited since approval" actions). The database
 * half (the flag trigger and the repair) is in
 * test/db/keep-approval-on-edit.test.ts.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  session: null as unknown,
  isAdmin: false,
  audits: [] as { action: string; entityId?: string | null; metadata?: Record<string, unknown> }[],
  karma: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map<string, string>() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.db }));
vi.mock("@/lib/pm-jobs/server", () => ({ pendingReviewCount: async () => 0 }));
vi.mock("@/lib/gc/data", () => ({ getLinkableAward: async () => null }));
vi.mock("@/lib/email/send", () => ({ sendAdminNewRfp: vi.fn() }));
vi.mock("@/lib/karma/sync", () => ({ karmaSyncAfter: async (x: unknown) => void h.karma.push(x) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: (typeof h.audits)[number]) => void h.audits.push(e) }));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => h.session,
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
  requireRole: vi.fn(async (roles: string[]) => {
    // The real requireRole redirects anyone without one of `roles`.
    if (!h.isAdmin || !roles.includes("admin")) throw new Error("REDIRECT:/dashboard");
    return { userId: "admin-1", profile: { primary_role: "admin", status: "active" } };
  }),
}));

import { updateCompanyProfileAction } from "@/lib/dashboard/actions";
import {
  clearProfileReviewAction,
  reinstateOrganizationAction,
  reviewOrganizationAction,
  suspendOrganizationAction,
} from "@/lib/admin/org-actions";
import {
  parseReviewChanges,
  profileStatusPatch,
  reviewChanges,
  statusAfterOwnEdit,
} from "@/lib/organizations/profile-review";
import { selectAlertAudience, type AlertOrg } from "@/lib/pm-jobs/alerts";
import type { RegionRow } from "@/lib/pm-jobs/regions";

const ORG = {
  id: "org-1",
  name: "Northline Roofing",
  slug: "northline",
  organization_type: "trade_company",
  website: "https://northline.ca",
  phone: "416-555-0100",
  email: "office@northline.ca",
  logo_url: null,
  short_description: "Flat roofs for condos.",
  full_description: null,
  city: "Toronto",
  province: "Ontario",
  status: "active",
  profile_status: "approved",
  is_demo: false,
  updated_at: "2026-10-20T10:00:00.000000+00:00",
};

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

/** What the /dashboard/company form posts. */
function profileForm(over: Record<string, string> = {}): FormData {
  return form({
    lang: "en",
    name: ORG.name,
    website: ORG.website,
    phone: ORG.phone,
    email: ORG.email,
    city: ORG.city,
    province: ORG.province,
    shortDescription: ORG.short_description,
    publicContactVisibility: "request_intro",
    categories: ["roofing"],
    regions: ["toronto"],
    ...over,
  });
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return "(no redirect)";
}

function setup(profileStatus: string, extra: Record<string, unknown> = {}) {
  const org = { ...ORG, profile_status: profileStatus, ...extra };
  h.db = fakeDb({
    organizations: [org],
    trade_categories: [{ id: "c-roof", slug: "roofing" }],
    regions: [{ id: "r-to", slug: "toronto" }],
    property_types: [],
    organization_categories: [],
    organization_regions: [],
    organization_property_types: [],
  });
  h.session = { userId: "user-1", profile: { primary_role: "trade", status: "active" }, organization: { ...org } };
  return org;
}

const orgUpdates = () => h.db.calls.filter((c) => c.table === "organizations" && c.op === "update");

beforeEach(() => {
  h.audits = [];
  h.karma = [];
  h.isAdmin = false;
});

// ── Status rule ──────────────────────────────────────────────────────

describe("status after a company edits its own profile", () => {
  it("approved stays approved; nothing else ever becomes approved", () => {
    expect(statusAfterOwnEdit("approved")).toBe("approved");
    for (const s of ["draft", "pending_review", "rejected", "suspended", null, undefined]) {
      expect(statusAfterOwnEdit(s)).toBe("pending_review");
    }
  });

  it("writes profile_status only when it changes (never for an approved company)", () => {
    expect(profileStatusPatch("approved")).toBeNull();
    expect(profileStatusPatch("pending_review")).toBeNull();
    expect(profileStatusPatch("draft")).toBe("pending_review");
    expect(profileStatusPatch("rejected")).toBe("pending_review");
    expect(profileStatusPatch("suspended")).toBe("pending_review");
  });

  it("diffs only the trust fields, treating empty and missing alike", () => {
    expect(
      reviewChanges(
        { name: "A", website: null, email: "a@x", short_description: "", logo_url: "https://l/1.png" },
        { name: "B", website: "", email: "a@x", short_description: null, logo_url: "https://l/2.png", phone: "1" } as never,
      ),
    ).toEqual([
      { field: "name", from: "A", to: "B" },
      { field: "logo_url", from: "https://l/1.png", to: "https://l/2.png" },
    ]);
  });

  it("reads the stored diff for the admin list, dropping anything malformed", () => {
    expect(parseReviewChanges({ website: { from: "https://a", to: "https://b" }, phone: { from: 1, to: 2 }, name: "oops", email: { from: null, to: "x@y" } })).toEqual([
      { field: "website", from: "https://a", to: "https://b" },
      { field: "email", from: null, to: "x@y" },
    ]);
    expect(parseReviewChanges(null)).toEqual([]);
    expect(parseReviewChanges([1, 2])).toEqual([]);
  });
});

// ── The /dashboard/company save ───────────────────────────────────────

describe("updateCompanyProfileAction", () => {
  it("keeps an approved company approved when it edits (no profile_status in the update)", async () => {
    setup("approved");
    const res = await updateCompanyProfileAction({}, profileForm({ phone: "416-555-0199", city: "Mississauga" }));
    expect(res).toEqual({ success: "Profile saved. Your listing stays live." });
    const [update] = orgUpdates();
    expect(update.patch).not.toHaveProperty("profile_status");
    expect(update.patch).toMatchObject({ phone: "416-555-0199", city: "Mississauga" });
    expect(h.db.tables.organizations[0].profile_status).toBe("approved");
    // Phone and city aren't trust fields: nothing for the admin to check.
    expect(h.audits).toEqual([]);
  });

  it("logs a trust-field edit (old → new) for the admin's check, still approved", async () => {
    setup("approved");
    await updateCompanyProfileAction({}, profileForm({ name: "Northline Roofing & Sheet Metal", website: "https://northline-roofing.ca" }));
    expect(h.db.tables.organizations[0].profile_status).toBe("approved");
    expect(h.audits).toEqual([
      {
        actorUserId: "user-1",
        action: "organization.profile_edited",
        entityType: "organization",
        entityId: "org-1",
        metadata: {
          changes: [
            { field: "name", from: "Northline Roofing", to: "Northline Roofing & Sheet Metal" },
            { field: "website", from: "https://northline.ca", to: "https://northline-roofing.ca" },
          ],
        },
      },
    ]);
  });

  it.each(["rejected", "suspended"])("a %s company's edit goes to pending_review, never approved", async (status) => {
    setup(status);
    const res = await updateCompanyProfileAction({}, profileForm({ name: "Brand New Name" }));
    expect(res).toEqual({ success: "Profile saved. It will be reviewed before going live." });
    expect(orgUpdates()[0].patch).toMatchObject({ profile_status: "pending_review" });
    expect(h.db.tables.organizations[0].profile_status).toBe("pending_review");
    expect(h.audits).toEqual([]);
  });

  it("draft submits for review and pending stays pending, as before", async () => {
    setup("draft");
    await updateCompanyProfileAction({}, profileForm());
    expect(orgUpdates()[0].patch).toMatchObject({ profile_status: "pending_review" });

    setup("pending_review");
    await updateCompanyProfileAction({}, profileForm());
    expect(orgUpdates()[0].patch).not.toHaveProperty("profile_status");
    expect(h.db.tables.organizations[0].profile_status).toBe("pending_review");
  });
});

// ── Admin: "Edited since approval" ────────────────────────────────────

describe("admin profile-review actions", () => {
  const flagged = { review_flagged_at: "2026-10-21T09:00:00Z", review_changes: { website: { from: "https://northline.ca", to: "https://evil.example" } } };

  it("are admins-only: a company member can't clear its own flag, suspend, reinstate or approve", async () => {
    setup("approved", flagged);
    h.isAdmin = false;
    for (const action of [clearProfileReviewAction, suspendOrganizationAction, reinstateOrganizationAction]) {
      expect(await redirectOf(action(form({ id: "org-1", seen: ORG.updated_at })))).toBe("/dashboard");
    }
    expect(await redirectOf(reviewOrganizationAction(form({ id: "org-1", decision: "approved" })))).toBe("/dashboard");
    expect(orgUpdates()).toEqual([]);
    expect(h.db.tables.organizations[0]).toMatchObject({ profile_status: "approved", ...flagged });
    expect(h.audits).toEqual([]);
  });

  it("'Looks good' clears the flag and keeps the company approved", async () => {
    setup("approved", flagged);
    h.isAdmin = true;
    expect(await redirectOf(clearProfileReviewAction(form({ id: "org-1", seen: ORG.updated_at })))).toBe("/admin/organizations?view=edited");
    expect(h.db.tables.organizations[0]).toMatchObject({ profile_status: "approved", review_flagged_at: null, review_changes: null });
    expect(h.audits.map((a) => a.action)).toEqual(["organization.review_cleared"]);
    expect(h.audits[0].metadata).toEqual({ changes: flagged.review_changes });
  });

  it("'Looks good' clears nothing if the company saved again since the admin looked", async () => {
    setup("approved", flagged);
    h.isAdmin = true;
    expect(await redirectOf(clearProfileReviewAction(form({ id: "org-1", seen: "2026-10-19T00:00:00Z" })))).toBe("/admin/organizations?view=edited&stale=1");
    expect(h.db.tables.organizations[0]).toMatchObject(flagged);
    expect(h.audits).toEqual([]);
  });

  it("'Suspend' sets suspended (only from approved) and 'Reinstate' undoes it", async () => {
    setup("approved", flagged);
    h.isAdmin = true;
    await redirectOf(suspendOrganizationAction(form({ id: "org-1" })));
    expect(h.db.tables.organizations[0]).toMatchObject({ profile_status: "suspended", review_flagged_at: null });
    expect(h.audits.map((a) => a.action)).toEqual(["organization.suspended"]);
    expect(h.audits[0].metadata).toEqual({ changes: flagged.review_changes });

    expect(await redirectOf(reinstateOrganizationAction(form({ id: "org-1" })))).toBe("/admin/organizations?view=suspended");
    expect(h.db.tables.organizations[0].profile_status).toBe("approved");
    expect(h.audits.map((a) => a.action)).toEqual(["organization.suspended", "organization.reinstated"]);
  });

  it("'Suspend' leaves a pending or rejected company alone; 'Reinstate' never revives a merged duplicate", async () => {
    for (const status of ["pending_review", "rejected"]) {
      setup(status);
      h.isAdmin = true;
      await redirectOf(suspendOrganizationAction(form({ id: "org-1" })));
      expect(h.db.tables.organizations[0].profile_status).toBe(status);
    }
    setup("suspended", { status: "deleted" });
    h.isAdmin = true;
    await redirectOf(reinstateOrganizationAction(form({ id: "org-1" })));
    expect(h.db.tables.organizations[0].profile_status).toBe("suspended");
    expect(h.audits).toEqual([]);
  });

  it("logs approve / reject decisions (future proof of an earlier approval)", async () => {
    setup("pending_review");
    h.isAdmin = true;
    await redirectOf(reviewOrganizationAction(form({ id: "org-1", decision: "approved" })));
    expect(h.db.tables.organizations[0].profile_status).toBe("approved");
    expect(h.audits.map((a) => a.action)).toEqual(["organization.approved"]);
  });
});

// ── PM job alerts (PR #168) ───────────────────────────────────────────

describe("PM job alerts after an approved company edits", () => {
  it("still emails an edited-approved trade (flagged for review, still approved)", async () => {
    setup("approved");
    await updateCompanyProfileAction({}, profileForm({ name: "Northline Roofing Inc." }));
    const saved = h.db.tables.organizations[0] as typeof ORG;
    expect(saved.profile_status).toBe("approved");

    const regions: RegionRow[] = [
      { id: "ca", name: "Canada", slug: "canada", parent_id: null, province: null, country: "Canada" },
      { id: "on", name: "Ontario", slug: "ontario", parent_id: "ca", province: "Ontario", country: "Canada" },
      { id: "to", name: "Toronto", slug: "toronto", parent_id: "on", province: "Ontario", country: "Canada" },
    ];
    const trade: AlertOrg = { ...saved, countries: new Set(["CA"]) };
    const audience = selectAlertAudience({
      job: { id: "j1", region_id: "to", city: "Toronto", province: "Ontario", country: "CA", categoryIds: ["c-roof"], posted_by_user_id: "pm-1", posted_by_organization_id: "pm-org" },
      regions,
      orgs: [trade],
      catsByOrg: new Map([["org-1", new Set(["c-roof"])]]),
      regionsByOrg: new Map([["org-1", ["to"]]]),
      usersByOrg: new Map([["org-1", ["user-1"]]]),
      users: new Map([["user-1", { email: "office@northline.ca", status: "active" }]]),
      optedOut: new Set(),
      alreadySent: new Set(),
    });
    expect(audience.orgs.map((o) => o.id)).toEqual(["org-1"]);
    expect(audience.recipients.map((r) => r.email)).toEqual(["office@northline.ca"]);
  });
});
