import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanEmail, emailLookupPatterns, normalizeEmail, sameMailbox } from "@/lib/dedupe/email";
import {
  MATCH_THRESHOLD,
  findCompanyDuplicates,
  normalizeCompanyName,
  phoneDigits,
  rankCompanyMatches,
  scoreCompanyMatch,
  websiteDomain,
} from "@/lib/dedupe/company";
import { findAccountDuplicates, normalizePersonName } from "@/lib/dedupe/people";
import { findAccountByEmail, findCompanyMatches } from "@/lib/dedupe/lookup";
import { shouldBlockOAuthUser, existingAccountPath } from "@/lib/dedupe/signup";
import { cancelJoinRequest, createJoinRequest, decideJoinRequest, pendingJoinRequestFor } from "@/lib/dedupe/join";
import { MERGE_PLAN, mergeOrganizations, pickPrimary } from "@/lib/dedupe/merge";
import { isMissingRelation, orderedPair, pairKey } from "@/lib/dedupe/review";
import { fakeDb } from "./fake-supabase";

const asClient = (db: unknown) => db as SupabaseClient;

/* ------------------------------------------------------------------ email */

describe("email normalization", () => {
  it("trims and lowercases every address", () => {
    expect(cleanEmail("  Bob@Firm.CA ")).toBe("bob@firm.ca");
    expect(normalizeEmail("  Bob@Firm.CA ")).toBe("bob@firm.ca");
  });

  it("drops gmail dots and +tags, and folds googlemail.com into gmail.com", () => {
    expect(normalizeEmail("T.Miah.8363@gmail.com")).toBe("tmiah8363@gmail.com");
    expect(normalizeEmail("tmiah8363+pmrfp@gmail.com")).toBe("tmiah8363@gmail.com");
    expect(normalizeEmail("t.miah8363+x+y@GoogleMail.com")).toBe("tmiah8363@gmail.com");
  });

  it("keeps dots and +tags for other providers (they may be different mailboxes)", () => {
    expect(normalizeEmail("first.last+bids@firm.ca")).toBe("first.last+bids@firm.ca");
    expect(sameMailbox("first.last@firm.ca", "firstlast@firm.ca")).toBe(false);
  });

  it("knows when two addresses reach the same inbox", () => {
    expect(sameMailbox("tmiah8363@gmail.com", "T.MIAH8363+promo@googlemail.com")).toBe(true);
    expect(sameMailbox("tmiah8363@gmail.com", "centraledenettoyage@gmail.com")).toBe(false);
  });

  it("builds ILIKE patterns that find dotted and tagged gmail variants", () => {
    expect(emailLookupPatterns("tmiah@gmail.com")).toEqual(["t%m%i%a%h%@gmail.com", "t%m%i%a%h%@googlemail.com"]);
    expect(emailLookupPatterns("Bob_Smith@Firm.ca")).toEqual(["bob\\_smith@firm.ca"]);
  });
});

/* ------------------------------------------------------------------ sign-up lookup */

describe("existing-account lookup (sign-up blocks a second account)", () => {
  const db = fakeDb({
    users_profile: [
      { id: "u1", email: "tmiah8363@gmail.com" },
      { id: "u2", email: "Owner@Firm.ca" },
      { id: "u3", email: "tmiahx8363@gmail.com" },
    ],
  });

  it("finds the account for a dotted / +tag / upper-case gmail variant", async () => {
    expect(await findAccountByEmail(asClient(db), "T.Miah8363+pmrfp@gmail.com")).toEqual({ id: "u1", email: "tmiah8363@gmail.com" });
    expect(await findAccountByEmail(asClient(db), "tmiah8363@googlemail.com")).toMatchObject({ id: "u1" });
  });

  it("matches other providers case-insensitively, but not loosely", async () => {
    expect(await findAccountByEmail(asClient(db), "owner@firm.ca")).toMatchObject({ id: "u2" });
    expect(await findAccountByEmail(asClient(db), "owner2@firm.ca")).toBeNull();
  });

  it("does not confuse a look-alike gmail (the pattern over-matches; the filter doesn't)", async () => {
    expect(await findAccountByEmail(asClient(db), "tmiahx8363@gmail.com")).toMatchObject({ id: "u3" });
    expect(await findAccountByEmail(asClient(db), "tmia8363@gmail.com")).toBeNull();
  });

  it("can skip the caller's own row (a just-created Google user)", async () => {
    expect(await findAccountByEmail(asClient(db), "tmiah8363@gmail.com", "u1")).toBeNull();
  });

  it("fails open when the lookup errors (never blocks a sign-up on our bug)", async () => {
    expect(await findAccountByEmail(asClient(fakeDb({})), "x@y.com")).toBeNull();
  });

  it("sends a duplicate to sign-in with the notice, keeping a safe next", () => {
    expect(existingAccountPath()).toBe("/sign-in?notice=exists");
    expect(existingAccountPath("/rfps/abc")).toBe("/sign-in?notice=exists&next=%2Frfps%2Fabc");
  });
});

describe("Google duplicates", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  const fresh = { id: "g1", email: "t.miah8363@gmail.com", created_at: "2026-10-19T11:58:00Z", identities: [{ provider: "google" }] };
  const existing = { id: "u1", email: "tmiah8363@gmail.com" };

  it("undoes a brand-new, empty Google account whose mailbox already has an account", () => {
    expect(shouldBlockOAuthUser(fresh, { existing, memberships: 0, onboardingCompleted: false }, now)).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(shouldBlockOAuthUser(fresh, { existing: null, memberships: 0, onboardingCompleted: false }, now)).toBe(false);
    expect(shouldBlockOAuthUser(fresh, { existing: { ...existing, id: "g1" }, memberships: 0, onboardingCompleted: false }, now)).toBe(false);
    expect(shouldBlockOAuthUser({ ...fresh, created_at: "2026-10-18T00:00:00Z" }, { existing, memberships: 0, onboardingCompleted: false }, now)).toBe(false);
    expect(shouldBlockOAuthUser(fresh, { existing, memberships: 1, onboardingCompleted: false }, now)).toBe(false);
    expect(shouldBlockOAuthUser(fresh, { existing, memberships: 0, onboardingCompleted: true }, now)).toBe(false);
    expect(shouldBlockOAuthUser({ ...fresh, identities: [{ provider: "email" }] }, { existing, memberships: 0, onboardingCompleted: false }, now)).toBe(false);
  });
});

/* ------------------------------------------------------------------ company matching */

describe("company match scoring", () => {
  it("normalizes names: legal suffixes, punctuation, accents, case", () => {
    expect(normalizeCompanyName("Centrale De Nettoyage Inc.")).toBe("centrale de nettoyage");
    expect(normalizeCompanyName("ABC Plumbing, Ltd")).toBe("abc plumbing");
    expect(normalizeCompanyName("Rénovations Côté Ltée")).toBe("renovations cote");
    expect(normalizeCompanyName("Inc.")).toBe("inc");
  });

  it("normalizes websites and phones", () => {
    expect(websiteDomain("https://www.centraledenettoyage.ca/")).toBe("centraledenettoyage.ca");
    expect(websiteDomain("centraledenettoyage.ca/contact")).toBe("centraledenettoyage.ca");
    expect(websiteDomain("not a url")).toBe("");
    expect(phoneDigits("+1 (438) 467-7009")).toBe("4384677009");
    expect(phoneDigits("467-70")).toBe("");
  });

  const existing = { name: "Centrale De Nettoyage", website: "https://www.centraledenettoyage.ca/", phone: "4384677009", email: "centraledenettoyage@gmail.com" };

  it("one strong signal is enough: name, website or phone", () => {
    expect(scoreCompanyMatch({ name: "Centrale de Nettoyage Inc" }, existing)).toEqual({ score: 60, reasons: ["name"] });
    expect(scoreCompanyMatch({ name: "CDN Cleaning", website: "centraledenettoyage.ca" }, existing).reasons).toEqual(["website"]);
    expect(scoreCompanyMatch({ name: "CDN Cleaning", phone: "(438) 467-7009" }, existing).reasons).toEqual(["phone"]);
  });

  it("ignores free email domains, but a company domain counts", () => {
    expect(scoreCompanyMatch({ name: "Other Co", email: "someone@gmail.com" }, existing).score).toBe(0);
    const firm = { name: "Acme Electric", website: "acme-electric.ca", email: "info@acme-electric.ca" };
    expect(scoreCompanyMatch({ name: "Spark Bros", email: "joe@acme-electric.ca" }, firm).reasons).toEqual(["email_domain"]);
  });

  it("a similar name alone stays under the threshold; with a phone it's well over", () => {
    const weak = scoreCompanyMatch({ name: "Centrale De Nettoyage Montreal" }, existing);
    expect(weak.reasons).toEqual(["similar_name"]);
    expect(weak.score).toBeLessThan(MATCH_THRESHOLD);
    expect(scoreCompanyMatch({ name: "Centrale De Nettoyage Montreal", phone: "438-467-7009" }, existing).score).toBe(85);
  });

  it("ranks matches best first, older listing on ties, and drops weak ones", () => {
    const candidates = [
      { id: "new", slug: "n", name: "ABC Plumbing", created_at: "2026-10-01" },
      { id: "old", slug: "o", name: "ABC Plumbing Ltd", created_at: "2026-01-01" },
      { id: "both", slug: "b", name: "ABC Plumbing", phone: "416-555-0100", created_at: "2026-05-01" },
      { id: "none", slug: "x", name: "Zed Roofing", created_at: "2026-01-01" },
    ];
    const ranked = rankCompanyMatches({ name: "ABC Plumbing Inc.", phone: "4165550100" }, candidates);
    expect(ranked.map((m) => m.candidate.id)).toEqual(["both", "old", "new"]);
  });

  it("finds candidates in the database and skips demo listings", async () => {
    const db = fakeDb({
      organizations: [
        { id: "o1", slug: "centrale", name: "Centrale De Nettoyage", website: "https://www.centraledenettoyage.ca/", phone: "4384677009", status: "active", is_demo: false, created_at: "2026-10-18" },
        { id: "o2", slug: "demo", name: "Centrale De Nettoyage", status: "active", is_demo: true, created_at: "2026-01-01" },
        { id: "o3", slug: "gone", name: "Centrale De Nettoyage", status: "deleted", is_demo: false, created_at: "2026-01-01" },
      ],
    });
    const matches = await findCompanyMatches(asClient(db), { name: "Centrale de nettoyage inc.", phone: "438 467 7009" });
    expect(matches.map((m) => [m.candidate.id, m.reasons])).toEqual([["o1", ["name", "phone"]]]);
  });

  it("admin view: pairs of listings, older first", () => {
    const pairs = findCompanyDuplicates([
      { id: "b", slug: "b", name: "ABC Plumbing Inc", created_at: "2026-09-01" },
      { id: "a", slug: "a", name: "A.B.C. Plumbing", created_at: "2026-02-01" },
      { id: "c", slug: "c", name: "Zed Roofing", created_at: "2026-02-01" },
    ]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id, pairs[0].reasons]).toEqual(["a", "b", ["name"]]);
  });
});

/* ------------------------------------------------------------------ same person */

describe("same-person detection (admin view, never blocks)", () => {
  // The real case: one person, two gmail accounts, a day apart.
  const tm1 = { id: "ddcd6cc6", email: "tmiah8363@gmail.com", full_name: "Thomas Miah", phone: null, created_at: "2026-10-17T20:19:10Z" };
  const tm2 = { id: "7edc6579", email: "centraledenettoyage@gmail.com", full_name: "Thomas Miah", phone: null, created_at: "2026-10-18T18:41:52Z", cities: ["Montreal"] };

  it("lists the Thomas Miah pair (same full name within 90 days), older account first", () => {
    const pairs = findAccountDuplicates([tm2, tm1]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: { id: "ddcd6cc6" }, b: { id: "7edc6579" }, strength: "name", reasons: ["name"] });
  });

  it("ranks mailbox > name+phone > name+city > name", () => {
    const users = [
      { id: "e1", email: "j.doe@gmail.com", full_name: "J", phone: null, created_at: "2026-01-01" },
      { id: "e2", email: "jdoe+x@gmail.com", full_name: "Jay", phone: null, created_at: "2026-09-01" },
      { id: "p1", email: "a@x.ca", full_name: "Ann Lee", phone: "416-555-0101", created_at: "2026-09-01" },
      { id: "p2", email: "b@y.ca", full_name: "ann  LEE", phone: null, orgPhones: ["(416) 555 0101"], created_at: "2026-09-02" },
      { id: "c1", email: "c@x.ca", full_name: "Bo Chen", phone: null, cities: ["Toronto"], created_at: "2026-09-01" },
      { id: "c2", email: "d@y.ca", full_name: "Bo Chen", phone: null, cities: ["toronto"], created_at: "2026-09-03" },
      tm1,
      tm2,
    ];
    expect(findAccountDuplicates(users).map((p) => p.strength)).toEqual(["email", "phone", "city", "name"]);
  });

  it("ignores one-word names and sign-ups more than 90 days apart", () => {
    expect(normalizePersonName("  Thomas   MIAH ")).toBe("thomas miah");
    expect(findAccountDuplicates([
      { id: "1", email: "a@a.ca", full_name: "Mike", phone: "4165550000", created_at: "2026-09-01" },
      { id: "2", email: "b@b.ca", full_name: "Mike", phone: "4165550000", created_at: "2026-09-02" },
    ])).toEqual([]);
    expect(findAccountDuplicates([
      { ...tm1, created_at: "2026-01-01" },
      tm2,
    ])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ join requests */

function joinDb() {
  return fakeDb(
    {
      organizations: [{ id: "org1", name: "Centrale De Nettoyage", slug: "centrale", status: "active" }],
      organization_members: [{ organization_id: "org1", user_id: "owner1", role: "owner" }],
      organization_join_requests: [],
      notifications: [],
      users_profile: [{ id: "new1", onboarding_completed: false }],
    },
    {
      defaults: { organization_join_requests: { status: "pending" } },
      unique: {
        organization_join_requests: (e, r) => e.organization_id === r.organization_id && e.user_id === r.user_id && e.status === "pending" && (r.status ?? "pending") === "pending",
        organization_members: (e, r) => e.organization_id === r.organization_id && e.user_id === r.user_id,
      },
    },
  );
}

describe("join-request flow", () => {
  it("creates a pending request and tells the company's owner (in-app, no email)", async () => {
    const db = joinDb();
    const r = await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: ["name", "phone"] });
    expect(r).toMatchObject({ ok: true, approvers: ["owner1"] });
    expect(db.tables.organization_join_requests).toHaveLength(1);
    expect(db.tables.organization_join_requests[0]).toMatchObject({ organization_id: "org1", user_id: "new1", match_reasons: ["name", "phone"] });
    expect(db.tables.notifications).toEqual([expect.objectContaining({ user_id: "owner1", type: "join_request" })]);
  });

  it("refuses a second pending request, an existing member, a gone company, or a missing table", async () => {
    const db = joinDb();
    await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] });
    expect(await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] })).toEqual({ ok: false, reason: "already_pending" });
    expect(await createJoinRequest(asClient(db), { organizationId: "org1", userId: "owner1", reasons: [] })).toEqual({ ok: false, reason: "already_member" });
    expect(await createJoinRequest(asClient(db), { organizationId: "nope", userId: "new1", reasons: [] })).toEqual({ ok: false, reason: "no_company" });
    const noTable = joinDb();
    delete (noTable.tables as Record<string, unknown>).organization_join_requests;
    expect(await createJoinRequest(asClient(noTable), { organizationId: "org1", userId: "new1", reasons: [] })).toEqual({ ok: false, reason: "missing_table" });
  });

  it("only the company's owner/admin (or a PMRFP admin) can decide", async () => {
    const db = joinDb();
    const r = await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] });
    const requestId = r.ok ? r.id : "";
    expect(await decideJoinRequest(asClient(db), { requestId, deciderId: "stranger", deciderIsAdmin: false, approve: true })).toEqual({ ok: false, reason: "forbidden" });
    expect(db.tables.organization_members).toHaveLength(1);
  });

  it("approval adds a member and finishes their onboarding; it can't be decided twice", async () => {
    const db = joinDb();
    const r = await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] });
    const requestId = r.ok ? r.id : "";
    expect(await pendingJoinRequestFor(asClient(db), "new1")).toMatchObject({ id: requestId, organizationId: "org1" });
    expect(await decideJoinRequest(asClient(db), { requestId, deciderId: "owner1", deciderIsAdmin: false, approve: true })).toEqual({ ok: true, status: "approved" });
    expect(db.tables.organization_members).toContainEqual(expect.objectContaining({ organization_id: "org1", user_id: "new1", role: "member" }));
    expect(db.tables.users_profile[0].onboarding_completed).toBe(true);
    expect(db.tables.organization_join_requests[0]).toMatchObject({ status: "approved", decided_by: "owner1" });
    expect(await decideJoinRequest(asClient(db), { requestId, deciderId: "owner1", deciderIsAdmin: false, approve: false })).toEqual({ ok: false, reason: "not_pending" });
  });

  it("an admin can decline for a company with no owner; the joiner can cancel their own", async () => {
    const db = joinDb();
    db.tables.organization_members = [];
    const r = await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] });
    expect(r).toMatchObject({ ok: true, approvers: [] });
    const requestId = r.ok ? r.id : "";
    expect(await decideJoinRequest(asClient(db), { requestId, deciderId: "admin1", deciderIsAdmin: true, approve: false })).toEqual({ ok: true, status: "declined" });
    expect(db.tables.organization_members).toEqual([]);

    const r2 = await createJoinRequest(asClient(db), { organizationId: "org1", userId: "new1", reasons: [] });
    expect(await cancelJoinRequest(asClient(db), { requestId: r2.ok ? r2.id : "", userId: "someone-else" })).toBe(false);
    expect(await cancelJoinRequest(asClient(db), { requestId: r2.ok ? r2.id : "", userId: "new1" })).toBe(true);
  });
});

/* ------------------------------------------------------------------ merge */

describe("merging companies", () => {
  function mergeDb() {
    return fakeDb({
      organizations: [
        { id: "P", name: "Centrale De Nettoyage", created_at: "2026-10-01", status: "active", profile_status: "approved", featured: false },
        { id: "D", name: "Centrale de Nettoyage Inc", created_at: "2026-10-18", status: "active", profile_status: "approved", featured: true },
      ],
      organization_members: [
        { organization_id: "P", user_id: "u-old", role: "owner" },
        { organization_id: "D", user_id: "u-new", role: "owner" },
        { organization_id: "D", user_id: "u-old", role: "member" },
      ],
      organization_categories: [
        { organization_id: "P", category_id: "janitorial" },
        { organization_id: "D", category_id: "janitorial" },
        { organization_id: "D", category_id: "windows" },
      ],
      case_studies: [{ id: "cs1", organization_id: "D" }],
      vendor_reviews: [{ id: "r1", organization_id: "D" }, { id: "r2", organization_id: "D" }],
      karma_events: [
        { id: "k1", org_id: "P", kind: "profile_approved", source_type: "org", source_id: "x", actor_id: "" },
        { id: "k2", org_id: "D", kind: "profile_approved", source_type: "org", source_id: "x", actor_id: "" },
        { id: "k3", org_id: "D", kind: "project_verified_review", source_type: "review", source_id: "r1", actor_id: "" },
      ],
      subscriptions: [{ id: "s1", organization_id: "D", status: "active" }],
      rfp_posts: [{ id: "rfp1", posted_by_organization_id: "D" }],
      rfp_interests: [
        { id: "i1", rfp_id: "rfpA", trade_organization_id: "P" },
        { id: "i2", rfp_id: "rfpA", trade_organization_id: "D" },
        { id: "i3", rfp_id: "rfpB", trade_organization_id: "D" },
      ],
      org_karma: [{ org_id: "P", score: 10 }, { org_id: "D", score: 5 }],
      // Every other table in the plan is "not migrated yet" in this fake.
    });
  }

  it("keeps the older listing as primary", () => {
    const a = { id: "P", created_at: "2026-10-01" };
    const b = { id: "D", created_at: "2026-10-18" };
    expect(pickPrimary(b, a)).toEqual({ primary: a, duplicate: b });
  });

  it("moves members, projects, reviews, karma and subscriptions without breaking unique keys", async () => {
    const db = mergeDb();
    const report = await mergeOrganizations(asClient(db), { primaryId: "P", duplicateId: "D" });

    // Members: the duplicate's owner joins as admin (the primary already has an owner); a shared member stays put.
    expect(db.tables.organization_members).toContainEqual({ organization_id: "P", user_id: "u-new", role: "admin" });
    expect(report.members).toEqual({ moved: 1, kept: 1, demotedOwners: 1 });

    // Categories: the new one moves, the shared one is left on the duplicate.
    expect(db.tables.organization_categories.filter((c) => c.organization_id === "P").map((c) => c.category_id).sort()).toEqual(["janitorial", "windows"]);
    // Projects (case studies), reviews, RFPs: all move.
    expect(db.tables.case_studies.every((c) => c.organization_id === "P")).toBe(true);
    expect(db.tables.vendor_reviews.every((r) => r.organization_id === "P")).toBe(true);
    expect(db.tables.rfp_posts[0].posted_by_organization_id).toBe("P");
    // RFP interests: rfpB moves, rfpA (already on P) stays.
    expect(db.tables.rfp_interests.find((i) => i.id === "i3")!.trade_organization_id).toBe("P");
    expect(db.tables.rfp_interests.find((i) => i.id === "i2")!.trade_organization_id).toBe("D");
    // Karma: the duplicate event key stays, the new one moves.
    expect(db.tables.karma_events.find((k) => k.id === "k3")!.org_id).toBe("P");
    expect(db.tables.karma_events.find((k) => k.id === "k2")!.org_id).toBe("D");
    // One subscription per company: only the duplicate paid, so it moves.
    expect(db.tables.subscriptions[0].organization_id).toBe("P");
    // org_karma: primary already has totals (the karma sync recomputes them).
    expect(db.tables.org_karma.find((k) => k.score === 5)!.org_id).toBe("D");

    // The duplicate is retired, not deleted.
    expect(db.tables.organizations.find((o) => o.id === "D")).toMatchObject({ status: "deleted", profile_status: "suspended", featured: false, merged_into: "P" });
    expect(db.tables.organizations).toHaveLength(2);

    // Tables that aren't migrated are skipped, not fatal.
    expect(report.steps.find((s) => s.table === "job_posts")).toMatchObject({ skipped: "missing_table" });
    expect(report.ok).toBe(true);
    expect(report.steps.map((s) => s.table)).toEqual(MERGE_PLAN.map((s) => s.table));
  });

  it("never moves a subscription onto a company that already has one", async () => {
    const db = mergeDb();
    db.tables.subscriptions.push({ id: "s0", organization_id: "P", status: "active" });
    const report = await mergeOrganizations(asClient(db), { primaryId: "P", duplicateId: "D" });
    expect(db.tables.subscriptions.find((s) => s.id === "s1")!.organization_id).toBe("D");
    expect(report.warnings.join(" ")).toMatch(/Stripe/);
  });

  it("is safe to run twice", async () => {
    const db = mergeDb();
    await mergeOrganizations(asClient(db), { primaryId: "P", duplicateId: "D" });
    const second = await mergeOrganizations(asClient(db), { primaryId: "P", duplicateId: "D" });
    expect(second.members.moved).toBe(0);
    expect(db.tables.organization_categories.filter((c) => c.organization_id === "P")).toHaveLength(2);
  });

  it("refuses to merge a company into itself", async () => {
    await expect(mergeOrganizations(asClient(mergeDb()), { primaryId: "P", duplicateId: "P" })).rejects.toThrow();
  });
});

describe("pair helpers", () => {
  it("orders pairs and recognises missing tables", () => {
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingRelation({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});
