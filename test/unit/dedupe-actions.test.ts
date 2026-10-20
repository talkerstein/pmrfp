import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * Server actions with their surroundings mocked: sign-up refuses a second
 * account for the same mailbox, and the /admin/duplicates actions are
 * admins-only.
 */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  isAdmin: false,
  audits: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"]]),
  cookies: async () => ({ get: () => undefined, delete: vi.fn(), set: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/onboarding/progress", () => ({ recordOnboardingStep: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitByIp: async () => false }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => state.db) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: state.signUp, signInWithOtp: state.signInWithOtp } }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: unknown) => void state.audits.push(e) }));
vi.mock("@/lib/email/send", () => ({ sendAdminNewSignup: vi.fn(), sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/ghl/sync", () => ({ syncPmrfpUserToGhl: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ EVENT: { SIGNUP_COMPLETED: "signup_completed" }, trackEvent: vi.fn() }));
vi.mock("@/lib/attribution/record", () => ({ recordSignupAttribution: vi.fn() }));
vi.mock("@/lib/access/access", () => ({
  getSession: vi.fn(async () => null),
  roleHome: () => "/dashboard",
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
  requireRole: vi.fn(async (roles: string[]) => {
    // The real requireRole redirects anyone without one of `roles`.
    if (!state.isAdmin || !roles.includes("admin")) throw new Error("REDIRECT:/dashboard");
    return { userId: "admin-1", profile: { primary_role: "admin", status: "active" } };
  }),
}));

import { completeOnboardingAction, signUpAction } from "@/lib/auth/actions";
import { getSession } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { disableAccountAction, dismissDuplicateAction, enableAccountAction, mergeCompaniesAction } from "@/lib/dedupe/admin-actions";

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
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

beforeEach(() => {
  state.db = fakeDb({
    users_profile: [
      { id: "u1", email: "tmiah8363@gmail.com", primary_role: "trade", status: "active" },
      { id: "u2", email: "centraledenettoyage@gmail.com", primary_role: "trade", status: "active" },
      { id: "admin-1", email: "hi@pmrfp.com", primary_role: "admin", status: "active" },
    ],
    organizations: [],
    duplicate_reviews: [],
  });
  state.signUp.mockReset().mockResolvedValue({ data: { user: { id: "new", identities: [{}] }, session: null }, error: null });
  state.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  state.isAdmin = false;
  state.audits = [];
  vi.mocked(createServiceClient).mockClear();
});

describe("sign-up blocks an existing normalized email", () => {
  const base = { fullName: "Thomas Miah", role: "trade", password: "longenough1", lang: "en" };

  it("password sign-up with a dotted / +tag / upper-case variant goes to sign-in, no account created", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, email: " T.Miah8363+pmrfp@Gmail.com " })));
    expect(to).toBe("/sign-in?notice=exists");
    expect(state.signUp).not.toHaveBeenCalled();
    expect(state.audits).toContainEqual(expect.objectContaining({ action: "signup.duplicate_blocked", entityId: "u1" }));
  });

  it("magic-link sign-up is blocked the same way, keeping next", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, method: "link", email: "tmiah8363@googlemail.com", next: "/rfps/x" })));
    expect(to).toBe("/sign-in?notice=exists&next=%2Frfps%2Fx");
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("the French form lands on the French sign-in page", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, lang: "fr", email: "tmiah8363@gmail.com" })));
    expect(to).toBe("/fr/sign-in?notice=exists");
  });

  it("a new mailbox signs up as before (address trimmed and lowercased, dots kept)", async () => {
    const to = await redirectOf(signUpAction({}, form({ ...base, email: " New.Person@Gmail.com " })));
    expect(to).toMatch(/^\/check-email\?/);
    expect(state.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "new.person@gmail.com" }));
  });
});

describe("/admin/duplicates actions are admins-only", () => {
  const pair = { aId: "11111111-1111-4111-8111-111111111111", bId: "22222222-2222-4222-8222-222222222222" };
  const actions = [
    ["merge", () => mergeCompaniesAction(form({ ...pair, confirm: "merge" }))],
    ["disable", () => disableAccountAction(form({ userId: pair.aId }))],
    ["enable", () => enableAccountAction(form({ userId: pair.aId }))],
    ["dismiss", () => dismissDuplicateAction(form({ kind: "company", ...pair }))],
  ] as const;

  for (const [name, run] of actions) {
    it(`${name}: a non-admin is redirected away and nothing is touched`, async () => {
      expect(await redirectOf(run())).toBe("/dashboard");
      expect(createServiceClient).not.toHaveBeenCalled();
      expect(state.db.calls).toEqual([]);
      expect(state.audits).toEqual([]);
    });
  }

  it("an admin can dismiss a pair (stored ordered, audited)", async () => {
    state.isAdmin = true;
    const to = await redirectOf(dismissDuplicateAction(form({ kind: "company", aId: pair.bId, bId: pair.aId })));
    expect(to).toBe("/admin/duplicates?ok=Dismissed.");
    expect(state.db.tables.duplicate_reviews).toEqual([
      expect.objectContaining({ kind: "company", a_id: pair.aId, b_id: pair.bId, status: "dismissed", resolved_by: "admin-1" }),
    ]);
    expect(state.audits).toContainEqual(expect.objectContaining({ action: "duplicate.dismiss" }));
  });

  it("an admin disabling an account suspends and bans it (reversible), never deletes", async () => {
    state.isAdmin = true;
    state.db.tables.users_profile.push({ id: pair.aId, email: "dupe@gmail.com", primary_role: "trade", status: "active" });
    const to = await redirectOf(disableAccountAction(form({ userId: pair.aId })));
    expect(to).toMatch(/^\/admin\/duplicates\?ok=/);
    expect(state.db.tables.users_profile.find((u) => u.id === pair.aId)!.status).toBe("suspended");
    expect(state.db.auth.admin.updateUserById.calls[0]).toEqual([pair.aId, { ban_duration: "876000h" }]);
    expect(state.db.auth.admin.deleteUser.calls).toEqual([]);

    await redirectOf(enableAccountAction(form({ userId: pair.aId })));
    expect(state.db.tables.users_profile.find((u) => u.id === pair.aId)!.status).toBe("active");
    expect(state.db.auth.admin.updateUserById.calls[1]).toEqual([pair.aId, { ban_duration: "none" }]);
  });

  it("an admin can't disable another admin", async () => {
    state.isAdmin = true;
    state.db.tables.users_profile.push({ id: pair.bId, email: "boss@pmrfp.com", primary_role: "super_admin", status: "active" });
    expect(await redirectOf(disableAccountAction(form({ userId: pair.bId })))).toMatch(/error=Admin/);
    expect(state.db.tables.users_profile.find((u) => u.id === pair.bId)!.status).toBe("active");
  });
});

describe("onboarding: company duplicate guard", () => {
  const session = {
    userId: "u9",
    profile: { primary_role: "trade", email: "thomas@gmail.com", full_name: "Thomas Miah", status: "active", onboarding_completed: false },
    organization: null,
  };
  const existingOrg = {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "centrale-de-nettoyage-ab12",
    name: "Centrale De Nettoyage",
    website: "https://www.centraledenettoyage.ca/",
    phone: "4384677009",
    city: "Montreal",
    province: "Quebec",
    status: "active",
    profile_status: "approved",
    is_demo: false,
    created_at: "2026-10-18T18:53:17Z",
  };
  const fields = { lang: "en", name: "Centrale de Nettoyage Inc.", phone: "438-467-7009", city: "Montreal", province: "Quebec", categories: ["janitorial"], regions: ["montreal"] };

  beforeEach(async () => {
    vi.mocked(getSession).mockResolvedValue(session as never);
    Object.assign(state.db.tables, {
      organizations: [{ ...existingOrg }],
      organization_members: [],
      trade_categories: [],
      regions: [],
      organization_categories: [],
      organization_regions: [],
    });
  });

  it("shows the likely match instead of creating a second listing", async () => {
    const res = await completeOnboardingAction({}, form(fields));
    expect(res.duplicates).toEqual([
      { id: existingOrg.id, slug: existingOrg.slug, name: "Centrale De Nettoyage", city: "Montreal", province: "Quebec", listed: true, reasons: ["name", "phone"] },
    ]);
    expect(res.echo).toContainEqual(["name", "Centrale de Nettoyage Inc."]);
    expect(state.db.tables.organizations).toHaveLength(1);
  });

  it("\"It's a different company\" creates the listing and flags the pair for admin review", async () => {
    const to = await redirectOf(completeOnboardingAction({}, form({ ...fields, dup_ack: existingOrg.id })));
    expect(to).toBe("/dashboard");
    expect(state.db.tables.organizations).toHaveLength(2);
    const created = state.db.tables.organizations.find((o) => o.id !== existingOrg.id)!;
    expect(state.db.tables.duplicate_reviews).toEqual([
      expect.objectContaining({ kind: "company", status: "open", source: "onboarding", a_id: [String(created.id), existingOrg.id].sort()[0] }),
    ]);
  });
});
