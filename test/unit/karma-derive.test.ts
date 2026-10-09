import { describe, expect, it } from "vitest";
import {
  SYNC_REVERSAL,
  applyPlan,
  deriveEvents,
  eventKey,
  orgsForUsers,
  planSync,
  type DesiredEvent,
  type ExistingEvent,
  type KarmaSnapshot,
  type SnapForumProfile,
  type SnapOrg,
} from "@/lib/karma/derive";

const T = "2026-10-01T12:00:00Z";

function org(id: string, extra: Partial<SnapOrg> = {}): SnapOrg {
  return { id, website: `https://${id}.ca`, email: `info@${id}.ca`, profileStatus: "approved", status: "active", isDemo: false, verified: false, createdAt: T, ...extra };
}

function snap(over: Partial<KarmaSnapshot> = {}): KarmaSnapshot {
  return {
    orgs: [org("acme"), org("bolt"), org("crew"), org("demo", { isDemo: true }), org("draft", { profileStatus: "pending_review" })],
    members: [
      { userId: "ann", orgId: "acme", email: "ann@acme.ca" },
      { userId: "abe", orgId: "acme", email: "abe@acme.ca" },
      { userId: "bob", orgId: "bolt", email: "bob@bolt.ca" },
      { userId: "cat", orgId: "crew", email: "cat@crew.ca" },
      { userId: "dee", orgId: "demo" },
      { userId: "dan", orgId: "draft" },
    ],
    forumProfiles: [
      ...["ann", "abe", "bob", "cat", "dee", "dan", "solo"].map((userId): SnapForumProfile => ({ userId, orgId: null, banned: false })),
      { userId: "ban", orgId: null, banned: true },
      { userId: "sys", orgId: null, banned: false, system: true },
    ],
    votes: [],
    ratings: [],
    accepted: [],
    removed: [],
    caseStudies: [],
    reviews: [],
    rfps: [],
    interests: [],
    ...over,
  };
}

const kinds = (es: DesiredEvent[]) => es.map((e) => `${e.orgId}:${e.kind}:${e.points}`).sort();
const only = (es: DesiredEvent[], kind: string) => es.filter((e) => e.kind === kind);

describe("company verification events", () => {
  it("credits approved, live, real companies only", () => {
    const es = deriveEvents(snap({ orgs: [org("acme", { verified: true }), org("bolt"), org("demo", { isDemo: true, verified: true }), org("draft", { profileStatus: "draft" }), org("susp", { status: "suspended" })] }));
    expect(kinds(es)).toEqual(["acme:profile_approved:20", "acme:vendor_verified:20", "bolt:profile_approved:20"]);
  });
});

describe("forum events", () => {
  const vote = (voterId: string, authorId: string, extra = {}) => ({ postId: `p-${voterId}-${authorId}`, voterId, authorId, postStatus: "approved", threadStatus: "approved", createdAt: T, ...extra });

  it("credits upvotes from another company to the author's company", () => {
    const es = only(deriveEvents(snap({ votes: [vote("bob", "ann")] })), "forum_answer_upvote");
    expect(es).toHaveLength(1);
    expect(es[0]).toMatchObject({ orgId: "acme", userId: "ann", points: 5, actorId: "bob" });
  });

  it("ignores self-votes, coworkers, banned voters, the system profile and hidden posts", () => {
    const es = only(
      deriveEvents(snap({ votes: [vote("ann", "ann"), vote("abe", "ann"), vote("ban", "ann"), vote("sys", "ann"), vote("bob", "ann", { postStatus: "hidden" }), vote("cat", "ann", { threadStatus: "held" })] })),
      "forum_answer_upvote",
    );
    expect(es).toEqual([]);
  });

  it("credits nobody when the author has no approved company", () => {
    expect(only(deriveEvents(snap({ votes: [vote("bob", "solo"), vote("bob", "dee"), vote("bob", "dan")] })), "forum_answer_upvote")).toEqual([]);
  });

  it("counts a member with no company voting for another company (independent)", () => {
    expect(only(deriveEvents(snap({ votes: [vote("solo", "ann")] })), "forum_answer_upvote")).toHaveLength(1);
  });

  it("uses the forum profile's company first", () => {
    const s = snap({ votes: [vote("bob", "cat")] });
    s.members.push({ userId: "cat", orgId: "acme" });
    // Two approved memberships and none on the profile: ambiguous, nobody credited.
    expect(only(deriveEvents(s), "forum_answer_upvote")).toEqual([]);
    s.forumProfiles = s.forumProfiles.map((p) => (p.userId === "cat" ? { ...p, orgId: "crew" } : p));
    expect(only(deriveEvents(s), "forum_answer_upvote")[0].orgId).toBe("crew");
  });

  it("gives rating points only for 4-5 stars from another company", () => {
    const r = (raterId: string, score: number) => ({ threadId: `t-${raterId}`, raterId, authorId: "ann", score, threadStatus: "approved", createdAt: T });
    const es = only(deriveEvents(snap({ ratings: [r("bob", 5), r("cat", 4), r("solo", 3), r("abe", 5)] })), "forum_thread_rated");
    expect(es.map((e) => e.points).sort()).toEqual([10, 5]);
  });

  it("credits accepted answers unless the asker is the author or a coworker", () => {
    const a = (postId: string, answerAuthorId: string, askerId: string) => ({ postId, answerAuthorId, askerId, postStatus: "approved", threadStatus: "approved", createdAt: T });
    const es = only(deriveEvents(snap({ accepted: [a("1", "ann", "bob"), a("2", "ann", "abe"), a("3", "ann", "ann")] })), "forum_accepted_answer");
    expect(es.map((e) => e.sourceId)).toEqual(["1"]);
    expect(es[0].points).toBe(15);
  });

  it("charges a moderator removal to the author's company", () => {
    const es = only(deriveEvents(snap({ removed: [{ targetType: "post", targetId: "x", authorId: "ann", createdAt: T }] })), "forum_content_removed");
    expect(es).toEqual([expect.objectContaining({ orgId: "acme", points: -20, sourceType: "forum_post" })]);
  });
});

describe("project review events", () => {
  const cs = { id: "cs1", orgId: "acme", status: "published", publishedAt: T, createdAt: T };
  const rev = (extra = {}) => ({ id: "r1", orgId: "acme", caseStudyId: "cs1", status: "published", verifiedVia: "project_invite", reviewerEmail: "pm@tower.ca", reviewerUserId: null, createdAt: T, ...extra });

  it("credits a published project with a verified, published client review once", () => {
    const es = only(deriveEvents(snap({ caseStudies: [cs], reviews: [rev(), rev({ id: "r2" })] })), "project_verified_review");
    expect(es).toEqual([expect.objectContaining({ orgId: "acme", points: 40, sourceId: "cs1" })]);
  });

  it("excludes self-reviews, staff reviewers, unverified and unpublished reviews", () => {
    for (const r of [
      rev({ reviewerEmail: "boss@acme.ca" }),
      rev({ reviewerEmail: "ann@acme.ca" }),
      rev({ reviewerUserId: "abe" }),
      rev({ verifiedVia: null }),
      rev({ status: "pending_review" }),
      rev({ orgId: "bolt" }),
    ]) {
      expect(only(deriveEvents(snap({ caseStudies: [cs], reviews: [r] })), "project_verified_review")).toEqual([]);
    }
    expect(only(deriveEvents(snap({ caseStudies: [{ ...cs, status: "draft" }], reviews: [rev()] })), "project_verified_review")).toEqual([]);
  });

  it("still accepts a free-mail reviewer", () => {
    expect(only(deriveEvents(snap({ caseStudies: [cs], reviews: [rev({ reviewerEmail: "client@gmail.com" })] })), "project_verified_review")).toHaveLength(1);
  });
});

describe("RFP and GC package events", () => {
  const rfp = (extra = {}) => ({ id: "rfp1", orgId: "bolt", sourceType: "property_manager_direct", status: "published", publishedAt: T, awardedRfpId: null, isDemo: false, createdAt: T, ...extra });
  const interest = (orgId: string) => ({ rfpId: "rfp1", orgId, createdAt: "2026-10-02T00:00:00Z" });

  it("credits a PM's RFP once when another company shows interest", () => {
    const es = deriveEvents(snap({ rfps: [rfp()], interests: [interest("acme"), interest("crew")] }));
    expect(only(es, "rfp_bids_received")).toEqual([expect.objectContaining({ orgId: "bolt", points: 25, createdAt: "2026-10-02T00:00:00Z" })]);
  });

  it("ignores interest from the poster's own company or a demo company", () => {
    expect(only(deriveEvents(snap({ rfps: [rfp()], interests: [interest("bolt"), interest("demo")] })), "rfp_bids_received")).toEqual([]);
  });

  it("needs an admin-published RFP from a real company", () => {
    for (const r of [rfp({ status: "pending_review", publishedAt: null }), rfp({ status: "rejected" }), rfp({ isDemo: true }), rfp({ orgId: "draft" }), rfp({ sourceType: "public_source" })]) {
      expect(deriveEvents(snap({ rfps: [r], interests: [interest("acme")] })).filter((e) => e.sourceType === "rfp")).toEqual([]);
    }
    // Closed or awarded later still counts.
    expect(only(deriveEvents(snap({ rfps: [rfp({ status: "awarded" })], interests: [interest("acme")] })), "rfp_bids_received")).toHaveLength(1);
  });

  it("credits GC packages for interest and for being posted from a public award", () => {
    const es = deriveEvents(snap({ rfps: [rfp({ sourceType: "gc_package", awardedRfpId: "award1" })], interests: [interest("acme")] }));
    expect(kinds(es.filter((e) => e.sourceType === "rfp"))).toEqual(["bolt:gc_award_package:10", "bolt:gc_package_interest:20"]);
  });
});

describe("sync plan", () => {
  const d = (over: Partial<DesiredEvent> = {}): DesiredEvent => ({ orgId: "acme", userId: null, kind: "profile_approved", points: 20, sourceType: "organization", sourceId: "acme", actorId: "", createdAt: T, ...over });
  const x = (over: Partial<ExistingEvent> = {}): ExistingEvent => ({ id: "e1", orgId: "acme", kind: "profile_approved", points: 20, sourceType: "organization", sourceId: "acme", actorId: "", createdAt: T, reversedAt: null, reversedReason: null, ...over });

  it("inserts new events and is idempotent", () => {
    const plan = planSync([d()], []);
    expect(plan.insert).toHaveLength(1);
    const after = applyPlan([], plan, T);
    expect(planSync([d()], after)).toEqual({ insert: [], reverse: [], restore: [], update: [] });
  });

  it("claws back events whose source is gone, and restores them if it returns", () => {
    const plan = planSync([], [x()]);
    expect(plan.reverse).toEqual([{ id: "e1", orgId: "acme" }]);
    const after = applyPlan([x()], plan, T);
    expect(after[0]).toMatchObject({ reversedAt: T, reversedReason: SYNC_REVERSAL });
    expect(planSync([d()], after).restore).toEqual([{ id: "e1", orgId: "acme", points: 20 }]);
  });

  it("never undoes an admin abuse reversal", () => {
    const plan = planSync([d()], [x({ reversedAt: T, reversedReason: "admin: vote ring" })]);
    expect(plan).toEqual({ insert: [], reverse: [], restore: [], update: [] });
  });

  it("never touches admin adjustments", () => {
    const adj = x({ id: "adj", kind: "admin_adjustment", sourceType: "admin", sourceId: "u1", points: 50 });
    expect(planSync([], [adj])).toEqual({ insert: [], reverse: [], restore: [], update: [] });
  });

  it("updates points when a rating changes", () => {
    const rated = { kind: "forum_thread_rated" as const, sourceType: "forum_thread", sourceId: "t1", actorId: "bob" };
    expect(planSync([d({ ...rated, points: 5 })], [x({ ...rated, points: 10 })]).update).toEqual([{ id: "e1", orgId: "acme", points: 5 }]);
  });

  it("moves an event when the author switches company", () => {
    const plan = planSync([d({ orgId: "bolt" })], [x()]);
    expect(plan.reverse).toHaveLength(1);
    expect(plan.insert[0].orgId).toBe("bolt");
  });

  it("limits a scoped sync to the given companies", () => {
    const plan = planSync([d(), d({ orgId: "bolt", sourceId: "bolt" })], [x({ id: "c", orgId: "crew", sourceId: "crew" })], new Set(["bolt"]));
    expect(plan.insert.map((e) => e.orgId)).toEqual(["bolt"]);
    expect(plan.reverse).toEqual([]);
  });

  it("keys events like the database unique constraint", () => {
    expect(eventKey(d({ actorId: "bob" }))).toBe("acme|profile_approved|organization|acme|bob");
  });

  it("resolves companies for the users a hook knows about", () => {
    expect(orgsForUsers(snap(), ["ann", "bob", "dee", "nobody"]).sort()).toEqual(["acme", "bolt"]);
  });
});
