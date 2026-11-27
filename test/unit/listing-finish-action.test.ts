import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * The save behind "Finish your listing" (/dashboard/company/finish): one column
 * at a time, under the same rules as the full Company Profile form.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  session: null as unknown,
  audits: [] as { action: string }[],
  screened: [] as Record<string, unknown>[],
  risk: null as unknown,
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
vi.mock("@/lib/email/send", () => ({ sendAdminNewRfp: vi.fn(), sendAdminListingRejected: async () => undefined }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: { action: string }) => void h.audits.push(e) }));
vi.mock("@/lib/access/access", () => ({ getSession: async () => h.session }));
vi.mock("@/lib/spam/server", () => ({
  screenOrganization: async (_service: unknown, input: Record<string, unknown>) => {
    h.screened.push(input);
    return h.risk;
  },
  recordOrgRisk: async () => undefined,
}));

import { saveListingStepAction } from "@/lib/dashboard/actions";

const ORG = {
  id: "org-1",
  name: "Northline Roofing",
  slug: "northline",
  organization_type: "trade_company",
  website: "https://northline.ca",
  phone: "416-555-0100",
  email: "office@northline.ca",
  logo_url: null,
  short_description: "Flat roofs for condos across the GTA.",
  full_description: null,
  city: "Toronto",
  province: "Ontario",
  country: "Canada",
  insurance_status: null,
  status: "active",
  profile_status: "approved",
};

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  f.append("lang", "en");
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

function setup(extra: Record<string, unknown> = {}) {
  const org = { ...ORG, ...extra };
  h.db = fakeDb({
    organizations: [org, { ...ORG, id: "org-2", name: "Someone Else" }],
    organization_categories: [{ organization_id: "org-1", category_id: "c-roof" }],
    organization_regions: [{ organization_id: "org-1", region_id: "r-to" }],
  });
  h.session = { userId: "user-1", profile: { primary_role: "trade", status: "active", email: "owner@northline.ca" }, organization: { ...org } };
}

async function save(fields: Record<string, string>): Promise<{ redirect?: string; result?: { error?: string } }> {
  try {
    return { result: await saveListingStepAction({}, form(fields)) };
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return { redirect: m[1] };
    throw e;
  }
}

const updates = (table = "organizations") => h.db.calls.filter((c) => c.table === table && c.op === "update");

beforeEach(() => {
  h.audits = [];
  h.screened = [];
  h.risk = null;
  setup();
});

describe("saving one answer", () => {
  it("writes that column on the company's own row and moves on", async () => {
    const out = await save({ step: "insurance", value: "Fully insured ($5M)" });
    expect(out.redirect).toBe("/dashboard/company/finish?after=insurance");
    expect(updates()).toHaveLength(1);
    expect(updates()[0].patch).toMatchObject({ insurance_status: "Fully insured ($5M)" });
    expect(updates()[0].patch).not.toHaveProperty("name");
    expect(h.db.tables.organizations.find((o) => o.id === "org-1")?.insurance_status).toBe("Fully insured ($5M)");
  });

  it("ignores any company id in the form", async () => {
    await save({ step: "city", value: "Ottawa", organizationId: "org-2", id: "org-2" });
    expect(h.db.tables.organizations.find((o) => o.id === "org-1")?.city).toBe("Ottawa");
    expect(h.db.tables.organizations.find((o) => o.id === "org-2")?.city).toBe("Toronto");
  });

  it("recounts the completion score with the company's real categories and regions", async () => {
    await save({ step: "insurance", value: "Fully insured" });
    // short, website, phone, city and insurance plus one category and one region: 7 of 8.
    expect(updates()[0].patch).toMatchObject({ profile_completion_score: 88 });
  });

  it("leaves categories and regions alone", async () => {
    await save({ step: "city", value: "Ottawa" });
    for (const table of ["organization_categories", "organization_regions", "organization_property_types"]) {
      expect(h.db.calls.filter((c) => c.table === table && (c.op === "delete" || c.op === "insert"))).toHaveLength(0);
    }
  });
});

describe("approval", () => {
  it("an approved company stays approved", async () => {
    await save({ step: "insurance", value: "Fully insured" });
    expect(updates()[0].patch).not.toHaveProperty("profile_status");
  });

  it("anything else goes to review, never straight to approved", async () => {
    for (const status of ["draft", "rejected", "suspended"]) {
      setup({ profile_status: status });
      await save({ step: "insurance", value: "Fully insured" });
      expect(updates()[0].patch).toMatchObject({ profile_status: "pending_review" });
    }
  });
});

describe("answers that change nothing", () => {
  it("blank writes nothing and still moves on", async () => {
    const out = await save({ step: "insurance", value: "   " });
    expect(out.redirect).toBe("/dashboard/company/finish?after=insurance");
    expect(updates()).toHaveLength(0);
  });

  it("the value already saved writes nothing, so it can't send a listing back for review", async () => {
    setup({ profile_status: "draft", city: "Toronto" });
    const out = await save({ step: "city", value: "Toronto" });
    expect(out.redirect).toBe("/dashboard/company/finish?after=city");
    expect(updates()).toHaveLength(0);
    expect(h.screened).toHaveLength(0);
  });

  it("the logo step with no logo writes nothing", async () => {
    await save({ step: "logo", logoUrl: "" });
    expect(updates()).toHaveLength(0);
  });
});

describe("answers that are refused", () => {
  it("a bad website stays on the step with a message", async () => {
    const out = await save({ step: "website", value: "javascript:alert(1)" });
    expect(out.result?.error).toMatch(/website address/);
    expect(updates()).toHaveLength(0);
  });

  it("an unknown step changes nothing", async () => {
    const out = await save({ step: "profile_status", value: "approved" });
    expect(out.result?.error).toBeTruthy();
    expect(updates()).toHaveLength(0);
  });

  it("only takes a logo from our own storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    await save({ step: "logo", logoUrl: "https://evil.example/storage/v1/object/public/logos/x.png" });
    expect(updates()).toHaveLength(0);
    const own = "https://abc.supabase.co/storage/v1/object/public/logos/org-1/logo.png";
    await save({ step: "logo", logoUrl: own });
    expect(updates()[0].patch).toMatchObject({ logo_url: own });
    vi.unstubAllEnvs();
  });
});

describe("the same checks as the full form", () => {
  it("a new website on a live listing is screened and starts the badge over", async () => {
    await save({ step: "website", value: "brandnew.ca" });
    expect(h.screened).toHaveLength(1);
    expect(h.screened[0]).toMatchObject({ organizationId: "org-1", website: "https://brandnew.ca", name: ORG.name, email: ORG.email });
    expect(updates()[0].patch).toMatchObject({ website: "https://brandnew.ca" });
    expect(updates().some((u) => (u.patch as unknown as { link_badge?: boolean }).link_badge === false)).toBe(true);
    expect(h.audits.map((a) => a.action)).toContain("organization.profile_edited");
  });

  it("a screening reject takes the listing down", async () => {
    h.risk = { score: 9, reject: true, hold: true, skipped: false, reasons: [{ detail: "blocked domain" }] };
    await save({ step: "website", value: "spam-domain.ca" });
    expect(updates().some((u) => (u.patch as unknown as { profile_status?: string }).profile_status === "rejected")).toBe(true);
    expect(h.audits.map((a) => a.action)).toContain("organization.spam_rejected");
  });

  it("insurance on a live listing doesn't re-screen it", async () => {
    await save({ step: "insurance", value: "Fully insured" });
    expect(h.screened).toHaveLength(0);
  });

  it("a listing still in review is screened on every change", async () => {
    setup({ profile_status: "pending_review" });
    await save({ step: "insurance", value: "Fully insured" });
    expect(h.screened).toHaveLength(1);
  });
});
