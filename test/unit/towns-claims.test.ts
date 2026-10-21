import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";
import { decideBuyerClaim, submitBuyerClaim, type ClaimantInput } from "@/lib/towns/claims";
import { domainOwners } from "@/lib/towns/domains";
import type { ClaimableBuyer } from "@/lib/towns/claimable";

/**
 * "Claim this page free": verified on the spot by email domain, waiting for
 * an admin, or (a second claimant) a join request to the organization that
 * already manages the page. One public-buyer organization per page. Plus the
 * admin decision and its route's gating.
 */

const NOW = "2026-10-21T12:00:00.000Z";
const cobourg: ClaimableBuyer = {
  key: "ontario/town-of-cobourg",
  provinceSlug: "ontario",
  slug: "town-of-cobourg",
  path: "/buyers/ontario/town-of-cobourg",
  name: "Town of Cobourg",
  provinceCode: "ON",
  province: "Ontario",
  holder: { identity: "ON|cobourg", website: "cobourg.ca", domains: ["cobourg.ca"] },
};
const owners = domainOwners([cobourg.holder]);
const who = (userId: string, email: string, over: Partial<ClaimantInput> = {}): ClaimantInput => ({
  userId,
  email,
  emailConfirmed: true,
  fullName: "Pat Clerk",
  jobTitle: "Clerk-Treasurer",
  phone: null,
  note: null,
  ...over,
});

function db(): FakeDb {
  return fakeDb(
    {
      organizations: [],
      organization_members: [],
      buyer_pages: [],
      buyer_claims: [],
      buyer_domains: [],
      organization_join_requests: [],
      notifications: [],
      users_profile: [
        { id: "u1", onboarding_completed: false },
        { id: "u2", onboarding_completed: false },
        { id: "u3", onboarding_completed: false },
      ],
    },
    {
      unique: {
        buyer_pages: (a, b) => a.buyer_key === b.buyer_key || a.organization_id === b.organization_id,
        organization_join_requests: (a, b) => a.organization_id === b.organization_id && a.user_id === b.user_id && a.status === "pending",
        buyer_domains: (a, b) => a.buyer_key === b.buyer_key && a.domain === b.domain,
      },
      defaults: { organization_join_requests: { status: "pending" }, organizations: { status: "active" } },
    },
  );
}

const claim = (d: FakeDb, w: ClaimantInput) => submitBuyerClaim(d as never, { who: w, buyer: cobourg, owners, now: NOW });

describe("claiming a page", () => {
  let d: FakeDb;
  beforeEach(() => {
    d = db();
  });

  it("verifies a clerk with a matching work email on the spot", async () => {
    const r = await claim(d, who("u1", "clerk@cobourg.ca"));
    expect(r.status).toBe("verified");
    expect(d.tables.organizations).toHaveLength(1);
    expect(d.tables.organizations[0]).toMatchObject({ organization_type: "public_buyer", name: "Town of Cobourg", profile_status: "draft", verified: true });
    expect(d.tables.organization_members[0]).toMatchObject({ user_id: "u1", role: "owner" });
    expect(d.tables.buyer_pages[0]).toMatchObject({ buyer_key: "ontario/town-of-cobourg", verified_method: "email_domain", verified_domain: "cobourg.ca" });
    expect(d.tables.buyer_claims[0]).toMatchObject({ status: "verified", method: "email_domain", email_domain: "cobourg.ca" });
    expect(d.tables.users_profile.find((u) => u.id === "u1")).toMatchObject({ onboarding_completed: true, full_name: "Pat Clerk" });
  });

  it("sends a free mailbox or another domain to admin review (no page yet)", async () => {
    const r = await claim(d, who("u1", "pat.clerk@gmail.com"));
    expect(r).toMatchObject({ status: "pending", reason: "free_mail" });
    expect(d.tables.buyer_pages).toHaveLength(0);
    expect(d.tables.organizations[0]).toMatchObject({ organization_type: "public_buyer" });
    expect(d.tables.organizations[0].verified).toBeUndefined();
    expect(d.tables.buyer_claims[0]).toMatchObject({ status: "pending", reason: "free_mail", method: null });
    const r2 = await claim(d, who("u2", "clerk@porthope.ca"));
    expect(r2).toMatchObject({ status: "pending", reason: "domain_mismatch" });
  });

  it("doesn't file a second open claim when the same person claims again", async () => {
    await claim(d, who("u1", "pat.clerk@gmail.com"));
    await claim(d, who("u1", "pat.clerk@gmail.com", { jobTitle: "Deputy Clerk" }));
    expect(d.tables.buyer_claims).toHaveLength(1);
    expect(d.tables.buyer_claims[0]).toMatchObject({ job_title: "Deputy Clerk" });
    expect(d.tables.organizations).toHaveLength(1);
  });

  it("turns a second claimant into a join request to the organization that manages the page", async () => {
    await claim(d, who("u1", "clerk@cobourg.ca"));
    const orgId = d.tables.organizations[0].id as string;
    const r = await claim(d, who("u2", "deputy@cobourg.ca"));
    expect(r).toMatchObject({ status: "join_requested", organizationId: orgId });
    // One public-buyer organization per page.
    expect(d.tables.organizations).toHaveLength(1);
    expect(d.tables.buyer_pages).toHaveLength(1);
    expect(d.tables.organization_join_requests[0]).toMatchObject({ organization_id: orgId, user_id: "u2", match_reasons: ["buyer_claim", "email_domain"] });
    expect(d.tables.buyer_claims.find((c) => c.user_id === "u2")).toMatchObject({ status: "join_requested", reason: "managed" });
    // The owner is notified in the app; the joiner waits on onboarding's "Request sent".
    expect(d.tables.notifications.some((n) => n.user_id === "u1" && n.type === "join_request")).toBe(true);
    expect(d.tables.users_profile.find((u) => u.id === "u2")).toMatchObject({ onboarding_completed: false });
    // Even a free mailbox: it's the managing organization's call.
    expect(await claim(d, who("u3", "someone@gmail.com"))).toMatchObject({ status: "join_requested" });
  });

  it("leaves a waiting organization of one's own when the page gets managed meanwhile", async () => {
    await claim(d, who("u2", "deputy@gmail.com")); // u2: pending, own unverified org
    await claim(d, who("u1", "clerk@cobourg.ca")); // u1 verified first
    expect(d.tables.organizations).toHaveLength(2);
    const r = await claim(d, who("u2", "deputy@gmail.com"));
    expect(r.status).toBe("join_requested");
    // u2's empty, unverified organization is gone: a person belongs to one organization.
    expect(d.tables.organizations).toHaveLength(1);
    expect(d.tables.organization_members.filter((m) => m.user_id === "u2")).toHaveLength(0);
  });

  it("refuses a company account and a second page", async () => {
    d.tables.organizations.push({ id: "trade-org", organization_type: "trade_company" });
    d.tables.organization_members.push({ organization_id: "trade-org", user_id: "u3", role: "owner" });
    expect(await claim(d, who("u3", "clerk@cobourg.ca"))).toEqual({ status: "error", reason: "other_org" });
    await claim(d, who("u1", "clerk@cobourg.ca"));
    const other = { ...cobourg, key: "ontario/town-of-port-hope", slug: "town-of-port-hope" };
    expect(await submitBuyerClaim(d as never, { who: who("u1", "clerk@cobourg.ca"), buyer: other, owners, now: NOW })).toEqual({ status: "error", reason: "already_managing" });
  });

  it("says so when the migration hasn't run", async () => {
    const bare = fakeDb({ organizations: [], organization_members: [], users_profile: [] });
    expect(await claim(bare, who("u1", "clerk@cobourg.ca"))).toEqual({ status: "error", reason: "missing_table" });
  });
});

describe("the admin's decision", () => {
  let d: FakeDb;
  beforeEach(() => {
    d = db();
  });

  it("verifies a waiting claim and can trust its domain for next time", async () => {
    await claim(d, who("u1", "clerk@cobourg-on.ca"));
    const id = d.tables.buyer_claims[0].id as string;
    const r = await decideBuyerClaim(d as never, { claimId: id, adminId: "admin-1", approve: true, trustDomain: true, notes: "Checked the staff page", now: NOW });
    expect(r).toEqual({ ok: true, status: "verified" });
    expect(d.tables.buyer_pages[0]).toMatchObject({ buyer_key: "ontario/town-of-cobourg", verified_method: "admin", verified_by: "admin-1" });
    expect(d.tables.organizations[0]).toMatchObject({ verified: true });
    expect(d.tables.buyer_claims[0]).toMatchObject({ status: "verified", method: "admin", decided_by: "admin-1", admin_notes: "Checked the staff page" });
    expect(d.tables.buyer_domains[0]).toMatchObject({ buyer_key: "ontario/town-of-cobourg", domain: "cobourg-on.ca" });
    expect(await decideBuyerClaim(d as never, { claimId: id, adminId: "admin-1", approve: true, trustDomain: false, notes: null, now: NOW })).toEqual({ ok: false, reason: "not_pending" });
  });

  it("never trusts a free mailbox's domain", async () => {
    await claim(d, who("u1", "clerk@gmail.com"));
    await decideBuyerClaim(d as never, { claimId: d.tables.buyer_claims[0].id as string, adminId: "admin-1", approve: true, trustDomain: true, notes: null, now: NOW });
    expect(d.tables.buyer_domains).toHaveLength(0);
  });

  it("turns approval into a join request when someone else manages the page", async () => {
    await claim(d, who("u2", "deputy@gmail.com"));
    await claim(d, who("u1", "clerk@cobourg.ca"));
    const waiting = d.tables.buyer_claims.find((c) => c.user_id === "u2")!;
    const r = await decideBuyerClaim(d as never, { claimId: waiting.id as string, adminId: "admin-1", approve: true, trustDomain: false, notes: null, now: NOW });
    expect(r).toEqual({ ok: true, status: "join_requested" });
    expect(d.tables.buyer_pages).toHaveLength(1);
    expect(d.tables.organization_join_requests[0]).toMatchObject({ user_id: "u2" });
  });

  it("rejects", async () => {
    await claim(d, who("u1", "clerk@gmail.com"));
    const r = await decideBuyerClaim(d as never, { claimId: d.tables.buyer_claims[0].id as string, adminId: "admin-1", approve: false, trustDomain: false, notes: "Not staff", now: NOW });
    expect(r).toEqual({ ok: true, status: "rejected" });
    expect(d.tables.buyer_pages).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ route gating */

const { state } = vi.hoisted(() => ({ state: { session: null as unknown, db: null as unknown } }));
vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => true, isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => state.db }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => state.session,
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
}));

describe("POST /api/admin/buyer-claims (admins only)", () => {
  const post = async (body: unknown, origin = "https://pmrfp.com") => {
    const { POST } = await import("@/app/api/admin/buyer-claims/route");
    return POST(new Request("https://pmrfp.com/api/admin/buyer-claims", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
  };
  const session = (role: string, status = "active") => ({ userId: "a1", profile: { primary_role: role, status } });

  it("refuses signed-out people, members, public buyers and suspended admins", async () => {
    state.db = db();
    for (const s of [null, session("trade"), session("public_buyer"), session("admin", "suspended")]) {
      state.session = s;
      expect((await post({ action: "approve", id: "11111111-1111-4111-8111-111111111111" })).status).toBe(403);
    }
  });

  it("refuses another site's form, then lets an admin decide", async () => {
    const d = db();
    state.db = d;
    state.session = session("admin");
    expect((await post({ action: "reject", id: "11111111-1111-4111-8111-111111111111" }, "https://evil.example")).status).toBe(403);
    await claim(d, who("u1", "clerk@gmail.com"));
    // The fake's ids aren't uuids: give the claim one.
    d.tables.buyer_claims[0].id = "11111111-1111-4111-8111-111111111111";
    const res = await post({ action: "approve", id: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "verified" });
    expect((await post({ action: "approve", id: "not-a-uuid" })).status).toBe(422);
  });
});
