import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * PMRFP for Towns, Part B2: towns post jobs (auto-publish when verified,
 * review otherwise), responding is always free and never counted, a formal
 * tender mirror takes no responses, the municipal writer's province clause
 * packs, invites (recipients, the daily limit, the flag), Q&A privacy,
 * addenda and the closing date's change history, and who may manage or
 * unpublish a town's job.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  session: null as null | Record<string, unknown>,
  sent: [] as { fn: string; to: string; p: Record<string, unknown> }[],
  followers: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/email/send", () => {
  const spy = (fn: string) => async (to: string, p: Record<string, unknown> = {}) => void h.sent.push({ fn, to, p: typeof p === "object" ? p : { title: p } });
  return {
    sendPmNewInterest: spy("pmNewInterest"),
    sendInterestConfirmation: async (to: string, title: string, p: Record<string, unknown> = {}) => void h.sent.push({ fn: "confirmation", to, p: { title, ...p } }),
    sendAdminNewInterest: async (p: Record<string, unknown>) => void h.sent.push({ fn: "adminNewInterest", to: "admin", p }),
    sendAdminNewRfp: async (p: Record<string, unknown>) => void h.sent.push({ fn: "adminNewRfp", to: "admin", p }),
    sendPmJobAlert: spy("jobAlert"),
    sendTownJobEmail: async (to: string, e: { subject: string; bodyHtml: string; footnote: string }, lang: string, utm: string, unsub?: string | null) =>
      void h.sent.push({ fn: `town:${utm}`, to, p: { ...e, lang, unsub } }),
  };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.db }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => h.session,
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
  requireRole: async (roles: string[]) => {
    const s = h.session as { profile: { primary_role: string } } | null;
    if (!s || !roles.includes(s.profile.primary_role)) throw new Error("REDIRECT:role");
    return s;
  },
}));
vi.mock("@/lib/access/request-session", () => ({ getSessionFromRequest: async () => (h.session ? { session: h.session, db: h.db, via: "cookie" } : null) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => null, rateLimitResponse: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/karma/sync", () => ({ karmaSyncAfter: async () => undefined }));
vi.mock("@/lib/analytics", () => ({ EVENT: { RFP_INTEREST_SUBMITTED: "rfp_interest_submitted" }, trackEvent: async () => undefined }));
vi.mock("@/lib/projects/attach", () => ({ validAttachments: async () => [] }));
vi.mock("@/lib/town-jobs/followers", () => ({ getBuyerFollowerIds: async () => h.followers }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (task: () => unknown) => void task() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { respondDecision } from "@/lib/pm-jobs/rules";
import { respondStateFor } from "@/lib/pm-jobs/server";
import { POST as interestPost } from "@/app/api/rfp-interest/route";
import {
  INVITE_DAILY_MAX,
  askDecision,
  canManageTownJob,
  canPostAsTown,
  canUnpublish,
  cleanInviteEmail,
  dayStartToronto,
  deadlineHistory,
  emailInviteDecision,
  inviteBudget,
  planAddendum,
  planTradeInvites,
  publicQa,
  townCta,
  townInvitesEnabled,
  townLabel,
  townPostStatus,
  townQaEmailsEnabled,
} from "@/lib/town-jobs/rules";
import { parseTownPostFields } from "@/lib/town-jobs/post";
import {
  answerQuestion,
  askQuestion,
  finishTownPost,
  inviteByEmail,
  issueAddendum,
  loadTownJob,
  sendTradeInvites,
  townPageFor,
  unpublishTownJob,
  type TownJob,
} from "@/lib/town-jobs/server";
import { answerEmail, emailInviteEmail, tradeInviteEmail } from "@/lib/town-jobs/email-copy";
import { answerQuestionAction, unpublishTownJobAction } from "@/lib/town-jobs/actions";
import { composeMunicipal } from "@/lib/rfp-writer/municipal/compose";
import { CLAUSES_AS_OF, PACKS, PACK_PROVINCES, localPreferenceAllowed, thresholdCheck } from "@/lib/rfp-writer/municipal/clauses";
import { municipalInputSchema, type MunicipalInput } from "@/lib/rfp-writer/municipal/schema";
import { mergeTownPosts } from "@/lib/town-jobs/merge";
import { createRfpAction } from "@/lib/dashboard/actions";

// ── Fixtures ────────────────────────────────────────────────────────

const NOW = new Date().toISOString();
const CLERK = "u-clerk";
const TOWN = "org-town";
const REGIONS = [
  { id: "ca", name: "Canada", slug: "canada", parent_id: null, province: null, country: "Canada" },
  { id: "on", name: "Ontario", slug: "ontario", parent_id: "ca", province: "Ontario", country: "Canada" },
  { id: "cob", name: "Cobourg", slug: "cobourg", parent_id: "on", province: "Ontario", country: "Canada" },
];

const job = (over: Record<string, unknown> = {}) => ({
  id: "rfq-1",
  title: "Grass cutting 2027",
  slug: "grass-cutting-2027",
  summary: "Three parks, weekly.",
  status: "published",
  source_type: "public_buyer_direct",
  post_kind: "quote_request",
  buyer_key: "ontario/town-of-cobourg",
  buyer_name: "Town of Cobourg",
  official_url: null,
  official_portal: null,
  region_id: "cob",
  city: "Cobourg",
  province: "Ontario",
  deadline: "2099-05-01",
  question_deadline: null,
  posted_by_user_id: CLERK,
  posted_by_organization_id: TOWN,
  poster_lang: "en",
  created_at: NOW,
  published_at: NOW,
  rfp_categories: [{ category_id: "cat-grass", trade_categories: { name: "Landscaping" } }],
  ...over,
});

function baseDb(extra: Record<string, Record<string, unknown>[]> = {}): FakeDb {
  return fakeDb(
    {
      rfp_posts: [
        job(),
        job({ id: "mirror-1", slug: "arena-roof", title: "Arena roof", post_kind: "tender_mirror", official_url: "https://cobourg.bidsandtenders.ca/x", official_portal: "bids&tenders" }),
        job({ id: "pm-1", slug: "pm-job", source_type: "property_manager_direct", post_kind: null, buyer_key: null, posted_by_user_id: "u-pm", posted_by_organization_id: "org-pm" }),
      ],
      regions: REGIONS,
      buyer_pages: [{ buyer_key: "ontario/town-of-cobourg", buyer_name: "Town of Cobourg", province_code: "ON", organization_id: TOWN }],
      buyer_claims: [{ buyer_key: "ontario/town-of-port-hope", buyer_name: "Municipality of Port Hope", province_code: "ON", status: "pending", user_id: "u-porthope", created_at: NOW }],
      organizations: [
        { id: TOWN, name: "Town of Cobourg", organization_type: "public_buyer", status: "active", profile_status: "approved" },
        { id: "org-a", name: "Alpha Lawn", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Cobourg", province: "Ontario", country: "Canada" },
        { id: "org-b", name: "Bravo Grounds", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Port Hope", province: "Ontario", country: "Canada" },
        { id: "org-c", name: "Charlie Mowing", organization_type: "trade_company", status: "active", profile_status: "approved", is_demo: false, city: "Cobourg", province: "Ontario", country: "Canada" },
        { id: "org-new", name: "Newbie Landscaping", organization_type: "trade_company", status: "active", profile_status: "pending_review", is_demo: false, city: "Cobourg", province: "Ontario", country: "Canada" },
      ],
      organization_categories: [
        { organization_id: "org-a", category_id: "cat-grass" },
        { organization_id: "org-b", category_id: "cat-grass" },
        { organization_id: "org-c", category_id: "cat-grass" },
        { organization_id: "org-new", category_id: "cat-grass" },
      ],
      organization_regions: [
        { organization_id: "org-a", region_id: "cob" },
        { organization_id: "org-b", region_id: "on" },
        { organization_id: "org-c", region_id: "cob" },
      ],
      organization_members: [
        { organization_id: TOWN, user_id: CLERK },
        { organization_id: TOWN, user_id: "u-clerk2" },
        { organization_id: "org-a", user_id: "u-a" },
        { organization_id: "org-b", user_id: "u-b-optout" },
        { organization_id: "org-b", user_id: "u-b" },
        { organization_id: "org-c", user_id: "u-c" },
        { organization_id: "org-new", user_id: "u-new" },
      ],
      users_profile: [
        { id: CLERK, email: "clerk@cobourg.ca", status: "active" },
        { id: "u-clerk2", email: "works@cobourg.ca", status: "active" },
        { id: "u-a", email: "owner@alpha.example", status: "active" },
        { id: "u-b-optout", email: "office@bravo.example", status: "active" },
        { id: "u-b", email: "boss@bravo.example", status: "active" },
        { id: "u-c", email: "charlie@charlie.example", status: "active" },
        { id: "u-new", email: "hi@newbie.example", status: "active" },
        { id: "u-member", email: "member@unsub.example", status: "active" },
      ],
      notification_preferences: [
        { user_id: "u-b-optout", new_rfps: "off", channel_email: true },
        { user_id: "u-member", new_rfps: "off", channel_email: true },
      ],
      email_suppressions: [{ email_key: "charlie@charlie.example", reason: "complaint" }],
      subscriptions: [],
      trade_trials: [],
      signup_attribution: [{ user_id: "u-a", lang: "fr" }],
      lead_alert_log: [],
      notifications: [],
      rfp_interests: [],
      town_job_questions: [],
      town_job_addenda: [],
      town_invites: [],
      town_job_log: [],
      trade_categories: [{ id: "cat-grass", slug: "landscaping", name: "Landscaping" }],
      property_types: [],
      rfp_categories: [],
      ...extra,
    },
    {
      unique: {
        rfp_interests: (e, r) => e.rfp_id === r.rfp_id && e.trade_organization_id === r.trade_organization_id,
        town_job_addenda: (e, r) => e.rfp_id === r.rfp_id && e.number === r.number,
        town_invites: (e, r) => e.rfp_id === r.rfp_id && e.email_key === r.email_key,
      },
      defaults: {
        rfp_interests: { status: "submitted", contact_revealed: false, pm_contact_shared: false, created_at: NOW },
        town_job_questions: { status: "open", created_at: NOW },
        town_job_addenda: { created_at: NOW },
        town_invites: { status: "sent", created_at: NOW },
        town_job_log: { created_at: NOW },
      },
    },
  );
}

const town = (over: Record<string, unknown> = {}) => job(over) as unknown as TownJob;
const log = () => h.db.tables.town_job_log.map((l) => l.event);

beforeEach(() => {
  h.sent = [];
  h.session = null;
  h.followers = [];
  h.db = baseDb();
  delete process.env.TOWN_INVITES_ENABLED;
  delete process.env.TOWN_QA_EMAILS_ENABLED;
  delete process.env.PM_JOB_ALERTS_ENABLED;
  process.env.BUSINESS_MAILING_ADDRESS = "123 Example St, Toronto ON M5V 1A1";
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

// ── Posting: auto-publish vs review ─────────────────────────────────

describe("a town posts a job", () => {
  it("a verified town publishes at once; anyone else waits for review", () => {
    expect(townPostStatus({ verified: true })).toBe("published");
    expect(townPostStatus({ verified: false })).toBe("pending_review");
  });

  it("finds the page it posts as: the one it manages (verified), else a pending claim (not verified), else none", async () => {
    expect(await townPageFor(h.db as never, TOWN, CLERK)).toEqual({ buyerKey: "ontario/town-of-cobourg", buyerName: "Town of Cobourg", provinceCode: "ON", verified: true });
    expect(await townPageFor(h.db as never, "org-porthope", "u-porthope")).toMatchObject({ buyerKey: "ontario/town-of-port-hope", verified: false });
    expect(await townPageFor(h.db as never, "org-x", "u-x")).toBeNull();
    expect(canPostAsTown({ role: "public_buyer", organizationType: "public_buyer", hasPage: true })).toBe(true);
    expect(canPostAsTown({ role: "property_manager", organizationType: "property_manager", hasPage: true })).toBe(false);
    expect(canPostAsTown({ role: "public_buyer", organizationType: "public_buyer", hasPage: false })).toBe(false);
  });

  const finish = (verified: boolean, followers: string[] = []) => {
    h.followers = followers;
    h.db.tables.rfp_posts.push(job({ id: "new-1", slug: "new-1", status: "pending_review", published_at: null }));
    const scheduled: (() => Promise<void>)[] = [];
    return finishTownPost(h.db as never, {
      rfpId: "new-1",
      page: { buyerKey: "ontario/town-of-cobourg", buyerName: "Town of Cobourg", provinceCode: "ON", verified },
      organizationId: TOWN,
      actorUserId: CLERK,
      title: "Grass cutting 2027",
      slug: "new-1",
      postKind: "quote_request",
      postedBy: "Town of Cobourg",
      region: "cobourg",
      categories: "landscaping",
      schedule: (task) => void scheduled.push(task),
    }).then((r) => ({ r, scheduled }));
  };

  it("verified: live now, logged, followers told in-app, PMRFP gets an FYI (no review); alerts follow the flag", async () => {
    const { r, scheduled } = await finish(true, ["u-follower"]);
    expect(r.status).toBe("published");
    expect(r.alerts).toBe("off");
    expect(scheduled).toHaveLength(0);
    expect(h.db.tables.rfp_posts.find((x) => x.id === "new-1")).toMatchObject({ status: "published" });
    expect(log()).toEqual(["posted", "published"]);
    expect(h.db.tables.town_job_log[1].detail).toEqual({ auto: true });
    expect(h.db.tables.notifications).toEqual([expect.objectContaining({ user_id: "u-follower", type: "town_new_job", link_url: "/rfps/new-1" })]);
    expect(h.sent.find((s) => s.fn === "adminNewRfp")?.p).toMatchObject({ autoPublished: true, kind: "public_buyer_direct" });
  });

  it("verified with alerts on: the same-day alerts are scheduled after the response", async () => {
    process.env.PM_JOB_ALERTS_ENABLED = "1";
    const { r, scheduled } = await finish(true);
    expect(r).toMatchObject({ status: "published", alerts: "on" });
    expect(r.wouldEmail).toBeGreaterThan(0);
    expect(scheduled).toHaveLength(1);
  });

  it("not verified: waits for review, PMRFP is asked to review it", async () => {
    const { r } = await finish(false);
    expect(r).toEqual({ status: "pending_review", alerts: "none", wouldEmail: 0 });
    expect(h.db.tables.rfp_posts.find((x) => x.id === "new-1")).toMatchObject({ status: "pending_review" });
    expect(log()).toEqual(["posted", "sent_to_review"]);
    expect(h.sent.find((s) => s.fn === "adminNewRfp")?.p).not.toHaveProperty("autoPublished");
  });

  const postForm = (o: Record<string, string>) => {
    const f = new FormData();
    const base: Record<string, string> = {
      lang: "en",
      postKind: "quote_request",
      title: "Grass cutting at three parks",
      summary: "Weekly cuts, May to October.",
      scope: "Cut, trim and blow clean Memorial Park, the cemetery and the town hall lawn.",
      regionSlug: "cobourg",
      city: "Cobourg",
      province: "Ontario",
      deadline: "2099-05-01",
      contactVisibility: "pmrfp_mediated",
      acceptTerms: "on",
      ...o,
    };
    for (const [k, v] of Object.entries(base)) f.set(k, v);
    f.append("categories", "landscaping");
    return f;
  };
  const clerk = () => ({ userId: CLERK, profile: { email: "clerk@cobourg.ca", primary_role: "public_buyer" }, organization: { id: TOWN, name: "Town of Cobourg", organization_type: "public_buyer" }, hasTradeAccess: false });

  it("the PM job flow's own post action, as a verified town: a public buyer's job, live at once, back to the town's dashboard", async () => {
    h.session = clerk();
    await expect(createRfpAction({}, postForm({ questionDeadline: "2099-04-25" }))).rejects.toThrow(/REDIRECT:\/buyer-dashboard\/jobs\/.+\?posted=live&alerts=off/);
    const row = h.db.tables.rfp_posts.find((r) => r.title === "Grass cutting at three parks")!;
    expect(row).toMatchObject({
      source_type: "public_buyer_direct",
      post_kind: "quote_request",
      buyer_key: "ontario/town-of-cobourg",
      buyer_name: "Town of Cobourg",
      question_deadline: "2099-04-25",
      posted_by_organization_id: TOWN,
      status: "published",
    });
    expect(h.db.tables.rfp_categories).toEqual([expect.objectContaining({ rfp_id: row.id, category_id: "cat-grass" })]);
  });

  it("a formal tender mirror needs its official link, and its summary stands in for the scope", async () => {
    h.session = clerk();
    expect(await createRfpAction({}, postForm({ postKind: "tender_mirror", scope: "" }))).toEqual({ error: "Add the full link to the official posting (https://…)." });
    await expect(createRfpAction({}, postForm({ postKind: "tender_mirror", scope: "", officialUrl: "https://cobourg.bidsandtenders.ca/t/1", officialPortal: "bids&tenders", title: "Arena roof" }))).rejects.toThrow(/REDIRECT/);
    expect(h.db.tables.rfp_posts.find((r) => r.title === "Arena roof" && r.id !== "mirror-1")).toMatchObject({ post_kind: "tender_mirror", scope: "Weekly cuts, May to October.", official_url: "https://cobourg.bidsandtenders.ca/t/1" });
  });

  it("a public buyer without a page is asked to claim one first", async () => {
    h.session = { ...clerk(), userId: "u-nobody", organization: { id: "org-nobody", name: "Somewhere", organization_type: "public_buyer" } };
    expect(await createRfpAction({}, postForm({}))).toEqual({ error: "Claim your town's page first: posts go out under its name." });
  });

  it("lists a town's own live posts first on its page (and so its widget), skipping closed ones", () => {
    const pages = [
      { provinceSlug: "ontario", buyer: { slug: "town-of-cobourg" }, openBids: [{ slug: "imported", title: "Imported tender", deadline: "2099-03-01" }] },
      { provinceSlug: "ontario", buyer: { slug: "town-of-port-hope" }, openBids: [] },
    ];
    const out = mergeTownPosts(
      pages,
      [
        { slug: "rfq", title: "Grass", deadline: "2099-05-01", buyer_key: "ontario/town-of-cobourg", status: "published" },
        { slug: "old", title: "Old", deadline: "2000-01-01", buyer_key: "ontario/town-of-cobourg", status: "published" },
      ],
      "2026-10-21",
    );
    expect(out[0].openBids.map((b) => b.slug)).toEqual(["rfq", "imported"]);
    expect(out[1]).toBe(pages[1]);
  });

  it("reads the post form's town fields: a mirror needs its official link; questions close by the closing date", () => {
    const fd = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) f.set(k, v);
      return f;
    };
    expect(parseTownPostFields(fd({ postKind: "sealed_box" }), "2099-05-01")).toEqual({ ok: false, error: "kind" });
    expect(parseTownPostFields(fd({ postKind: "tender_mirror" }), "2099-05-01")).toEqual({ ok: false, error: "url" });
    expect(parseTownPostFields(fd({ postKind: "tender_mirror", officialUrl: "javascript:alert(1)" }), "2099-05-01")).toEqual({ ok: false, error: "url" });
    expect(parseTownPostFields(fd({ postKind: "tender_mirror", officialUrl: "https://apc.example/1", officialPortal: "APC", questionDeadline: "2099-04-01" }), "2099-05-01")).toEqual({
      ok: true,
      fields: { postKind: "tender_mirror", officialUrl: "https://apc.example/1", officialPortal: "APC", questionDeadline: null },
    });
    expect(parseTownPostFields(fd({ postKind: "quote_request", questionDeadline: "2099-06-01" }), "2099-05-01")).toEqual({ ok: false, error: "question_deadline" });
    expect(parseTownPostFields(fd({ postKind: "quote_request", questionDeadline: "2099-04-20" }), "2099-05-01")).toMatchObject({ ok: true, fields: { questionDeadline: "2099-04-20", officialUrl: null } });
  });

  it("labels the listing: posted by the town (verified), or the official tender's portal", () => {
    expect(townLabel({ buyer_name: "Town of Cobourg", verified: true, post_kind: "quote_request", official_url: null, official_portal: null })).toEqual({ kind: "posted", buyer: "Town of Cobourg", verified: true });
    expect(townLabel({ buyer_name: "Town of Cobourg", verified: false, post_kind: "quote_request", official_url: null, official_portal: null })).toMatchObject({ verified: false });
    expect(townLabel({ buyer_name: "Town of Cobourg", verified: true, post_kind: "tender_mirror", official_url: "https://x.example", official_portal: "bids&tenders" })).toEqual({
      kind: "official",
      buyer: "Town of Cobourg",
      portal: "bids&tenders",
      url: "https://x.example",
    });
  });
});

// ── Responding: always free, never counted ──────────────────────────

describe("responding to a town's job", () => {
  const org = { id: "org-new", organization_type: "trade_company", status: "active", profile_status: "pending_review" };
  const rfq = { status: "published", source_type: "public_buyer_direct", post_kind: "quote_request", posted_by_user_id: CLERK, posted_by_organization_id: TOWN };

  it("is free for every trade (approved or not), never uses the allowance, even after 3 this month", () => {
    expect(respondDecision({ signedIn: true, org, pro: false, rfp: rfq, userId: "u-new", usedThisMonth: 3 })).toEqual({ refusal: null, free: false });
    expect(respondDecision({ signedIn: true, org: { ...org, profile_status: "approved" }, pro: false, rfp: rfq, userId: "u-new", usedThisMonth: 99 })).toEqual({ refusal: null, free: false });
    // A property manager's job still counts.
    expect(respondDecision({ signedIn: true, org: { ...org, profile_status: "approved" }, pro: false, rfp: { ...rfq, source_type: "property_manager_direct" }, userId: "u-new", usedThisMonth: 3 }).refusal).toBe("limit");
    // Still not for a suspended company, the town itself, or a non-trade.
    expect(respondDecision({ signedIn: true, org: { ...org, status: "suspended" }, pro: false, rfp: rfq, usedThisMonth: 0 }).refusal).toBe("suspended");
    expect(respondDecision({ signedIn: true, org: { ...org, id: TOWN }, pro: false, rfp: rfq, usedThisMonth: 0 }).refusal).toBe("own_job");
    expect(respondDecision({ signedIn: true, org: { ...org, organization_type: "public_buyer" }, pro: false, rfp: rfq, usedThisMonth: 0 }).refusal).toBe("role");
  });

  it("through the API: a free account out of free responses still responds, and the row never counts", async () => {
    h.db.tables.rfp_interests.push(
      { id: "i1", rfp_id: "x1", trade_organization_id: "org-a", used_free_allowance: true, created_at: NOW },
      { id: "i2", rfp_id: "x2", trade_organization_id: "org-a", used_free_allowance: true, created_at: NOW },
      { id: "i3", rfp_id: "x3", trade_organization_id: "org-a", used_free_allowance: true, created_at: NOW },
    );
    h.session = { userId: "u-a", profile: { email: "owner@alpha.example", primary_role: "trade" }, organization: h.db.tables.organizations.find((o) => o.id === "org-a"), hasTradeAccess: false };
    const res = await interestPost(new Request("http://localhost/api/rfp-interest", { method: "POST", body: JSON.stringify({ rfpId: "rfq-1", message: "We cut grass.", acceptDisclaimer: true, lang: "en" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, allowance: { unlimited: true } });
    expect(h.db.tables.rfp_interests.find((r) => r.rfp_id === "rfq-1")).toMatchObject({ used_free_allowance: false, trade_organization_id: "org-a" });
    // The town hears about it on its own dashboard.
    expect(h.db.tables.notifications.find((n) => n.user_id === CLERK)).toMatchObject({ link_url: "/buyer-dashboard/jobs/rfq-1/responses" });
    expect(h.sent.find((s) => s.fn === "pmNewInterest")?.p).toMatchObject({ posterKind: "town" });
  });

  it("the listing's respond box shows no allowance counter for a town's job", async () => {
    const org = h.db.tables.organizations.find((o) => o.id === "org-new") as { id: string; organization_type: string; status: string; profile_status: string };
    const state = await respondStateFor(h.db as never, "grass-cutting-2027", { userId: "u-new", pro: false, org });
    expect(state).toMatchObject({ refusal: null, free: false, town: true, allowance: { unlimited: true } });
  });
});

describe("a formal tender mirror has no response form", () => {
  it("refuses responses (rule, listing box, API) and sends bidders to the official portal", async () => {
    const rfp = { status: "published", source_type: "public_buyer_direct", post_kind: "tender_mirror", posted_by_user_id: CLERK, posted_by_organization_id: TOWN };
    const org = { id: "org-a", organization_type: "trade_company", status: "active", profile_status: "approved" };
    expect(respondDecision({ signedIn: true, org, pro: true, rfp, usedThisMonth: 0 }).refusal).toBe("official_portal");
    expect(townCta({ post_kind: "tender_mirror", status: "published", deadline: "2099-01-01" })).toBe("official");
    expect(townCta({ post_kind: "quote_request", status: "published", deadline: "2099-01-01" })).toBe("respond");
    expect(townCta({ post_kind: "quote_request", status: "published", deadline: "2000-01-01" })).toBe("closed");
    const state = await respondStateFor(h.db as never, "arena-roof", { userId: "u-a", pro: false, org });
    expect(state?.refusal).toBe("official_portal");

    h.session = { userId: "u-a", profile: { email: "owner@alpha.example", primary_role: "trade" }, organization: org, hasTradeAccess: true };
    const res = await interestPost(new Request("http://localhost/api/rfp-interest", { method: "POST", body: JSON.stringify({ rfpId: "mirror-1", message: "Our bid", acceptDisclaimer: true }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: "official_portal" });
    expect(h.db.tables.rfp_interests).toEqual([]);
  });

  it("takes no questions either (they go through the official portal)", () => {
    const base = { source_type: "public_buyer_direct", status: "published", deadline: "2099-01-01", question_deadline: null, posted_by_user_id: CLERK, posted_by_organization_id: TOWN };
    expect(askDecision({ signedIn: true, job: { ...base, post_kind: "tender_mirror" }, userId: "u-a", organizationId: "org-a" })).toBe("mirror");
  });
});

// ── The municipal writer's clause packs ─────────────────────────────

describe("municipal writer: clause packs by province", () => {
  const input = (over: Partial<MunicipalInput>): MunicipalInput =>
    municipalInputSchema.parse({
      template: "facility-services",
      services: ["grass-cutting", "snow"],
      buyerName: "Town of Cobourg",
      province: "ON",
      description: "Weekly grass cutting at three parks, and snow clearing at the town hall lot.",
      bidDeadline: "2099-05-01",
      lang: "en",
      ...over,
    });
  const all = (d: { scope: string; requirements: string; submissionInstructions: string }) => `${d.scope}\n${d.requirements}\n${d.submissionInstructions}`;

  it("dates every pack in one place and covers the ten provinces in three languages", () => {
    expect(CLAUSES_AS_OF).toBe("2026-10");
    expect(PACK_PROVINCES).toHaveLength(10);
    for (const p of PACK_PROVINCES) {
      for (const l of ["en", "fr", "es"] as const) expect(PACKS[p].workersComp[l].length).toBeGreaterThan(20);
    }
    const d = composeMunicipal(input({}));
    expect(d.clausesAsOf).toBe("2026-10");
    expect(d.submissionInstructions).toContain("Clauses current as of 2026-10.");
  });

  it("Ontario: WSIB, AODA, the by-law blank, insurance as a [Confirm] default, and never a local preference", () => {
    const d = composeMunicipal(input({}));
    expect(d.lang).toBe("en");
    expect(d.requirements).toMatch(/WSIB clearance certificate/);
    expect(d.requirements).toMatch(/AODA/);
    expect(d.requirements).toMatch(/\$2,000,000 per occurrence \[Confirm: amount\]/);
    expect(d.submissionInstructions).toMatch(/purchasing by-law \[Confirm: by-law number and section\]/);
    expect(all(d)).not.toMatch(/local preference/i);
    // Asking for one in Ontario is refused, and the writer says so.
    const asked = composeMunicipal(input({ localPreference: true }));
    expect(all(asked)).not.toMatch(/local preference/i);
    expect(asked.localPreferenceRefused).toBe(true);
    expect(localPreferenceAllowed("ON")).toBe(false);
  });

  it("Ontario construction: the Construction Act's prompt payment, the contract form as a blank", () => {
    const d = composeMunicipal(input({ template: "small-works", services: undefined, projectName: "Arena lobby roof", insurance: 5_000_000 }));
    expect(d.submissionInstructions).toMatch(/Construction Act/);
    expect(d.submissionInstructions).toMatch(/28 days/);
    expect(d.submissionInstructions).toMatch(/\[Confirm: contract form, e\.g\. OPS General Conditions of Contract or CCDC 2/);
    expect(d.requirements).toMatch(/constructor/);
    expect(d.requirements).toMatch(/\$5,000,000/);
  });

  it("no local preference by default anywhere; elsewhere only when asked, with the threshold rule", () => {
    for (const p of PACK_PROVINCES) expect(all(composeMunicipal(input({ province: p, lang: "en" })))).not.toMatch(/local preference|préférence locale/i);
    const ab = composeMunicipal(input({ province: "AB", localPreference: true }));
    expect(ab.submissionInstructions).toMatch(/Local preference: only where the Town's purchasing policy allows it/);
    expect(ab.submissionInstructions).toMatch(/NWPTA: \$75,000 for goods and services, \$200,000 for construction/);
    const ns = composeMunicipal(input({ province: "NS", localPreference: true }));
    expect(ns.submissionInstructions).toMatch(/CFTA: \$139,000 for goods and services, \$347,400 for construction/);
  });

  it("Quebec: written in French, CNESST, and an RBQ licence for construction (not for grass cutting)", () => {
    const works = composeMunicipal(input({ province: "QC", template: "small-works", services: undefined, projectName: "Toiture de l'aréna" }));
    expect(works.lang).toBe("fr");
    expect(works.requirements).toMatch(/RBQ/);
    expect(works.requirements).toMatch(/CNESST/);
    expect(works.title).toMatch(/^Demande de prix/);
    const grass = composeMunicipal(input({ province: "QC" }));
    expect(grass.lang).toBe("fr");
    expect(grass.requirements).toMatch(/CNESST/);
    expect(grass.requirements).not.toMatch(/RBQ/);
  });

  it("each province's own workers' compensation board", () => {
    const wc = (p: MunicipalInput["province"]) => composeMunicipal(input({ province: p })).requirements;
    expect(wc("BC")).toMatch(/WorkSafeBC/);
    expect(wc("AB")).toMatch(/WCB-Alberta/);
    expect(wc("MB")).toMatch(/WCB Manitoba/);
    expect(wc("SK")).toMatch(/WCB Saskatchewan/);
    expect(wc("NS")).toMatch(/WCB Nova Scotia/);
    expect(wc("NB")).toMatch(/WorkSafeNB/);
    expect(wc("PE")).toMatch(/WCB PEI/);
    expect(wc("NL")).toMatch(/WorkplaceNL/);
    expect(wc("YT")).toMatch(/\[Confirm: clearance from the territory/);
  });

  it("New Brunswick can issue it in both English and French", () => {
    const d = composeMunicipal(input({ province: "NB", bilingual: true }));
    expect(d.bilingual).toBe(true);
    expect(d.scope).toContain("— Version française —");
    expect(d.submissionInstructions).toMatch(/Bids may be submitted in English or French/);
    expect(d.submissionInstructions).toMatch(/présentées en français ou en anglais/);
    expect(composeMunicipal(input({ province: "ON", bilingual: true })).bilingual).toBe(false);
  });

  it("keeps #170's rules: no invented facts, [Confirm] blanks, the buyer's words once", () => {
    const d = composeMunicipal(input({}));
    expect(d.scope).toMatch(/\[Confirm: site access details\]/);
    expect(d.scope).toMatch(/\[Confirm: buildings, parks, lots or roads covered\]/);
    expect(d.summary).not.toContain("Weekly grass cutting at three parks");
    expect(d.scope.match(/Weekly grass cutting at three parks/g)).toHaveLength(1);
  });

  it("warns above a trade-agreement threshold (PMRFP can then only mirror it)", () => {
    expect(thresholdCheck("AB", 250_000, "construction")).toMatchObject({ over: true, agreement: "NWPTA", threshold: 200_000, system: "Alberta Purchasing Connection (APC)" });
    expect(thresholdCheck("ON", 50_000, "goodsServices")).toMatchObject({ over: false });
    expect(thresholdCheck("ON", 150_000, "goodsServices")).toMatchObject({ over: true, agreement: "CFTA", threshold: 139_000, system: null });
    expect(composeMunicipal(input({ province: "BC", estimatedValue: 90_000 })).threshold.over).toBe(true);
  });
});

// ── Invites ─────────────────────────────────────────────────────────

describe("invites: recipients, the daily limit and the flag", () => {
  it("one person a matching company, skipping the invited, the unsubscribed and the do-not-contact list", () => {
    const plan = planTradeInvites({
      candidates: [
        { orgId: "a", orgName: "A", city: null, people: [{ userId: "a1", email: "a@x.ca" }] },
        { orgId: "b", orgName: "B", city: null, people: [{ userId: "b-off", email: "off@b.ca" }, { userId: "b2", email: "B2@b.ca" }] },
        { orgId: "c", orgName: "C", city: null, people: [{ userId: "c1", email: "c@c.ca" }] },
        { orgId: "d", orgName: "D", city: null, people: [{ userId: "d1", email: null }] },
        { orgId: "e", orgName: "E", city: null, people: [{ userId: "e1", email: "e@e.ca" }] },
        { orgId: "f", orgName: "F", city: null, people: [{ userId: "f1", email: "f@f.ca" }] },
      ],
      alreadyOrgIds: new Set(["a"]),
      alreadyEmails: new Set(),
      optedOutUserIds: new Set(["b-off"]),
      suppressedEmails: new Set(["c@c.ca"]),
      budget: 1,
    });
    expect(plan.send).toEqual([{ orgId: "b", orgName: "B", city: null, userId: "b2", email: "b2@b.ca" }]);
    expect(plan.overLimit.map((x) => x.orgId)).toEqual(["e", "f"]);
    expect(plan.skipped).toEqual({ already: 1, unsubscribed: 1, noEmail: 1 });
  });

  it("50 a town a day (Toronto), off by default", () => {
    expect(INVITE_DAILY_MAX).toBe(50);
    expect(inviteBudget(48)).toBe(2);
    expect(inviteBudget(60)).toBe(0);
    expect(townInvitesEnabled(undefined)).toBe(false);
    expect(townInvitesEnabled("1")).toBe(true);
    expect(townQaEmailsEnabled(undefined)).toBe(false);
    expect(dayStartToronto(new Date("2026-10-21T03:30:00Z"))).toBe("2026-10-20T04:00:00.000Z");
    expect(dayStartToronto(new Date("2026-12-15T12:00:00Z"))).toBe("2026-12-15T05:00:00.000Z");
  });

  it("flag off: nothing is sent or recorded, the town sees how many would be, and it's logged", async () => {
    const res = await sendTradeInvites(h.db as never, town(), CLERK);
    // Alpha (Cobourg), Bravo (Ontario-wide; its opted-out person skipped for the other); Charlie is on the do-not-contact list; Newbie isn't approved.
    expect(res).toEqual({ state: "off", wouldSend: 2, sent: 0, overLimit: 0 });
    expect(h.db.tables.town_invites).toEqual([]);
    expect(h.sent).toEqual([]);
    expect(log()).toEqual(["invites_off"]);
  });

  it("flag on: invites go out, recorded, with the CASL footer; past today's limit the rest wait", async () => {
    process.env.TOWN_INVITES_ENABLED = "1";
    for (let i = 0; i < 49; i++) h.db.tables.town_invites.push({ id: `old-${i}`, rfp_id: "other", organization_id: TOWN, kind: "email", email_key: `x${i}@y.ca`, status: "sent", created_at: NOW });
    const res = await sendTradeInvites(h.db as never, town(), CLERK);
    expect(res).toMatchObject({ state: "sent", sent: 1, overLimit: 1 });
    const mine = h.db.tables.town_invites.filter((i) => i.rfp_id === "rfq-1");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "trade", organization_id: TOWN, buyer_key: "ontario/town-of-cobourg" });
    const mail = h.sent.find((s) => s.fn === "town:town-invite")!;
    expect(mail.p.footnote).toMatch(/123 Example St/);
    expect(String(mail.p.unsub)).toMatch(/\/api\/email\/unsubscribe\?u=/);
    expect(log()).toEqual(["invites_sent"]);
  });

  it("flag on without a mailing address: blocked (CASL)", async () => {
    process.env.TOWN_INVITES_ENABLED = "1";
    delete process.env.BUSINESS_MAILING_ADDRESS;
    expect(await sendTradeInvites(h.db as never, town(), CLERK)).toMatchObject({ state: "blocked", reason: "mailing_address", sent: 0 });
  });

  it("by email: valid, not already invited, not unsubscribed, within the limit; off by default", async () => {
    expect(cleanInviteEmail(" Office@Local-Roofing.ca ")).toBe("office@local-roofing.ca");
    expect(cleanInviteEmail("not an email")).toBeNull();
    expect(emailInviteDecision({ email: null, alreadyEmails: new Set(), suppressed: false, optedOutUser: false, budget: 5 })).toBe("email");
    expect(emailInviteDecision({ email: "a@b.ca", alreadyEmails: new Set(["a@b.ca"]), suppressed: false, optedOutUser: false, budget: 5 })).toBe("already");
    expect(emailInviteDecision({ email: "a@b.ca", alreadyEmails: new Set(), suppressed: true, optedOutUser: false, budget: 5 })).toBe("unsubscribed");
    expect(emailInviteDecision({ email: "a@b.ca", alreadyEmails: new Set(), suppressed: false, optedOutUser: false, budget: 0 })).toBe("limit");

    expect(await inviteByEmail(h.db as never, town(), CLERK, "charlie@charlie.example", "en")).toEqual({ state: "refused", reason: "unsubscribed" });
    expect(await inviteByEmail(h.db as never, town(), CLERK, "member@unsub.example", "en")).toEqual({ state: "refused", reason: "unsubscribed" });
    expect(await inviteByEmail(h.db as never, town(), CLERK, "new@roofer.example", "en")).toEqual({ state: "off" });
    expect(h.db.tables.town_invites).toEqual([]);

    process.env.TOWN_INVITES_ENABLED = "1";
    expect(await inviteByEmail(h.db as never, town(), CLERK, "new@roofer.example", "fr")).toEqual({ state: "sent" });
    const mail = h.sent.find((s) => s.fn === "town:town-invite-email")!;
    expect(mail.to).toBe("new@roofer.example");
    // Not on PMRFP: the unsubscribe link names the invitation, never the address.
    expect(String(mail.p.unsub)).toMatch(/\/api\/email\/invite-unsubscribe\?i=/);
    expect(String(mail.p.unsub)).not.toContain("roofer");
    expect(await inviteByEmail(h.db as never, town(), CLERK, "NEW@roofer.example", "en")).toEqual({ state: "refused", reason: "already" });
  });

  it("the invitation emails: CASL footer, and a free sign-up that returns to the job", () => {
    const base = { base: "https://pmrfp.com", buyer: "Town of Cobourg", title: "Grass <cutting>", slug: "grass-cutting-2027", deadline: "2099-05-01", summary: null, mirror: false, portal: null, unsubscribeUrl: "https://pmrfp.com/u", mailingAddress: "123 Example St" };
    const toTrade = tradeInviteEmail("en", { ...base, company: "Alpha Lawn" });
    expect(toTrade.subject).toBe("Town of Cobourg invites you to quote: Grass <cutting>");
    expect(toTrade.bodyHtml).toContain("Grass &lt;cutting&gt;");
    expect(toTrade.footnote).toMatch(/123 Example St/);
    expect(toTrade.footnote).toContain("https://pmrfp.com/u");
    const byEmail = emailInviteEmail("fr", base);
    expect(byEmail.bodyHtml).toContain("https://pmrfp.com/fr/sign-up?role=trade&amp;next=".replace("&amp;", "&"));
    expect(byEmail.bodyHtml).toContain(encodeURIComponent("/fr/rfps/grass-cutting-2027"));
    expect(byEmail.footnote).toMatch(/Ne plus m'envoyer d'invitations/);
  });
});

// ── Questions and answers ───────────────────────────────────────────

describe("questions: asked privately, answered once, published without the asker", () => {
  it("who may ask, and until when", () => {
    const base = { source_type: "public_buyer_direct", post_kind: "quote_request", status: "published", deadline: "2099-05-01", question_deadline: "2099-04-20", posted_by_user_id: CLERK, posted_by_organization_id: TOWN };
    expect(askDecision({ signedIn: false, job: base })).toBe("signin");
    expect(askDecision({ signedIn: true, job: base, userId: "u-a", organizationId: "org-a", today: "2099-04-20" })).toBeNull();
    expect(askDecision({ signedIn: true, job: base, userId: "u-a", organizationId: "org-a", today: "2099-04-21" })).toBe("deadline");
    expect(askDecision({ signedIn: true, job: base, userId: "u-clerk2", organizationId: TOWN, today: "2099-04-01" })).toBe("own_job");
    expect(askDecision({ signedIn: true, job: { ...base, source_type: "property_manager_direct" }, userId: "u-a" })).toBe("not_town_job");
  });

  it("the public Q&A carries only the question (town's wording), the answer and when", () => {
    const qa = publicQa([
      { id: "q1", question: "Hi, Bob from Alpha Lawn here: is the WSIB letter needed now?", public_question: "Is the WSIB letter needed with the quote?", answer: "Yes.", answered_at: "2099-04-02T10:00:00Z", status: "answered", asker_user_id: "u-a", asker_organization_id: "org-a" },
      { id: "q2", question: "Unanswered one", status: "open", asker_user_id: "u-b" },
    ]);
    expect(qa).toEqual([{ id: "q1", question: "Is the WSIB letter needed with the quote?", answer: "Yes.", answeredAt: "2099-04-02T10:00:00Z" }]);
    expect(JSON.stringify(qa)).not.toMatch(/Bob|Alpha|u-a|org-a/);
  });

  it("ask → the town is told; answer once → published, everyone engaged notified, emails gated", async () => {
    h.db.tables.rfp_interests.push({ id: "r1", rfp_id: "rfq-1", trade_organization_id: "org-c", submitted_by_user_id: "u-c", status: "submitted" });
    h.followers = ["u-b-optout", "u-clerk2"];
    const asked = await askQuestion(h.db as never, { job: town(), userId: "u-a", organizationId: "org-a", question: "Hi, Bob from Alpha Lawn: is the WSIB letter needed now?", lang: "en" });
    expect(asked.ok).toBe(true);
    expect(h.db.tables.notifications.find((n) => n.user_id === CLERK)).toMatchObject({ type: "town_question" });
    const qid = (asked as { id: string }).id;

    const first = await answerQuestion(h.db as never, { job: town(), questionId: qid, answer: "Yes, with your quote.", publicQuestion: "Is the WSIB letter needed with the quote?", actorUserId: CLERK });
    expect(first.ok).toBe(true);
    const b = (first as { broadcast: { notified: number; emailed: number; wouldEmail: number; emailsOn: boolean } }).broadcast;
    // Asker (u-a) + responder (u-c) + follower (u-b-optout); never the town's own people.
    expect(b).toEqual({ notified: 3, emailed: 0, wouldEmail: 1, emailsOn: false });
    const told = h.db.tables.notifications.filter((n) => n.type === "town_answer").map((n) => n.user_id).sort();
    expect(told).toEqual(["u-a", "u-b-optout", "u-c"]);
    expect(h.sent.filter((s) => s.fn.startsWith("town:town-answer"))).toEqual([]);
    expect(h.db.tables.town_job_questions[0]).toMatchObject({ status: "answered", public_question: "Is the WSIB letter needed with the quote?" });

    const again = await answerQuestion(h.db as never, { job: town(), questionId: qid, answer: "Changed my mind", publicQuestion: "", actorUserId: CLERK });
    expect(again).toEqual({ ok: false, error: "answered" });
    expect(log()).toEqual(["question_asked", "question_answered", "broadcast"]);
  });

  it("with answer emails on: only those not unsubscribed or on the do-not-contact list, and never the asker's name", async () => {
    process.env.TOWN_QA_EMAILS_ENABLED = "1";
    h.db.tables.rfp_interests.push({ id: "r1", rfp_id: "rfq-1", trade_organization_id: "org-c", submitted_by_user_id: "u-c", status: "submitted" });
    h.db.tables.town_job_questions.push({ id: "q1", rfp_id: "rfq-1", asker_user_id: "u-a", asker_organization_id: "org-a", question: "Bob from Alpha Lawn asks: WSIB now?", status: "open", created_at: NOW });
    const res = await answerQuestion(h.db as never, { job: town(), questionId: "q1", answer: "Yes.", publicQuestion: "Is the WSIB letter needed now?", actorUserId: CLERK });
    expect(res.ok).toBe(true);
    const mails = h.sent.filter((s) => s.fn === "town:town-answer");
    // u-a gets it (in French, their language); u-c is on the do-not-contact list.
    expect(mails.map((m) => m.to)).toEqual(["owner@alpha.example"]);
    expect(mails[0].p.lang).toBe("fr");
    expect(JSON.stringify(mails)).not.toMatch(/Bob|Alpha Lawn/);
    const e = answerEmail("en", { base: "https://pmrfp.com", buyer: "Town of Cobourg", title: "T", slug: "t", question: "Q?", answer: "A.", unsubscribeUrl: null, mailingAddress: null });
    expect(e.bodyHtml).toContain("who asked is never shown");
  });

  it("only the town (or PMRFP) answers: another company's member is refused", async () => {
    h.db.tables.town_job_questions.push({ id: "q1", rfp_id: "rfq-1", question: "Q?", status: "open", created_at: NOW });
    h.session = { userId: "u-a", profile: { primary_role: "trade" }, organization: { id: "org-a" } };
    const fd = new FormData();
    fd.set("rfpId", "rfq-1");
    fd.set("questionId", "q1");
    fd.set("answer", "Sneaky answer");
    expect(await answerQuestionAction({}, fd)).toEqual({ error: "not_owner" });
    expect(h.db.tables.town_job_questions[0].status).toBe("open");
    h.session = { userId: "u-clerk2", profile: { primary_role: "public_buyer" }, organization: { id: TOWN } };
    expect(await answerQuestionAction({}, fd)).toMatchObject({ done: "answered" });
  });
});

// ── Addenda and the closing date ────────────────────────────────────

describe("addenda and the closing date's change history", () => {
  it("checks the addendum: text, a safe link, a later closing date that differs; a later question deadline moves back", () => {
    const j = { status: "published", deadline: "2099-05-01", question_deadline: "2099-04-28" };
    expect(planAddendum({ body: "x" }, j, "2099-04-01")).toEqual({ ok: false, error: "body" });
    expect(planAddendum({ body: "Site meeting moved.", officialUrl: "ftp://x" }, j, "2099-04-01")).toEqual({ ok: false, error: "url" });
    expect(planAddendum({ body: "Site meeting moved.", newDeadline: "2099-03-01" }, j, "2099-04-01")).toEqual({ ok: false, error: "deadline_past" });
    expect(planAddendum({ body: "Site meeting moved.", newDeadline: "2099-05-01" }, j, "2099-04-01")).toEqual({ ok: false, error: "deadline_same" });
    expect(planAddendum({ body: "Closing moved earlier.", newDeadline: "2099-04-25" }, j, "2099-04-01")).toEqual({
      ok: true,
      plan: { body: "Closing moved earlier.", officialUrl: null, oldDeadline: "2099-05-01", newDeadline: "2099-04-25", questionDeadline: "2099-04-25" },
    });
    expect(planAddendum({ body: "Notice", newDeadline: "2099-06-01" }, { ...j, status: "closed" }, "2099-04-01")).toEqual({ ok: false, error: "closed" });
  });

  it("issues numbered addenda, moves the listing's deadline, logs it, and keeps the history", async () => {
    const one = await issueAddendum(h.db as never, { job: town(), body: "The site meeting moves to May 3.", officialUrl: "https://cobourg.ca/addendum-1.pdf", actorUserId: CLERK });
    expect(one).toMatchObject({ ok: true, number: 1 });
    const two = await issueAddendum(h.db as never, { job: town(), body: "Closing extended one week.", newDeadline: "2099-05-08", actorUserId: CLERK });
    expect(two).toMatchObject({ ok: true, number: 2 });
    expect(h.db.tables.rfp_posts.find((r) => r.id === "rfq-1")).toMatchObject({ deadline: "2099-05-08" });
    expect(log()).toEqual(["addendum_issued", "broadcast", "addendum_issued", "deadline_changed", "broadcast"]);
    expect(h.db.tables.town_job_log.find((l) => l.event === "deadline_changed")?.detail).toEqual({ number: 2, from: "2099-05-01", to: "2099-05-08" });
    const history = deadlineHistory(h.db.tables.town_job_addenda as never);
    expect(history).toEqual([{ number: 2, from: "2099-05-01", to: "2099-05-08", at: NOW }]);
  });
});

// ── Who may do what ─────────────────────────────────────────────────

describe("admin gating", () => {
  const j = { source_type: "public_buyer_direct", posted_by_user_id: CLERK, posted_by_organization_id: TOWN };
  it("the posting town (any member) or an admin manages a town's job; nobody else", () => {
    expect(canManageTownJob(j, { userId: "u-clerk2", organizationId: TOWN, role: "public_buyer" })).toBe(true);
    expect(canManageTownJob(j, { userId: "u-a", organizationId: "org-a", role: "trade" })).toBe(false);
    expect(canManageTownJob(j, { userId: "root", organizationId: null, role: "admin" })).toBe(true);
    expect(canManageTownJob({ ...j, source_type: "property_manager_direct" }, { userId: "root", organizationId: null, role: "admin" })).toBe(false);
  });

  it("only an admin unpublishes: back to review, the town told, the record kept", async () => {
    expect(canUnpublish({ role: "admin" })).toBe(true);
    expect(canUnpublish({ role: "super_admin" })).toBe(true);
    expect(canUnpublish({ role: "public_buyer" })).toBe(false);

    const fd = new FormData();
    fd.set("id", "rfq-1");
    fd.set("reason", "Duplicate of the official posting");
    h.session = { userId: CLERK, profile: { primary_role: "public_buyer" }, organization: { id: TOWN } };
    await expect(unpublishTownJobAction(fd)).rejects.toThrow(/REDIRECT:role/);
    expect(h.db.tables.rfp_posts.find((r) => r.id === "rfq-1")).toMatchObject({ status: "published" });

    h.session = { userId: "root", profile: { primary_role: "admin" }, organization: null };
    await expect(unpublishTownJobAction(fd)).rejects.toThrow(/REDIRECT:\/admin\/rfps\?unpublished=rfq-1/);
    expect(h.db.tables.rfp_posts.find((r) => r.id === "rfq-1")).toMatchObject({ status: "pending_review", published_at: null });
    expect(h.db.tables.notifications.find((n) => n.user_id === CLERK)).toMatchObject({ type: "town_unpublished" });
    expect(log()).toEqual(["unpublished"]);
    // Not a town's job, or not live: nothing happens.
    expect(await unpublishTownJob(h.db as never, "pm-1", "root", null)).toEqual({ ok: false });
    expect(await loadTownJob(h.db as never, "pm-1")).toBeNull();
  });
});
