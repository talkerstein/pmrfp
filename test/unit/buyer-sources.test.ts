import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "List your tenders on PMRFP, free": the request form's validation, the
 * public route (rate limit, honeypot, missing-table fallback, admin
 * notifications), the admin route's gating and decisions, and the copy.
 */

type Row = Record<string, unknown>;
interface Op {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: [string, unknown][];
}

const { state } = vi.hoisted(() => ({
  state: {
    configured: true,
    limited: null as null | { limit: number; remaining: number; reset: number },
    session: null as unknown,
    missing: false,
    request: null as Row | null,
    ops: [] as Op[],
  },
}));

/** A chainable stand-in for the service client: records every write, answers the few reads the routes make. */
function fakeDb() {
  return {
    from(table: string) {
      const entry: Op = { table, op: "select", filters: [] };
      state.ops.push(entry);
      const result = () => {
        if (state.missing && table.startsWith("buyer_")) return { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } };
        if (table === "users_profile") return { data: [{ id: "admin-1", status: "active" }, { id: "admin-2", status: "suspended" }], error: null };
        if (table === "buyer_source_requests" && entry.op === "insert") return { data: { id: "11111111-1111-4111-8111-111111111111" }, error: null };
        if (table === "buyer_source_requests" && entry.op === "select") return { data: state.request, error: null };
        return { data: null, error: null };
      };
      const q: Record<string, unknown> = {};
      const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => {
        fn?.(...a);
        return q;
      };
      Object.assign(q, {
        select: chain(),
        insert: chain((p) => Object.assign(entry, { op: "insert", payload: p })),
        update: chain((p) => Object.assign(entry, { op: "update", payload: p })),
        upsert: chain((p) => Object.assign(entry, { op: "upsert", payload: p })),
        eq: chain((c, v) => entry.filters.push([c as string, v])),
        in: chain((c, v) => entry.filters.push([c as string, v])),
        order: chain(),
        limit: chain(),
        single: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve(result()),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      });
      return q;
    },
  };
}

vi.mock("@/lib/supabase/config", () => ({ isServiceConfigured: () => state.configured, isSupabaseConfigured: () => state.configured }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeDb() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => state.limited,
  checkRateLimitByIp: async () => state.limited,
  rateLimitResponse: () => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }),
}));
vi.mock("@/lib/access/access", () => ({
  getSession: async () => state.session,
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { buyerSourceRequestSchema, decisionSchema, emailMatchesSite, listYourTendersHref, mailtoFallback, toRequestRow } from "@/lib/buyers/source-requests";
import { POST as submit } from "@/app/api/buyer-sources/route";
import { POST as decide } from "@/app/api/admin/buyer-sources/route";
import buyers from "@/i18n/messages/buyers";
import board from "@/i18n/messages/board";

const valid = {
  organization: "City of Testville",
  contactName: "Pat Buyer",
  workEmail: "Pat@Testville.ca",
  tendersUrl: "https://www.testville.ca/business/bids",
  method: "read_public_page",
  provinceCode: "BC",
  authorized: true,
  lang: "en",
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", origin: new URL(url).origin, ...headers }, body: JSON.stringify(body) });
const PUBLIC = "https://pmrfp.com/api/buyer-sources";
const ADMIN = "https://pmrfp.com/api/admin/buyer-sources";
const REQ_ID = "22222222-2222-4222-8222-222222222222";
const admin = (role = "admin", status = "active") => ({ userId: "admin-1", profile: { primary_role: role, status } });

beforeEach(() => {
  state.configured = true;
  state.limited = null;
  state.session = null;
  state.missing = false;
  state.request = { id: REQ_ID, organization: "City of Testville", contact_name: "Pat Buyer", work_email: "pat@testville.ca", province_code: "BC", feed_url: null, status: "new" };
  state.ops = [];
});

const writes = (table: string, op?: Op["op"]) => state.ops.filter((o) => o.table === table && (op ? o.op === op : o.op !== "select"));

describe("form validation", () => {
  it("accepts a complete request and lower-cases the email", () => {
    const row = toRequestRow(buyerSourceRequestSchema.parse(valid));
    expect(row).toMatchObject({ organization: "City of Testville", work_email: "pat@testville.ca", method: "read_public_page", feed_url: null, province_code: "BC", country: "CA", authorized: true, status: "new", buyer_slug: null });
  });

  it("needs the 'I'm authorized' box, a real URL, a Canadian province, and a feed URL for the feed method", () => {
    expect(buyerSourceRequestSchema.safeParse({ ...valid, authorized: false }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, authorized: undefined }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, tendersUrl: "testville.ca/bids" }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, tendersUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, provinceCode: "NY" }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, workEmail: "nope" }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, method: "scrape_bonfire" }).success).toBe(false);
    expect(buyerSourceRequestSchema.safeParse({ ...valid, method: "feed" }).success).toBe(false);
    const feed = buyerSourceRequestSchema.parse({ ...valid, method: "feed", feedUrl: "https://www.testville.ca/bids.rss" });
    expect(toRequestRow(feed).feed_url).toBe("https://www.testville.ca/bids.rss");
    expect(buyerSourceRequestSchema.safeParse({ ...valid, buyerSlug: "../../etc" }).success).toBe(false);
    expect(buyerSourceRequestSchema.parse({ ...valid, buyerSlug: "city-of-testville" }).buyerSlug).toBe("city-of-testville");
  });

  it("admin decisions are typed", () => {
    expect(decisionSchema.safeParse({ action: "approve", id: REQ_ID, method: "email_notices", buyerSlug: "city-of-testville" }).success).toBe(true);
    expect(decisionSchema.safeParse({ action: "approve", id: REQ_ID, method: "email_notices", buyerSlug: "City Of Testville" }).success).toBe(false);
    expect(decisionSchema.safeParse({ action: "approve", id: REQ_ID, buyerSlug: "city-of-testville" }).success).toBe(false);
    expect(decisionSchema.safeParse({ action: "delete", id: REQ_ID }).success).toBe(false);
  });

  it("helpers: prefilled link, email-domain hint, mailto fallback to info@pmrfp.com", () => {
    expect(listYourTendersHref({ buyerSlug: "city-of-nanaimo", provinceCode: "BC" })).toBe("/for-public-buyers?buyer=city-of-nanaimo&province=BC#form");
    expect(emailMatchesSite("pat@testville.ca", "https://www.testville.ca/bids")).toBe(true);
    expect(emailMatchesSite("pat@purchasing.testville.ca", "https://testville.ca/bids")).toBe(true);
    expect(emailMatchesSite("pat@gmail.com", "https://www.testville.ca/bids")).toBe(false);
    const href = mailtoFallback("List our tenders on PMRFP", { organization: "City of Testville", tendersUrl: "https://www.testville.ca/bids" });
    expect(href.startsWith("mailto:info@pmrfp.com?subject=List%20our%20tenders%20on%20PMRFP&body=")).toBe(true);
  });
});

describe("POST /api/buyer-sources", () => {
  it("stores the request and notifies active admins in-app (no email)", async () => {
    const res = await submit(post(PUBLIC, valid));
    expect(res.status).toBe(200);
    const [insert] = writes("buyer_source_requests", "insert");
    expect(insert.payload).toMatchObject({ organization: "City of Testville", work_email: "pat@testville.ca", status: "new" });
    const [notify] = writes("notifications", "insert");
    expect(notify.payload).toEqual([expect.objectContaining({ user_id: "admin-1", type: "buyer_source_request", link_url: "/admin/buyer-sources" })]);
  });

  it("is rate-limited with the shared limiter", async () => {
    state.limited = { limit: 5, remaining: 0, reset: Date.now() + 60_000 };
    const res = await submit(post(PUBLIC, valid));
    expect(res.status).toBe(429);
    expect(writes("buyer_source_requests")).toEqual([]);
  });

  it("swallows honeypot submissions without storing anything", async () => {
    const res = await submit(post(PUBLIC, { ...valid, company_website: "http://spam.example" }));
    expect(res.status).toBe(200);
    expect(state.ops).toEqual([]);
  });

  it("rejects invalid input and other sites' forms", async () => {
    expect((await submit(post(PUBLIC, { ...valid, authorized: false }))).status).toBe(422);
    expect((await submit(post(PUBLIC, valid, { origin: "https://evil.example" }))).status).toBe(403);
    expect(state.ops).toEqual([]);
  });

  it("falls back to email when the migration isn't applied or there's no backend", async () => {
    state.missing = true;
    let res = await submit(post(PUBLIC, valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: "email" });
    state.missing = false;
    state.configured = false;
    res = await submit(post(PUBLIC, valid));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: "email" });
  });
});

describe("POST /api/admin/buyer-sources (admins only)", () => {
  const approve = { action: "approve", id: REQ_ID, method: "email_notices", buyerSlug: "city-of-testville", notes: "Checked their site." };

  it("refuses visitors, members and suspended admins", async () => {
    for (const s of [null, admin("trade"), admin("property_manager"), admin("admin", "suspended")]) {
      state.session = s;
      expect((await decide(post(ADMIN, approve))).status).toBe(403);
    }
    expect(state.ops).toEqual([]);
  });

  it("refuses cross-site posts even from an admin", async () => {
    state.session = admin();
    expect((await decide(post(ADMIN, approve, { origin: "https://evil.example" }))).status).toBe(403);
  });

  it("approve: the registry says yes with that method, and the request is approved", async () => {
    state.session = admin("super_admin");
    const res = await decide(post(ADMIN, approve));
    expect(res.status).toBe(200);
    const [upsert] = writes("buyer_permissions", "upsert");
    expect(upsert.payload).toMatchObject({ buyer_slug: "city-of-testville", status: "yes", method: "email_notices", scope: "buyer", country: "CA", source_request_id: REQ_ID });
    const [update] = writes("buyer_source_requests", "update");
    expect(update.payload).toMatchObject({ status: "approved", decided_by: "admin-1" });
  });

  it("can't approve a buyer that declined (the code seed says no)", async () => {
    state.session = admin();
    const res = await decide(post(ADMIN, { ...approve, buyerSlug: "town-of-newmarket" }));
    expect(res.status).toBe(409);
    expect(writes("buyer_permissions")).toEqual([]);
    expect(writes("buyer_source_requests", "update")).toEqual([]);
  });

  it("reject and notes touch only the request", async () => {
    state.session = admin();
    expect((await decide(post(ADMIN, { action: "reject", id: REQ_ID, notes: "Not a public body." }))).status).toBe(200);
    expect(writes("buyer_source_requests", "update")[0].payload).toMatchObject({ status: "rejected" });
    expect((await decide(post(ADMIN, { action: "note", id: REQ_ID, notes: "Called them." }))).status).toBe(200);
    expect(writes("buyer_permissions")).toEqual([]);
  });

  it("422 on a bad body, 404 on an unknown request, 503 before the migration", async () => {
    state.session = admin();
    expect((await decide(post(ADMIN, { action: "approve", id: "nope" }))).status).toBe(422);
    state.request = null;
    expect((await decide(post(ADMIN, approve))).status).toBe(404);
    state.missing = true;
    expect((await decide(post(ADMIN, approve))).status).toBe(503);
  });

  it("the admin page requires an admin role", () => {
    const page = readFileSync(join(process.cwd(), "src/app/[lang]/admin/buyer-sources/page.tsx"), "utf8");
    expect(page).toContain('await requireRole(["admin", "super_admin"])');
  });
});

describe("the form", () => {
  async function render(available: boolean) {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { BuyerSourceForm } = await import("@/components/v3-pages/buyer-source-form");
    const f = buyers.en.forBuyers.form;
    const e = (s: string) => s.replace("{email}", "info@pmrfp.com");
    const t = {
      ...f,
      title: buyers.en.forBuyers.formTitle,
      doneBody: e(f.doneBody),
      error: e(f.error),
      tooMany: e(f.tooMany),
      fallbackBody: e(f.fallbackBody),
      fallbackCta: e(f.fallbackCta),
      prefer: e(f.prefer),
      methods: buyers.en.forBuyers.methods,
    };
    return renderToStaticMarkup(
      createElement(BuyerSourceForm, {
        t,
        lang: "en",
        provinces: [{ code: "BC", name: "British Columbia" }],
        prefill: { buyerSlug: "city-of-nanaimo", organization: "City of Nanaimo", tendersUrl: "https://www.nanaimo.ca/x", provinceCode: "BC" },
        available,
      }),
    );
  }

  it("asks for the organization, contact, work email, tenders page, method and authorization, with a honeypot", async () => {
    const html = await render(true);
    for (const name of ["organization", "contactName", "workEmail", "tendersUrl", "provinceCode", "method", "authorized", "company_website"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain('value="City of Nanaimo"');
    expect(html).toContain("I&#x27;m authorized to give this permission");
    for (const m of ["read_public_page", "email_notices", "feed"]) expect(html).toContain(`value="${m}"`);
  });

  it("without a backend it's an email link to info@pmrfp.com", async () => {
    const html = await render(false);
    expect(html).toContain('href="mailto:info@pmrfp.com?subject=');
    expect(html).not.toContain("<form");
  });
});

describe("copy", () => {
  it("the page and buyer-page strings exist in English, French and Spanish", () => {
    for (const lang of ["fr", "es"] as const) {
      expect(buyers[lang].forBuyers.title).not.toBe(buyers.en.forBuyers.title);
      expect(buyers[lang].forBuyers.form.authorized).not.toBe(buyers.en.forBuyers.form.authorized);
      expect(buyers[lang].page.listYours).not.toBe(buyers.en.page.listYours);
      expect(board[lang].detail.permission.listed).not.toBe(board.en.detail.permission.listed);
    }
    expect(buyers.en.page.listYours).toBe("Are you this buyer? List your tenders on PMRFP free");
    expect(board.en.detail.permission.listed.replace("{buyer}", "the City of Nanaimo")).toBe("Listed with permission from the City of Nanaimo");
    expect(board.en.detail.permission.view).toBe("View and bid on the official posting");
  });

  it("says what we never do: host documents, take bids, charge anything", () => {
    const never = buyers.en.forBuyers.never.join(" ");
    expect(never).toMatch(/copy your documents/);
    expect(never).toMatch(/Take bids/);
    expect(never).toMatch(/Charge anything/);
  });

  it("points buyers at info@pmrfp.com and never at a notices@ mailbox", () => {
    const files = [
      "src/i18n/messages/buyers.ts",
      "src/i18n/messages/board.ts",
      "src/lib/buyers/source-links.ts",
      "src/lib/buyers/source-requests.ts",
      "src/lib/buyers/permissions.ts",
      "src/lib/tenders/city-sources.ts",
      "src/app/[lang]/(v3)/for-public-buyers/page.tsx",
      "src/components/v3-pages/buyer-source-form.tsx",
      "src/app/api/buyer-sources/route.ts",
      "src/app/[lang]/admin/buyer-sources/page.tsx",
      ...readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) => f.includes("buyer_sources")).map((f) => `supabase/migrations/${f}`),
    ];
    for (const f of files) expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toMatch(/notices@pmrfp/);
    expect(JSON.stringify(buyers.en.forBuyers)).toContain("{email}");
  });
});
