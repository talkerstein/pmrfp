import { beforeEach, expect, it, vi } from "vitest";
import { openExistingDashboardSession } from "@/lib/auth/google-dashboard-session";

const f = vi.hoisted(() => ({
  enabled: vi.fn(),
  profile: vi.fn(),
  owner: vi.fn(),
  factors: vi.fn(),
  issue: vi.fn(),
  redeem: vi.fn(),
  signOut: vi.fn(),
  load: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock("@/lib/auth/vps-google", () => ({ googleDashboardBridgeEnabled: f.enabled }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: f.profile }) }) }),
    auth: { admin: { getUserById: f.owner, generateLink: f.issue, mfa: { listFactors: f.factors } } },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { verifyOtp: f.redeem, signOut: f.signOut } }) }));
vi.mock("@/lib/access/access", () => ({ loadSessionContext: f.load }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { setSession: f.setSession } }) }));

const id = "b91b7c26-3f35-4328-b2bb-397eff208ca7";
const email = "contractor@example.invalid";
const user = { id, email, email_confirmed_at: "2026-11-26T12:00:00Z" };
const credentials = { access_token: "fixture-access", refresh_token: "fixture-refresh" };
const profile = { id, status: "active", primary_role: "trade" };

beforeEach(() => {
  vi.resetAllMocks();
  f.enabled.mockReturnValue(true);
  f.profile.mockResolvedValue({ data: profile });
  f.owner.mockResolvedValue({ data: { user } });
  f.factors.mockResolvedValue({ data: { factors: [] } });
  f.issue.mockResolvedValue({ data: { user, properties: { hashed_token: "fixture-exchange" } } });
  f.redeem.mockResolvedValue({ data: { user, session: credentials } });
  f.load.mockResolvedValue({ userId: id, profile });
  f.setSession.mockResolvedValue({ data: { user } });
});

it("sets browser cookies only for the same existing verified source account", async () => {
  await expect(openExistingDashboardSession(email)).resolves.toMatchObject({ userId: id });
  expect(f.issue).toHaveBeenCalledWith({ type: "magiclink", email });
  expect(f.redeem).toHaveBeenCalledWith({ type: "magiclink", token_hash: "fixture-exchange" });
  expect(f.setSession).toHaveBeenCalledExactlyOnceWith(credentials);
});

it("leaves existing MFA, bans, administrator sign-in, and unknown accounts on their current paths", async () => {
  f.factors.mockResolvedValueOnce({ data: { factors: [{ status: "verified" }] } });
  await expect(openExistingDashboardSession(email)).resolves.toBeNull();
  f.owner.mockResolvedValueOnce({ data: { user: { ...user, banned_until: "2050-12-01T12:00:00Z" } } });
  await expect(openExistingDashboardSession(email)).resolves.toBeNull();
  f.profile.mockResolvedValueOnce({ data: { ...profile, primary_role: "admin" } });
  await expect(openExistingDashboardSession(email)).resolves.toBeNull();
  f.profile.mockResolvedValueOnce({ data: null });
  await expect(openExistingDashboardSession(email)).resolves.toBeNull();
  expect(f.issue).not.toHaveBeenCalled();
  expect(f.setSession).not.toHaveBeenCalled();
});

it("rejects a changed account identity before browser session cookies are set", async () => {
  f.issue.mockResolvedValueOnce({ data: { user: { ...user, id: "other" }, properties: { hashed_token: "fixture-exchange" } } });
  await expect(openExistingDashboardSession(email)).resolves.toBeNull();
  expect(f.redeem).not.toHaveBeenCalled();
  expect(f.setSession).not.toHaveBeenCalled();
});
