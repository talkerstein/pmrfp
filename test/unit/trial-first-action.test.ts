import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// next/navigation.redirect throws in the real app; here it throws the target so a test can read it.
class Redirect extends Error {
  constructor(public to: string) {
    super(`REDIRECT ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, isServiceConfigured: () => true }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const state = vi.hoisted(() => ({ session: null as unknown, startResult: { ok: true } as unknown, started: [] as unknown[], events: [] as unknown[] }));
vi.mock("@/lib/access/access", () => ({ getSession: async () => state.session }));
vi.mock("@/lib/analytics", () => ({
  EVENT: { TRIAL_STARTED: "trial_started" },
  trackEvent: async (...args: unknown[]) => void state.events.push(args),
}));
vi.mock("@/lib/entitlement/server", async () => {
  const real = await vi.importActual<typeof import("@/lib/entitlement/server")>("@/lib/entitlement/server");
  return {
    ...real,
    startOrgTrial: async (_s: unknown, source: string) => {
      state.started.push(source);
      return state.startResult;
    },
  };
});

import { startTrialAction } from "@/lib/entitlement/actions";
import { startOrgTrial } from "@/lib/entitlement/server";
import { NO_TRIAL, trialEndsAt, trialState } from "@/lib/entitlement/trial";
import type { SessionContext } from "@/lib/access/access";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const run = async (o: Record<string, string>): Promise<string> => {
  try {
    await startTrialAction(form(o));
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  throw new Error("no redirect");
};
const session = (over: Partial<SessionContext> = {}): SessionContext =>
  ({
    userId: "u1",
    profile: { primary_role: "trade", onboarding_completed: true },
    organization: { id: "o1", organization_type: "trade_company", status: "active", profile_status: "approved" },
    hasTradeAccess: false,
    paid: false,
    trial: NO_TRIAL,
    ...over,
  }) as unknown as SessionContext;

beforeEach(() => {
  state.session = session();
  state.startResult = { ok: true, trial: trialState({ startedAt: "2026-10-26T00:00:00Z", endsAt: "2026-11-09T00:00:00Z" }, new Date("2026-10-26T01:00:00Z")) };
  state.started = [];
  state.events = [];
});

describe("the one-click trial action", () => {
  it("starts the trial, records trial_started with the source, and returns to the same page with ?trial=started", async () => {
    const to = await run({ source: "listing", return: "/rfps/roof-1", lang: "en" });
    expect(to).toBe("/rfps/roof-1?trial=started");
    expect(state.started).toEqual(["listing"]);
    expect(state.events[0]).toEqual(["trial_started", { source: "listing" }, expect.anything()]);
  });
  it("keeps the language on the way back", async () => {
    expect(await run({ source: "benchmark", return: "/benchmarks/roofing/ontario", lang: "fr" })).toBe("/fr/benchmarks/roofing/ontario?trial=started");
  });
  it("with no return path, lands on the dashboard flash as before", async () => {
    expect(await run({ source: "dashboard", lang: "en" })).toBe("/dashboard?trial=started");
  });
  it("an unsafe return path is ignored (no open redirect)", async () => {
    expect(await run({ source: "gate", return: "https://evil.example/x", lang: "en" })).toBe("/dashboard?trial=started");
    expect(await run({ source: "gate", return: "//evil.example", lang: "en" })).toBe("/dashboard?trial=started");
  });
  it("an unknown source is recorded as the default, never as the raw text", async () => {
    await run({ source: "<script>", return: "/rfps/a", lang: "en" });
    expect(state.started).toEqual(["dashboard"]);
  });
  it("already used or already paying: back to the page, nothing recorded", async () => {
    state.startResult = { ok: false, reason: "used" };
    expect(await run({ source: "gate", return: "/rfps/a", lang: "en" })).toBe("/rfps/a");
    state.startResult = { ok: false, reason: "paid" };
    expect(await run({ source: "gate", return: "/rfps/a", lang: "en" })).toBe("/rfps/a");
    expect(state.events).toEqual([]);
  });
  it("ineligible (property manager, held, no company): the dashboard says why", async () => {
    state.startResult = { ok: false, reason: "role" };
    expect(await run({ source: "gate", return: "/rfps/a", lang: "en" })).toBe("/dashboard?trial=role");
    state.startResult = { ok: false, reason: "held" };
    expect(await run({ source: "gate", return: "/rfps/a", lang: "en" })).toBe("/dashboard?trial=held");
    state.startResult = { ok: false, reason: "org" };
    expect(await run({ source: "gate", lang: "en" })).toBe("/dashboard?trial=org");
    expect(state.events).toEqual([]);
  });
  it("signed out: sign-up for the trial, which resumes into it after onboarding", async () => {
    state.session = null;
    expect(await run({ source: "listing", return: "/rfps/roof-1", lang: "en" })).toBe("/sign-up?role=trade&plan=trial&source=listing&return=%2Frfps%2Froof-1");
    expect(await run({ source: "pricing", lang: "es" })).toBe("/es/sign-up?role=trade&plan=trial&source=pricing");
    expect(state.started).toEqual([]);
  });
});

/** A just-enough Supabase stand-in for startOrgTrial: one trade_trials table. */
function fakeDb(existing: { started_at: string; ends_at: string } | null, insertError: { code?: string; message?: string } | null = null) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => {
      if (table !== "trade_trials") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: insertError };
        },
      };
    },
  };
  return { db: db as never, inserted };
}

// The mocked module hides the real startOrgTrial above; load the real one for these cases.
describe("startOrgTrial (the server-side checks behind the button)", () => {
  const NOW = new Date("2026-10-26T12:00:00.000Z");
  let real: typeof import("@/lib/entitlement/server").startOrgTrial;
  beforeEach(async () => {
    real = (await vi.importActual<typeof import("@/lib/entitlement/server")>("@/lib/entitlement/server")).startOrgTrial;
  });
  it("eligible: inserts one row with the source and a 14-day window", async () => {
    const { db, inserted } = fakeDb(null);
    const r = await real(session(), "missed_bids", NOW, db);
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ organization_id: "o1", started_by: "u1", source: "missed_bids", started_at: NOW.toISOString(), ends_at: trialEndsAt(NOW).toISOString() });
  });
  it("a trade company still in review (pending_review) can", async () => {
    const { db } = fakeDb(null);
    const s = session({ organization: { id: "o1", organization_type: "trade_company", status: "active", profile_status: "pending_review" } as never });
    expect((await real(s, "gate", NOW, db)).ok).toBe(true);
  });
  it("ineligible: a property manager gets nothing", async () => {
    const { db, inserted } = fakeDb(null);
    const s = session({ organization: { id: "o2", organization_type: "property_manager", status: "active", profile_status: "approved" } as never });
    expect(await real(s, "gate", NOW, db)).toEqual({ ok: false, reason: "role" });
    expect(inserted).toEqual([]);
  });
  it("already used: a running or an ended trial blocks a second one", async () => {
    const { db, inserted } = fakeDb({ started_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-15T00:00:00Z" });
    expect(await real(session(), "gate", NOW, db)).toEqual({ ok: false, reason: "used" });
    expect(inserted).toEqual([]);
  });
  it("a double click loses to the primary key", async () => {
    const { db } = fakeDb(null, { code: "23505", message: "duplicate key value" });
    expect(await real(session(), "gate", NOW, db)).toEqual({ ok: false, reason: "used" });
  });
  it("paying: refused", async () => {
    const { db, inserted } = fakeDb(null);
    expect(await real(session({ paid: true }), "gate", NOW, db)).toEqual({ ok: false, reason: "paid" });
    expect(inserted).toEqual([]);
  });
  it("held: rejected or suspended in review, never a trial", async () => {
    for (const profile_status of ["rejected", "suspended"]) {
      const { db, inserted } = fakeDb(null);
      const s = session({ organization: { id: "o3", organization_type: "trade_company", status: "active", profile_status } as never });
      expect(await real(s, "gate", NOW, db)).toEqual({ ok: false, reason: "held" });
      expect(inserted).toEqual([]);
    }
  });
  it("no session / no company / table missing", async () => {
    const { db } = fakeDb(null);
    expect(await real(null, "gate", NOW, db)).toEqual({ ok: false, reason: "signin" });
    expect(await real(session({ organization: null }), "gate", NOW, db)).toEqual({ ok: false, reason: "org" });
    const missing = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }) }) }) }) } as never;
    expect(await real(session(), "gate", NOW, missing)).toEqual({ ok: false, reason: "unavailable" });
  });
});

void startOrgTrial;
