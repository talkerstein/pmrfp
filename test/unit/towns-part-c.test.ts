import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { fakeDb, type FakeDb } from "./fake-supabase";
import { zipEntries, unzipEntry } from "@/lib/contract-history/zip";
import { awardHistoryRow, csvCell, isCompliant, planAward, resultsReady, summarize, summaryCsv, type SummaryResponse } from "@/lib/town-jobs/results";
import { recordFiles, recordFolder, type RecordBundle } from "@/lib/town-jobs/records";
import { recordLabels } from "@/lib/town-jobs/records-labels";
import { followersAtPosting, lastYearFor, monthLastYear, monthOf, rollupMonth, viewsFor, type PostCounts } from "@/lib/town-jobs/reach";
import { cleanWitnessName, isClosed, openingMode, openingStep, sealedAnswer, townClosesAt, townTimeZone, type SealedState } from "@/lib/town-jobs/sealed";
import { closingLabel } from "@/lib/town-jobs/sealed-email-copy";
import { parseTownPostFields, townPostColumns } from "@/lib/town-jobs/post";
import { zip } from "@/lib/zip/write";
import { getDictionary } from "@/i18n/dictionaries";

/**
 * PMRFP for Towns, Part C (pure parts and the server flows with an in-memory
 * database): summary math, the council CSV, the award (form and award-history
 * row), the records export's ZIP contents, the reach roll-ups, the sealed
 * box's rules and closing time, the witness link (only its hash reaches the
 * database; emails only behind the flag), and broadcasts reaching sealed
 * responders. The database's own guarantees are in test/db/towns-part-c.test.ts.
 */

const h = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; body: string; utm: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/send", () => ({
  sendTownJobEmail: async (to: string, e: { subject: string; bodyHtml: string }, _lang: string, utm: string) => void h.sent.push({ to, subject: e.subject, body: e.bodyHtml, utm }),
  sendAdminNewRfp: async () => undefined,
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => false }));

const resp = (id: string, company: string, amount: number | null, status = "submitted", extra: Partial<SummaryResponse> = {}): SummaryResponse => ({
  id,
  status,
  orgId: `org-${id}`,
  company,
  amount,
  kind: amount == null ? null : "firm",
  startDate: "2027-05-01",
  notes: null,
  createdAt: "2026-10-20T15:00:00Z",
  profileStatus: "approved",
  verified: false,
  insurance: null,
  wsib: null,
  ...extra,
});

describe("summary math", () => {
  const rows = [resp("a", "Acme", 41000), resp("b", "Best", 38500), resp("c", "Cheap", 20000, "declined"), resp("d", "Dunno", null), resp("e", "Even", 41000.5)];
  it("lowest compliant skips declined and unpriced quotes; the average is of compliant prices", () => {
    const s = summarize(rows, { sent: 12, invitedOrgIds: new Set(["org-a", "org-d", "org-x"]) });
    expect(s.received).toBe(5);
    expect(s.priced).toBe(4);
    expect(s.compliant).toBe(3);
    expect(s.lowestCompliant).toEqual({ id: "b", company: "Best", amount: 38500 });
    expect(s.average).toBe(40166.83);
    expect(s.highestCompliant).toBe(41000.5);
    expect(s.invitesSent).toBe(12);
    expect(s.invitedResponded).toBe(2);
    // Lowest first (declined ones keep their place by price), no price last.
    expect(s.rows.map((r) => r.id)).toEqual(["c", "b", "a", "e", "d"]);
  });
  it("handles no quotes, and only unpriced ones", () => {
    expect(summarize([], { sent: 0 })).toMatchObject({ received: 0, lowestCompliant: null, average: null, invitedResponded: 0 });
    expect(summarize([resp("x", "X", null)], { sent: 3 })).toMatchObject({ received: 1, priced: 0, lowestCompliant: null, average: null });
    expect(isCompliant({ status: "picked", amount: 1 })).toBe(true);
    expect(isCompliant({ status: "declined", amount: 1 })).toBe(false);
  });
  it("results are ready after opening (sealed) or after closing (not sealed)", () => {
    expect(resultsReady({ sealed: true, opened: false, closed: true, status: "published" })).toBe(false);
    expect(resultsReady({ sealed: true, opened: true, closed: true, status: "published" })).toBe(true);
    expect(resultsReady({ sealed: false, opened: false, closed: false, status: "published" })).toBe(false);
    expect(resultsReady({ sealed: false, opened: false, closed: true, status: "published" })).toBe(true);
    expect(resultsReady({ sealed: false, opened: false, closed: false, status: "awarded" })).toBe(true);
  });
  it("the council CSV: lowest first, the recommendation marked, formulas neutralised", () => {
    const t = getDictionary("en").townResults.results;
    const csv = summaryCsv(
      summarize([resp("a", "=HYPERLINK(evil)", 100), resp("b", 'Best, "Inc"', 90)], { sent: 0 }),
      { company: "Company", amount: "Quote", kind: "Kind", start: "Start", notes: "Notes", status: "Status", profile: "Profile", insurance: "Insurance", wsib: "WSIB", received: "Received", recommended: "Recommended", yes: "yes", firm: t.firm, estimate: t.estimate, notOnFile: t.notOnFile, statuses: t.statuses, profiles: t.profile },
      "a",
    );
    expect(csv.startsWith("﻿Company,Quote")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('"Best, ""Inc""",90.00,Firm,2027-05-01,,Received,Approved profile,Not on file,Not on file,2026-10-20,');
    expect(lines[2].startsWith("'=HYPERLINK(evil),100.00")).toBe(true);
    expect(lines[2].endsWith(",yes")).toBe(true);
    expect(csvCell("+1")).toBe("'+1");
  });
});

describe("the award", () => {
  it("checks the form: a winner, an optional amount, a past or present date", () => {
    expect(planAward({ winnerName: " Best  Paving Inc ", amount: "$38,500.00", amountPublic: "on", awardDate: "2026-10-20" }, "2026-10-21")).toEqual({
      ok: true,
      award: { winnerName: "Best Paving Inc", amount: 38500, amountPublic: true, awardDate: "2026-10-20" },
    });
    expect(planAward({ winnerName: "Best", amount: "", amountPublic: "on", awardDate: "2026-10-21" }, "2026-10-21")).toMatchObject({ ok: true, award: { amount: null, amountPublic: false } });
    expect(planAward({ winnerName: "B", amount: "", amountPublic: null, awardDate: "2026-10-21" }, "2026-10-21")).toEqual({ ok: false, error: "winner" });
    expect(planAward({ winnerName: "Best", amount: "lots", amountPublic: null, awardDate: "2026-10-21" }, "2026-10-21")).toEqual({ ok: false, error: "amount" });
    expect(planAward({ winnerName: "Best", amount: "", amountPublic: null, awardDate: "2026-10-22" }, "2026-10-21")).toEqual({ ok: false, error: "date" });
  });
  const facts = { rfpId: "r1", slug: "arena-roof-ab12", title: "Arena roof patch", buyerName: "Town of Cobourg", province: "ON", city: "Cobourg", amount: 38500, awardDate: "2026-10-20", startDate: "2027-05-01", quotes: 4, tradeSlugs: ["roofing", "roofing"], today: "2026-10-21" };
  it("feeds award history in the importers' shape (CAD, Canada, the listing as the notice)", () => {
    const row = awardHistoryRow({ ...facts, winnerName: "Best Paving Inc", amountPublic: true })!;
    expect(row).toMatchObject({
      source: "pmrfp-towns",
      source_key: "r1",
      buyer: "Town of Cobourg",
      buyer_key: "town of cobourg",
      winner_business_name: "Best Paving Inc",
      winner_key: "best paving",
      winner_is_individual: false,
      value: 38500,
      currency: "CAD",
      country: "CA",
      province: "Ontario",
      number_of_bids: 4,
      trade_slugs: ["roofing"],
      notice_url: "https://pmrfp.com/rfps/arena-roof-ab12",
      award_date: "2026-10-20",
      as_of: "2026-10-21",
    });
  });
  it("keeps the amount out when the town didn't publish it, and never names a person", () => {
    expect(awardHistoryRow({ ...facts, winnerName: "Best Paving Inc", amountPublic: false })?.value).toBeNull();
    expect(awardHistoryRow({ ...facts, winnerName: "John Smith", amountPublic: true })).toMatchObject({ winner_business_name: null, winner_key: null, winner_is_individual: true });
    expect(awardHistoryRow({ ...facts, winnerName: "n/a", amountPublic: true })).toBeNull();
  });
});

describe("records export", () => {
  const L = recordLabels(getDictionary("en"));
  const post = {
    id: "p1", slug: "grass-cutting-ab12", title: "Grass cutting <2027>", summary: "Three parks", scope: "Weekly", requirements: null, submission_instructions: null,
    status: "awarded", post_kind: "quote_request", sealed: true, deadline: "2026-10-30", question_deadline: null, closes_at: "2026-10-31T04:00:00.000Z",
    published_at: "2026-10-01T14:00:00Z", created_at: "2026-10-01T13:00:00Z", buyer_name: "Town of Cobourg", official_url: null, official_portal: null,
    budget_min: null, budget_max: null, city: "Cobourg", province: "ON",
  };
  const opened: RecordBundle = {
    post,
    addenda: [{ number: 1, body: "Site visit moved", official_url: null, old_deadline: "2026-10-28", new_deadline: "2026-10-30", created_at: "2026-10-10T12:00:00Z" }],
    questions: [{ asked_at: "2026-10-05T12:00:00Z", question: "Is fuel included?", public_question: null, answer: "Yes", answered_at: "2026-10-06T12:00:00Z", status: "answered", asker_company: "Acme" }],
    responses: [resp("a", "Acme", 41000), resp("b", "Best", 38500, "picked")],
    sealedCount: null,
    invites: [{ created_at: "2026-10-02T12:00:00Z", kind: "trade", to: "Acme", status: "sent" }],
    log: [
      { at: "2026-10-03T12:00:00Z", event: "sealed_quote_received", actor: null, company: "Acme", detail: { quote: "q1", version: 1 } },
      { at: "2026-11-01T12:00:00Z", event: "opening_requested", actor: "Carla Clerk", company: null, detail: {} },
      { at: "2026-11-02T12:00:00Z", event: "quotes_opened", actor: "Dan Deputy", company: null, detail: { count: 2 } },
    ],
    results: { recommended: "Best", rationale: "Lowest firm price", recommended_by: "Carla Clerk", recommended_at: "2026-11-02T13:00:00Z", winner: "Best", amount: 38500, amount_public: false, award_date: "2026-11-03", published_at: "2026-11-03T12:00:00Z" },
  };
  const shut: RecordBundle = { ...opened, post: { ...post, id: "p2", slug: "snow-ab34", status: "published", published_at: "2026-10-15T12:00:00Z" }, responses: null, sealedCount: 3, results: null, log: [] };

  it("zips the README (with the retention note), an index and a folder per post", () => {
    const files = recordFiles([opened, shut], L, { town: "Town of Cobourg", exportedAt: "2026-11-04T12:00:00Z", exportedBy: "Carla Clerk", range: "2026-10-01 – 2026-11-04" });
    const buf = zip(files, new Date("2026-11-04T12:00:00Z"));
    const entries = zipEntries(buf);
    const names = entries.map((e) => e.name);
    const dir = recordFolder(opened.post);
    expect(dir).toBe("2026-10-01-grass-cutting-ab12");
    expect(names).toEqual(expect.arrayContaining(["README.txt", "index.csv", `${dir}/post.csv`, `${dir}/addenda.csv`, `${dir}/questions.csv`, `${dir}/responses.csv`, `${dir}/invites.csv`, `${dir}/record.csv`, `${dir}/award.csv`, `${dir}/record.html`, "2026-10-15-snow-ab34/responses.csv"]));
    const read = (name: string) => new TextDecoder().decode(unzipEntry(buf, entries.find((e) => e.name === name)!));
    expect(read("README.txt")).toContain(getDictionary("en").townResults.records.retention);
    expect(read(`${dir}/responses.csv`)).toContain("Best");
    expect(read(`${dir}/responses.csv`)).toContain("38500.00");
    expect(read(`${dir}/record.csv`)).toContain("Quotes opened");
    expect(read(`${dir}/record.csv`)).toContain("Carla Clerk");
    expect(read(`${dir}/award.csv`)).toContain("Lowest firm price");
    // A box still sealed: only its count, no company or price.
    const sealedCsv = read("2026-10-15-snow-ab34/responses.csv");
    expect(sealedCsv).toContain("3 quotes inside");
    expect(sealedCsv).not.toMatch(/Acme|Best|41000/);
    // The page is escaped and self-contained.
    const html = read(`${dir}/record.html`);
    expect(html).toContain("Grass cutting &lt;2027&gt;");
    expect(html).not.toMatch(/<script|https?:\/\/[^"]*\.(js|css)/);
  });
  it("French labels", () => {
    const files = recordFiles([opened], recordLabels(getDictionary("fr")), { town: "Ville", exportedAt: "x", exportedBy: "y", range: "z" });
    expect(String(files.find((f) => f.name.endsWith("responses.csv"))!.data)).toContain("Entreprise");
  });
  it("the zip writer keeps names safe and unique", () => {
    const entries = zipEntries(zip([{ name: "../../etc/passwd", data: "x" }, { name: "a.csv", data: "1" }, { name: "a.csv", data: "2" }]));
    expect(entries.map((e) => e.name)).toEqual(["etc/passwd", "a.csv", "a-2.csv"]);
  });
});

describe("reach", () => {
  const p = (id: string, publishedAt: string, quotes: number, views = 10): PostCounts => ({ id, publishedAt, views, quotes, invites: 2, questions: 1, alerted: 5 });
  it("months in Toronto, and the same month last year", () => {
    expect(monthOf("2026-11-01T03:00:00Z")).toBe("2026-10");
    expect(monthLastYear("2026-10")).toBe("2025-10");
  });
  it("rolls up a month and compares with last year", () => {
    const posts = [p("a", "2026-10-02T12:00:00Z", 4), p("b", "2026-10-20T12:00:00Z", 1), p("c", "2025-10-05T12:00:00Z", 2), p("d", "2026-09-30T12:00:00Z", 9)];
    expect(rollupMonth(posts, "2026-10")).toEqual({ month: "2026-10", posts: 2, views: 20, quotes: 5, invites: 4, questions: 2, alerted: 10, avgQuotes: 2.5 });
    expect(lastYearFor(posts[0], posts)).toMatchObject({ month: "2025-10", posts: 1, quotes: 2 });
    expect(lastYearFor(posts[3], posts)).toBeNull();
    expect(rollupMonth([], "2026-10").avgQuotes).toBeNull();
  });
  it("followers at posting: the logged snapshot, else follows made by then", () => {
    expect(followersAtPosting({ loggedSnapshot: 7, followsCreatedAt: [], publishedAt: null })).toBe(7);
    expect(followersAtPosting({ loggedSnapshot: undefined, followsCreatedAt: ["2026-10-01T00:00:00Z", "2026-10-09T00:00:00Z"], publishedAt: "2026-10-05T00:00:00Z" })).toBe(1);
  });
  it("views come from rfp_views and are 0 when there are none (or on error)", async () => {
    const db = fakeDb({ rfp_views: [{ id: "v1", rfp_id: "a" }, { id: "v2", rfp_id: "a" }] });
    const views = await viewsFor(db as never, ["a", "b"]);
    expect(views.get("a")).toBe(2);
    expect(views.get("b")).toBe(0);
    const broken = { from: () => ({ select: () => ({ eq: async () => ({ count: null, error: { message: "boom" } }) }) }) };
    expect((await viewsFor(broken as never, ["a"])).get("a")).toBe(0);
  });
});

describe("the sealed box's rules", () => {
  it("closes at midnight local in the town's own zone (DST included)", () => {
    expect(townTimeZone("british-columbia/village-of-x")).toBe("America/Vancouver");
    expect(townTimeZone(null)).toBe("America/Toronto");
    expect(townClosesAt("2026-10-30", "ontario/town-of-cobourg")).toBe("2026-10-31T04:00:00.000Z");
    expect(townClosesAt("2026-11-01", "ontario/town-of-cobourg")).toBe("2026-11-02T05:00:00.000Z");
    expect(townClosesAt("2026-03-07", "alberta/town-of-olds")).toBe("2026-03-08T07:00:00.000Z");
    expect(townClosesAt(null, "ontario/x")).toBeNull();
    expect(isClosed("2026-10-31T04:00:00.000Z", new Date("2026-10-31T03:59:59Z"))).toBe(false);
    expect(isClosed("2026-10-31T04:00:00.000Z", new Date("2026-10-31T04:00:00Z"))).toBe(true);
    expect(closingLabel("2026-10-31T04:00:00.000Z", "America/Toronto", "en")).toMatch(/October 30, 2026.*11:59/);
  });
  const state = (over: Partial<SealedState> = {}): SealedState => ({ sealed: true, closes_at: "2026-10-31T04:00:00.000Z", time_zone: "America/Toronto", closed: true, received: 3, withdrawn: 0, members: 2, opening: null, ...over });
  const op = (over: Partial<NonNullable<SealedState["opening"]>> = {}) => ({
    status: "requested" as const, attempt: 1, requested_by: "u1", requested_by_name: "Carla", requested_at: "2026-11-01T12:00:00Z", expires_at: "2026-11-08T12:00:00Z",
    witness_name: null, witness_email: null, confirmed_by: null, confirmed_by_name: null, confirmed_method: null, witness_confirmed_name: null, opened_at: null, ...over,
  });
  it("what the town's page offers at each step", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(openingStep(state({ closed: false, closes_at: "2026-12-01T05:00:00.000Z" }), "u1", now)).toBe("sealed");
    expect(openingStep(state(), "u1", now)).toBe("open");
    expect(openingStep(state({ opening: op() }), "u1", now)).toBe("waiting");
    expect(openingStep(state({ opening: op() }), "u2", now)).toBe("confirm");
    expect(openingStep(state({ opening: op({ expires_at: "2026-11-01T13:00:00Z" }) }), "u2", now)).toBe("open");
    expect(openingStep(state({ opening: op({ status: "opened", opened_at: "2026-11-02T10:00:00Z" }) }), "u2", now)).toBe("opened");
    expect(openingMode(1)).toBe("witness");
    expect(openingMode(2)).toBe("colleague");
  });
  it("reads the database's answers and the witness's name", () => {
    expect(sealedAnswer({ ok: true, id: "x" })).toEqual({ ok: true, id: "x" });
    expect(sealedAnswer({ ok: false, error: "late" })).toEqual({ ok: false, error: "late" });
    expect(sealedAnswer({ ok: false, error: "weird" })).toEqual({ ok: false, error: "failed" });
    expect(sealedAnswer(null, { message: "x" })).toEqual({ ok: false, error: "failed" });
    expect(cleanWitnessName("  Wendy   Witness ")).toBe("Wendy Witness");
    expect(cleanWitnessName("W")).toBeNull();
    expect(cleanWitnessName("<script>")).toBeNull();
  });
  it("the post form's opt-in: quote requests only, and the column is sent only when chosen", () => {
    const fd = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) f.set(k, v);
      return f;
    };
    const sealed = parseTownPostFields(fd({ postKind: "quote_request", sealed: "on" }), "2099-01-01");
    expect(sealed.ok && sealed.fields.sealed).toBe(true);
    const mirror = parseTownPostFields(fd({ postKind: "tender_mirror", officialUrl: "https://x.ca/t", sealed: "on" }), "2099-01-01");
    expect(mirror.ok && mirror.fields.sealed).toBe(false);
    const plain = parseTownPostFields(fd({ postKind: "quote_request" }), "2099-01-01");
    expect(plain.ok && "sealed" in townPostColumns(plain.fields, { buyerKey: "ontario/x", buyerName: "X" })).toBe(false);
    expect(sealed.ok && townPostColumns(sealed.fields, { buyerKey: "ontario/x", buyerName: "X" })).toMatchObject({ sealed: true });
  });
});

describe("the server flows (in-memory database)", () => {
  let db: FakeDb & { rpc: ReturnType<typeof vi.fn> };
  const job = { id: "11111111-1111-4111-8111-111111111111", title: "Arena roof", slug: "arena-roof", summary: null, status: "published", source_type: "public_buyer_direct", post_kind: "quote_request", buyer_key: "ontario/town-of-solo", buyer_name: "Town of Solo", official_url: null, official_portal: null, deadline: "2020-01-01", question_deadline: null, posted_by_user_id: "clerk", posted_by_organization_id: "town", sealed: true };
  beforeEach(() => {
    h.sent.length = 0;
    vi.unstubAllEnvs();
    const base = fakeDb({ organization_members: [{ organization_id: "town", user_id: "clerk" }], users_profile: [{ id: "clerk", email: "clerk@solo.ca", full_name: "Sam Solo", status: "active" }], notifications: [], rfp_interests: [], town_job_questions: [], notification_preferences: [], email_suppressions: [], town_job_log: [] });
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "sealed_open_request") return { data: { ok: true, expires_at: "2020-01-09T00:00:00Z", witness: Boolean(args.p_witness_email), members: 1 }, error: null };
      if (fn === "sealed_witness_info") return { data: { ok: true, received: 2, closes_at: "2020-01-02T05:00:00Z", witness_name: "Wendy" }, error: null };
      if (fn === "sealed_responder_ids") return { data: ["trade-1", "trade-2"], error: null };
      return { data: null, error: { message: "unexpected" } };
    });
    db = Object.assign(base, { rpc }) as never;
  });

  it("a witness request sends the database only the link's hash; with emails off nothing is emailed", async () => {
    const { requestOpening } = await import("@/lib/town-jobs/sealed-server");
    const res = await requestOpening(db as never, { job, actorId: "clerk", actorName: "Sam Solo", witnessName: "Wendy Witness", witnessEmail: "Wendy@Council.ca", lang: "en" });
    expect(res).toMatchObject({ ok: true, mode: "witness", emailsOn: false });
    const call = db.rpc.mock.calls.find((c) => c[0] === "sealed_open_request")![1] as Record<string, string>;
    expect(call.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(call)).not.toMatch(/witness\/[^"]*[A-Za-z0-9_-]{30}/);
    expect(h.sent).toHaveLength(0);
  });
  it("with TOWN_SEALED_EMAILS_ENABLED on, the witness gets the one-time link whose hash the database has", async () => {
    vi.stubEnv("TOWN_SEALED_EMAILS_ENABLED", "1");
    const { requestOpening } = await import("@/lib/town-jobs/sealed-server");
    await requestOpening(db as never, { job, actorId: "clerk", actorName: "Sam Solo", witnessName: "Wendy Witness", witnessEmail: "Wendy@Council.ca", lang: "en" });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ to: "wendy@council.ca", utm: "sealed-witness" });
    const token = h.sent[0].body.match(/\/witness\/[0-9a-f-]{36}\/([A-Za-z0-9_-]+)/)![1];
    const hash = (db.rpc.mock.calls.find((c) => c[0] === "sealed_open_request")![1] as Record<string, string>).p_token_hash;
    expect(createHash("sha256").update(token, "utf8").digest("hex")).toBe(hash);
    // No price, no company in the witness's email.
    expect(h.sent[0].body).not.toMatch(/Acme|\$\d/);
  });
  it("answers and addenda reach everyone with a quote in a sealed box (ids only, never shown)", async () => {
    const { broadcastToEngaged } = await import("@/lib/town-jobs/server");
    db.tables.users_profile.push({ id: "trade-1", email: "a@x.ca", status: "active" }, { id: "trade-2", email: "b@x.ca", status: "active" });
    const res = await broadcastToEngaged(db as never, job as never, { kind: "answer", question: "Q?", answer: "A." }, "clerk", { emails: false });
    expect(res.notified).toBe(2);
    expect(db.tables.notifications.map((n) => n.user_id).sort()).toEqual(["trade-1", "trade-2"]);
  });
});
