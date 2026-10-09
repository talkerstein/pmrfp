import { looksLikeSelfReview } from "@/lib/projects/reviews";
import { POINTS, ratingPoints, type KarmaKind } from "./rules";

/**
 * Turn real platform data into the ledger events it should produce. Pure:
 * the sync job (src/lib/karma/sync.ts) loads a snapshot of the source tables
 * and diffs the result against karma_events, so the same code backfills,
 * keeps the ledger current and claws points back when a source disappears.
 *
 * Every rule below is a VERIFIABLE action somebody other than the company
 * confirmed: an admin, a client, a member of another company, a trade that
 * bid. Nothing here counts logins, posts or anything a company does alone.
 */

export interface SnapOrg {
  id: string;
  website: string | null;
  email: string | null;
  profileStatus: string;
  status: string;
  isDemo: boolean;
  verified: boolean;
  createdAt: string;
}

export interface SnapMember {
  userId: string;
  orgId: string;
  email?: string | null;
}

export interface SnapForumProfile {
  userId: string;
  orgId: string | null;
  banned: boolean;
  /** The automatic PMRFP Board profile never earns or gives points. */
  system?: boolean;
}

export interface SnapVote {
  postId: string;
  voterId: string;
  authorId: string;
  postStatus: string;
  threadStatus: string;
  createdAt: string;
}

export interface SnapRating {
  threadId: string;
  raterId: string;
  authorId: string;
  score: number;
  threadStatus: string;
  createdAt: string;
}

export interface SnapAccepted {
  postId: string;
  answerAuthorId: string;
  askerId: string;
  postStatus: string;
  threadStatus: string;
  createdAt: string;
}

export interface SnapRemoved {
  targetType: "thread" | "post";
  targetId: string;
  authorId: string;
  /** When a moderator hid it (the mod log row). */
  createdAt: string;
}

export interface SnapCaseStudy {
  id: string;
  orgId: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface SnapReview {
  id: string;
  orgId: string;
  caseStudyId: string | null;
  status: string;
  verifiedVia: string | null;
  reviewerEmail: string | null;
  reviewerUserId: string | null;
  createdAt: string;
}

export interface SnapRfp {
  id: string;
  orgId: string | null;
  sourceType: string;
  status: string;
  publishedAt: string | null;
  awardedRfpId: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface SnapInterest {
  rfpId: string;
  orgId: string;
  createdAt: string;
}

export interface KarmaSnapshot {
  orgs: SnapOrg[];
  members: SnapMember[];
  forumProfiles: SnapForumProfile[];
  votes: SnapVote[];
  ratings: SnapRating[];
  accepted: SnapAccepted[];
  removed: SnapRemoved[];
  caseStudies: SnapCaseStudy[];
  reviews: SnapReview[];
  rfps: SnapRfp[];
  interests: SnapInterest[];
}

export interface DesiredEvent {
  orgId: string;
  /** The member whose work earned it (null for company-level events). */
  userId: string | null;
  kind: KarmaKind;
  points: number;
  sourceType: string;
  sourceId: string;
  /** Voter / rater / asker. Admin-only column; used for pair caps. */
  actorId: string;
  createdAt: string;
}

/** Unique key, same columns as the karma_events unique constraint. */
export function eventKey(e: { orgId: string; kind: string; sourceType: string; sourceId: string; actorId?: string | null }): string {
  return [e.orgId, e.kind, e.sourceType, e.sourceId, e.actorId ?? ""].join("|");
}

/** Approved, live, real companies earn. Drafts, suspended and demo orgs don't. */
export function isEligibleOrg(o: SnapOrg | undefined): o is SnapOrg {
  return Boolean(o && o.profileStatus === "approved" && o.status === "active" && !o.isDemo);
}

/** RFP statuses that mean "an admin published it at some point". */
const WAS_PUBLISHED = new Set(["published", "closed", "awarded", "expired", "archived"]);

export function deriveEvents(s: KarmaSnapshot): DesiredEvent[] {
  const orgById = new Map(s.orgs.map((o) => [o.id, o]));
  const forumById = new Map(s.forumProfiles.map((p) => [p.userId, p]));
  const membersByUser = new Map<string, string[]>();
  const membersByOrg = new Map<string, SnapMember[]>();
  for (const m of s.members) {
    membersByUser.set(m.userId, [...(membersByUser.get(m.userId) ?? []), m.orgId]);
    membersByOrg.set(m.orgId, [...(membersByOrg.get(m.orgId) ?? []), m]);
  }

  /**
   * The company a member's forum work counts for: the company on their forum
   * profile, else their one approved company. Members of several approved
   * companies with none on their profile credit nobody (ambiguous).
   */
  const orgOfUser = (userId: string): string | null => {
    const fp = forumById.get(userId);
    if (fp?.system) return null;
    if (fp?.orgId && isEligibleOrg(orgById.get(fp.orgId))) return fp.orgId;
    const eligible = (membersByUser.get(userId) ?? []).filter((id) => isEligibleOrg(orgById.get(id)));
    return eligible.length === 1 ? eligible[0] : null;
  };
  /** Any company a user belongs to (eligible or not), for same-company checks. */
  const allOrgsOf = (userId: string): Set<string> => {
    const set = new Set(membersByUser.get(userId) ?? []);
    const fp = forumById.get(userId);
    if (fp?.orgId) set.add(fp.orgId);
    return set;
  };
  /** A peer signal only counts from a different person at a different company. */
  const independent = (actorId: string, authorId: string, authorOrg: string): boolean => {
    if (actorId === authorId) return false;
    const actor = forumById.get(actorId);
    if (!actor || actor.banned || actor.system) return false;
    return !allOrgsOf(actorId).has(authorOrg);
  };

  const out: DesiredEvent[] = [];

  // ── Company verified by PMRFP ─────────────────────────────────────
  for (const o of s.orgs) {
    if (!isEligibleOrg(o)) continue;
    out.push({ orgId: o.id, userId: null, kind: "profile_approved", points: POINTS.profile_approved, sourceType: "organization", sourceId: o.id, actorId: "", createdAt: o.createdAt });
    if (o.verified) out.push({ orgId: o.id, userId: null, kind: "vendor_verified", points: POINTS.vendor_verified, sourceType: "organization", sourceId: o.id, actorId: "", createdAt: o.createdAt });
  }

  // ── Forum: accepted answers, upvotes and ratings from other companies ──
  for (const a of s.accepted) {
    if (a.postStatus !== "approved" || a.threadStatus !== "approved") continue;
    const org = orgOfUser(a.answerAuthorId);
    if (!org || !independent(a.askerId, a.answerAuthorId, org)) continue;
    out.push({ orgId: org, userId: a.answerAuthorId, kind: "forum_accepted_answer", points: POINTS.forum_accepted_answer, sourceType: "forum_post", sourceId: a.postId, actorId: a.askerId, createdAt: a.createdAt });
  }
  for (const v of s.votes) {
    if (v.postStatus !== "approved" || v.threadStatus !== "approved") continue;
    const org = orgOfUser(v.authorId);
    if (!org || !independent(v.voterId, v.authorId, org)) continue;
    out.push({ orgId: org, userId: v.authorId, kind: "forum_answer_upvote", points: POINTS.forum_answer_upvote, sourceType: "forum_post", sourceId: v.postId, actorId: v.voterId, createdAt: v.createdAt });
  }
  for (const r of s.ratings) {
    const pts = ratingPoints(r.score);
    if (!pts || r.threadStatus !== "approved") continue;
    const org = orgOfUser(r.authorId);
    if (!org || !independent(r.raterId, r.authorId, org)) continue;
    out.push({ orgId: org, userId: r.authorId, kind: "forum_thread_rated", points: pts, sourceType: "forum_thread", sourceId: r.threadId, actorId: r.raterId, createdAt: r.createdAt });
  }
  // A moderator removed the member's content: it costs the company.
  for (const x of s.removed) {
    const org = orgOfUser(x.authorId);
    if (!org) continue;
    out.push({ orgId: org, userId: x.authorId, kind: "forum_content_removed", points: POINTS.forum_content_removed, sourceType: `forum_${x.targetType}`, sourceId: x.targetId, actorId: "", createdAt: x.createdAt });
  }

  // ── Projects with a verified client review ───────────────────────────
  const reviewsByProject = new Map<string, SnapReview[]>();
  for (const r of s.reviews) {
    if (!r.caseStudyId || r.status !== "published" || !r.verifiedVia) continue;
    reviewsByProject.set(r.caseStudyId, [...(reviewsByProject.get(r.caseStudyId) ?? []), r]);
  }
  for (const cs of s.caseStudies) {
    const org = orgById.get(cs.orgId);
    if (!isEligibleOrg(org) || cs.status !== "published") continue;
    const members = membersByOrg.get(cs.orgId) ?? [];
    const memberIds = new Set(members.map((m) => m.userId));
    const ok = (reviewsByProject.get(cs.id) ?? [])
      .filter((r) => r.orgId === cs.orgId)
      .filter((r) => !(r.reviewerUserId && memberIds.has(r.reviewerUserId)))
      .filter((r) => !looksLikeSelfReview(r.reviewerEmail, { email: org.email, website: org.website, userEmails: members.map((m) => m.email) }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!ok.length) continue;
    const at = [ok[0].createdAt, cs.publishedAt ?? cs.createdAt].sort().pop()!;
    out.push({ orgId: cs.orgId, userId: null, kind: "project_verified_review", points: POINTS.project_verified_review, sourceType: "case_study", sourceId: cs.id, actorId: "", createdAt: at });
  }

  // ── RFPs and GC packages that drew bids from other companies ─────────
  const interestsByRfp = new Map<string, SnapInterest[]>();
  for (const i of s.interests) interestsByRfp.set(i.rfpId, [...(interestsByRfp.get(i.rfpId) ?? []), i]);
  for (const r of s.rfps) {
    if (!r.orgId || r.isDemo || !r.publishedAt || !WAS_PUBLISHED.has(r.status)) continue;
    if (!isEligibleOrg(orgById.get(r.orgId))) continue;
    const isPackage = r.sourceType === "gc_package";
    if (!isPackage && r.sourceType !== "property_manager_direct") continue;
    const bids = (interestsByRfp.get(r.id) ?? [])
      .filter((i) => i.orgId !== r.orgId)
      .filter((i) => {
        const bidder = orgById.get(i.orgId);
        return Boolean(bidder && !bidder.isDemo && bidder.status === "active");
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (bids.length) {
      out.push({
        orgId: r.orgId,
        userId: null,
        kind: isPackage ? "gc_package_interest" : "rfp_bids_received",
        points: isPackage ? POINTS.gc_package_interest : POINTS.rfp_bids_received,
        sourceType: "rfp",
        sourceId: r.id,
        actorId: "",
        createdAt: bids[0].createdAt,
      });
    }
    // A package posted from a public award (winner page), approved by an admin.
    if (isPackage && r.awardedRfpId) {
      out.push({ orgId: r.orgId, userId: null, kind: "gc_award_package", points: POINTS.gc_award_package, sourceType: "rfp", sourceId: r.id, actorId: "", createdAt: r.publishedAt });
    }
  }

  return out;
}

/**
 * Same company in a member list — resolves the companies a sync should
 * cover when a hook only knows the users involved (a vote's author).
 */
export function orgsForUsers(s: Pick<KarmaSnapshot, "orgs" | "members" | "forumProfiles">, userIds: string[]): string[] {
  const orgById = new Map(s.orgs.map((o) => [o.id, o]));
  const out = new Set<string>();
  for (const u of userIds) {
    const fp = s.forumProfiles.find((p) => p.userId === u);
    if (fp?.orgId && isEligibleOrg(orgById.get(fp.orgId))) out.add(fp.orgId);
    for (const m of s.members) if (m.userId === u && isEligibleOrg(orgById.get(m.orgId))) out.add(m.orgId);
  }
  return [...out];
}

// ── Diff: what the ledger should change ─────────────────────────────

export interface ExistingEvent {
  id: string;
  orgId: string;
  kind: KarmaKind;
  points: number;
  sourceType: string;
  sourceId: string;
  actorId: string;
  createdAt: string;
  reversedAt: string | null;
  reversedReason: string | null;
}

export interface SyncPlan {
  insert: DesiredEvent[];
  /** Source gone or no longer qualifies: clawback (sets reversed_at). */
  reverse: { id: string; orgId: string }[];
  /** Came back after an automatic clawback (e.g. content un-hidden). */
  restore: { id: string; orgId: string; points: number }[];
  /** Same source, different points (a rating changed from 5 to 4 stars). */
  update: { id: string; orgId: string; points: number }[];
}

/** Kinds the sync never touches: only an admin creates or reverses these. */
const MANUAL_KINDS: readonly string[] = ["admin_adjustment", "referral_verified"];

export const SYNC_REVERSAL = "sync: source removed or no longer qualifies";

/**
 * Compare desired events with the ledger. `scope` limits the plan to some
 * companies (an on-demand sync after one action); null plans for everyone.
 * Admin reversals ("admin: …") are never undone here.
 */
export function planSync(desired: DesiredEvent[], existing: ExistingEvent[], scope: Set<string> | null = null): SyncPlan {
  const inScope = (orgId: string) => !scope || scope.has(orgId);
  const want = new Map<string, DesiredEvent>();
  for (const d of desired) if (inScope(d.orgId)) want.set(eventKey(d), d);
  const plan: SyncPlan = { insert: [], reverse: [], restore: [], update: [] };
  for (const e of existing) {
    if (!inScope(e.orgId) || MANUAL_KINDS.includes(e.kind)) continue;
    const key = eventKey(e);
    const d = want.get(key);
    want.delete(key);
    if (!d) {
      if (!e.reversedAt) plan.reverse.push({ id: e.id, orgId: e.orgId });
      continue;
    }
    if (e.reversedAt) {
      if ((e.reversedReason ?? "").startsWith("sync:")) plan.restore.push({ id: e.id, orgId: e.orgId, points: d.points });
      continue;
    }
    if (e.points !== d.points) plan.update.push({ id: e.id, orgId: e.orgId, points: d.points });
  }
  plan.insert = [...want.values()];
  return plan;
}

/** The ledger as it will look after the plan (dry runs and recompute). */
export function applyPlan(existing: ExistingEvent[], plan: SyncPlan, now: string): ExistingEvent[] {
  const rev = new Set(plan.reverse.map((r) => r.id));
  const res = new Map(plan.restore.map((r) => [r.id, r.points]));
  const upd = new Map(plan.update.map((u) => [u.id, u.points]));
  const rows = existing.map((e) => {
    if (rev.has(e.id)) return { ...e, reversedAt: now, reversedReason: SYNC_REVERSAL };
    if (res.has(e.id)) return { ...e, points: res.get(e.id)!, reversedAt: null, reversedReason: null };
    if (upd.has(e.id)) return { ...e, points: upd.get(e.id)! };
    return e;
  });
  plan.insert.forEach((d, i) => rows.push({ ...d, id: `new-${i}`, reversedAt: null, reversedReason: null }));
  return rows;
}
