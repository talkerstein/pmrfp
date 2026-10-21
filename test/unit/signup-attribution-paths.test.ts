import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./fake-supabase";

/**
 * signup_attribution is written on EVERY sign-up path: password, magic
 * link (the /sign-up default, and towns) and Google (at the OAuth callback,
 * then the role at the role pick). Until 2026-10-21 only the password path
 * wrote at sign-up, which is why the table stayed empty.
 */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  getUser: vi.fn(),
  exchange: vi.fn(),
  session: null as unknown,
}));
const record = vi.hoisted(() => ({ byId: vi.fn(), byEmail: vi.fn() }));
const tracked = vi.hoisted(() => [] as { name: string; props: unknown; ctx: unknown }[]);

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"]]),
  cookies: async () => ({ get: () => undefined, getAll: () => [], delete: vi.fn(), set: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/onboarding/progress", () => ({ recordOnboardingStep: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitByIp: async () => false }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => state.db) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signUp: state.signUp, signInWithOtp: state.signInWithOtp, getUser: state.getUser, exchangeCodeForSession: state.exchange, signOut: vi.fn() },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendAdminNewSignup: vi.fn(), sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/ghl/sync", () => ({ syncPmrfpUserToGhl: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  EVENT: { SIGNUP_COMPLETED: "signup_completed", SIGNIN_COMPLETED: "signin_completed", ONBOARDING_COMPLETED: "onboarding_completed" },
  trackEvent: vi.fn(async (name: string, props: unknown, ctx: unknown) => void tracked.push({ name, props, ctx })),
}));
vi.mock("@/lib/attribution/record", () => ({ recordSignupAttribution: record.byId, recordSignupAttributionForEmail: record.byEmail }));
vi.mock("@/lib/dedupe/signup", async (orig) => ({ ...(await orig<typeof import("@/lib/dedupe/signup")>()), blockDuplicateOAuthUser: async () => false }));
vi.mock("@/lib/access/access", () => ({
  getSession: vi.fn(async () => state.session),
  roleHome: () => "/dashboard",
  isAdminRole: (r: string) => r === "admin" || r === "super_admin",
  requireRole: vi.fn(),
}));

import { chooseRoleAction, signUpAction } from "@/lib/auth/actions";
import { publicBuyerSignUpAction } from "@/lib/towns/actions";
import { GET as callback } from "@/app/auth/callback/route";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

async function settle(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return "(no redirect)";
}

const NEW_ID = "11111111-1111-4111-8111-111111111111";
const base = { fullName: "New Person", role: "trade", lang: "en" };

beforeEach(() => {
  state.db = fakeDb({ users_profile: [{ id: NEW_ID, email: "someone.else@example.com", primary_role: "trade", status: "active", onboarding_completed: false }], organizations: [] });
  state.signUp.mockReset().mockResolvedValue({ data: { user: { id: NEW_ID, identities: [{}] }, session: null }, error: null });
  state.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  state.exchange.mockReset().mockResolvedValue({ error: null });
  state.getUser.mockReset();
  state.session = null;
  record.byId.mockReset();
  record.byEmail.mockReset();
  tracked.length = 0;
});

describe("every sign-up path writes signup_attribution", () => {
  it("password: right after the account is created, with method and role", async () => {
    await settle(signUpAction({}, form({ ...base, password: "longenough1", email: "new@example.com" })));
    expect(record.byId).toHaveBeenCalledWith({ userId: NEW_ID, method: "password", role: "trade", lang: "en" });
    expect(tracked).toContainEqual(expect.objectContaining({ name: "signup_completed", ctx: { userId: NEW_ID } }));
  });

  it("magic link (the /sign-up default): found by its email in the same browser, before the link is opened", async () => {
    const to = await settle(signUpAction({}, form({ ...base, method: "link", role: "property_manager", email: " New@Example.com " })));
    expect(to).toMatch(/^\/check-email\?/);
    expect(record.byEmail).toHaveBeenCalledWith({ email: "new@example.com", method: "magic_link", role: "property_manager", lang: "en" });
  });

  it("magic link: the emailed link's callback records it too (first write wins)", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: NEW_ID, created_at: new Date(Date.now() - 3600_000).toISOString() } } });
    state.session = { userId: NEW_ID, profile: { primary_role: "property_manager", onboarding_completed: false } };
    await callback(new NextRequest("https://pmrfp.com/auth/callback?code=abc&m=link&next=%2Fonboarding"));
    expect(record.byId).toHaveBeenCalledWith(expect.objectContaining({ userId: NEW_ID, method: "magic_link", role: "property_manager" }));
  });

  it("Google: at the callback the moment the account exists, then the role when it's picked", async () => {
    const created = new Date(Date.now() - 60_000).toISOString();
    state.getUser.mockResolvedValue({ data: { user: { id: NEW_ID, created_at: created, user_metadata: {} } } });
    state.session = { userId: NEW_ID, profile: { primary_role: "trade", onboarding_completed: false, email: "new@gmail.com", full_name: "N" } };
    await callback(new NextRequest("https://pmrfp.com/auth/callback?code=abc"));
    expect(record.byId).toHaveBeenCalledWith({ userId: NEW_ID, method: "google", role: null, signedUpAt: created });

    await settle(chooseRoleAction({}, form({ role: "property_manager", lang: "en" })));
    expect(record.byId).toHaveBeenLastCalledWith(expect.objectContaining({ userId: NEW_ID, method: "google", role: "property_manager" }));
  });

  it("an old account signing in with Google is never re-attributed", async () => {
    state.getUser.mockResolvedValue({ data: { user: { id: NEW_ID, created_at: "2026-01-01T00:00:00Z" } } });
    state.session = { userId: NEW_ID, profile: { primary_role: "trade", onboarding_completed: true } };
    await callback(new NextRequest("https://pmrfp.com/auth/callback?code=abc"));
    expect(record.byId).not.toHaveBeenCalled();
  });

  it("towns (public buyers) sign up by link and are recorded too", async () => {
    await settle(publicBuyerSignUpAction(form({ email: "clerk@town.example.ca", lang: "fr" })));
    expect(record.byEmail).toHaveBeenCalledWith({ email: "clerk@town.example.ca", method: "magic_link", role: "public_buyer", lang: "fr" });
  });
});
