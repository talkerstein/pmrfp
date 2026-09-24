import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSessionContext } from "@/lib/access/access";
import {
  getSessionFromRequest,
  MAX_BEARER_LENGTH,
  parseBearerHeader,
  type RequestSessionDeps,
} from "@/lib/access/request-session";

// A JWT-shaped string (header.payload.signature, base64url). Never verified
// here: the fake auth client decides whether it's "valid".
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";
const USER = "11111111-2222-4333-8444-555555555555";
const ORG = "99999999-2222-4333-8444-555555555555";

describe("parseBearerHeader", () => {
  it("treats a missing or blank header as no bearer", () => {
    expect(parseBearerHeader(null)).toEqual({ kind: "none" });
    expect(parseBearerHeader(undefined)).toEqual({ kind: "none" });
    expect(parseBearerHeader("   ")).toEqual({ kind: "none" });
  });

  it("accepts Bearer <jwt>, any case, surrounding space", () => {
    expect(parseBearerHeader(`Bearer ${TOKEN}`)).toEqual({ kind: "token", token: TOKEN });
    expect(parseBearerHeader(`bearer ${TOKEN}`)).toEqual({ kind: "token", token: TOKEN });
    expect(parseBearerHeader(`  BEARER   ${TOKEN}  `)).toEqual({ kind: "token", token: TOKEN });
  });

  it("rejects other schemes and non-JWT tokens", () => {
    expect(parseBearerHeader(`Basic ${TOKEN}`).kind).toBe("invalid");
    expect(parseBearerHeader("Bearer").kind).toBe("invalid");
    expect(parseBearerHeader("Bearer abc").kind).toBe("invalid");
    expect(parseBearerHeader("Bearer a.b").kind).toBe("invalid");
    expect(parseBearerHeader("Bearer a.b.c.d").kind).toBe("invalid");
    expect(parseBearerHeader(`Bearer ${TOKEN} extra`).kind).toBe("invalid");
    expect(parseBearerHeader("Bearer a+b.c/d.e=").kind).toBe("invalid");
    expect(parseBearerHeader(`Bearer${TOKEN}`).kind).toBe("invalid");
  });

  it("rejects absurdly long tokens before they reach the auth server", () => {
    const long = `${"a".repeat(MAX_BEARER_LENGTH)}.b.c`;
    expect(parseBearerHeader(`Bearer ${long}`).kind).toBe("invalid");
  });
});

// ── Fake Supabase client ────────────────────────────────────────────────

type Rows = Record<string, Record<string, unknown> | null>;

/**
 * Just enough of SupabaseClient for loadSessionContext:
 * auth.getUser(token?) and from(table).select().eq().maybeSingle().
 */
function fakeClient(opts: { user: { id: string; email?: string } | null; acceptToken?: string; rows?: Rows }) {
  const getUser = vi.fn(async (token?: string) => {
    const ok = opts.user && (opts.acceptToken === undefined || token === opts.acceptToken);
    return ok ? { data: { user: opts.user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
  });
  const from = vi.fn((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: opts.rows?.[table] ?? null, error: null }),
    };
    return chain;
  });
  return { client: { auth: { getUser }, from } as unknown as SupabaseClient, getUser, from };
}

const tradeRows: Rows = {
  users_profile: { id: USER, email: "pat@northline.ca", primary_role: "trade", status: "active" },
  organization_members: { organization_id: ORG },
  organizations: {
    id: ORG,
    name: "Northline Electrical",
    organization_type: "trade_company",
    status: "active",
    profile_status: "approved",
  },
  subscriptions: { status: "active", tier: "pro" },
};

function deps(over: Partial<RequestSessionDeps> & { bearer?: SupabaseClient; cookie?: SupabaseClient }): RequestSessionDeps {
  return {
    configured: () => true,
    cookieClient: vi.fn(async () => over.cookie ?? fakeClient({ user: null }).client),
    bearerClient: vi.fn(() => over.bearer ?? fakeClient({ user: null }).client),
    load: loadSessionContext,
    ...over,
  };
}

const req = (headers: Record<string, string> = {}) => new Request("https://pmrfp.com/api/projects", { headers });

describe("getSessionFromRequest", () => {
  it("bearer: verifies the token with Supabase Auth and loads the same context", async () => {
    const bearer = fakeClient({ user: { id: USER }, acceptToken: TOKEN, rows: tradeRows });
    const d = deps({ bearer: bearer.client });
    const res = await getSessionFromRequest(req({ Authorization: `Bearer ${TOKEN}` }), d);

    expect(d.bearerClient).toHaveBeenCalledWith(TOKEN);
    expect(bearer.getUser).toHaveBeenCalledWith(TOKEN);
    expect(d.cookieClient).not.toHaveBeenCalled();
    expect(res?.via).toBe("bearer");
    expect(res?.db).toBe(bearer.client);
    expect(res?.session.userId).toBe(USER);
    expect(res?.session.organization?.id).toBe(ORG);
    expect(res?.session.hasTradeAccess).toBe(true);
  });

  it("bearer: a token Auth rejects gets null, with no cookie fallback", async () => {
    const bearer = fakeClient({ user: { id: USER }, acceptToken: "someone-else", rows: tradeRows });
    const cookie = fakeClient({ user: { id: USER }, rows: tradeRows });
    const d = deps({ bearer: bearer.client, cookie: cookie.client });
    expect(await getSessionFromRequest(req({ Authorization: `Bearer ${TOKEN}` }), d)).toBeNull();
    expect(d.cookieClient).not.toHaveBeenCalled();
    expect(bearer.from).not.toHaveBeenCalled();
  });

  it("malformed Authorization header: null without touching any client", async () => {
    const cookie = fakeClient({ user: { id: USER }, rows: tradeRows });
    const d = deps({ cookie: cookie.client });
    expect(await getSessionFromRequest(req({ Authorization: "Basic dXNlcjpwYXNz" }), d)).toBeNull();
    expect(await getSessionFromRequest(req({ Authorization: "Bearer not-a-jwt" }), d)).toBeNull();
    expect(d.bearerClient).not.toHaveBeenCalled();
    expect(d.cookieClient).not.toHaveBeenCalled();
  });

  it("no header: uses the cookie session exactly as getSession does", async () => {
    const cookie = fakeClient({ user: { id: USER }, rows: tradeRows });
    const d = deps({ cookie: cookie.client });
    const res = await getSessionFromRequest(req(), d);
    expect(d.bearerClient).not.toHaveBeenCalled();
    expect(cookie.getUser).toHaveBeenCalledWith(undefined);
    expect(res?.via).toBe("cookie");
    expect(res?.db).toBe(cookie.client);
    expect(res?.session.organization?.name).toBe("Northline Electrical");
  });

  it("no header and no cookie session: null", async () => {
    expect(await getSessionFromRequest(req(), deps({}))).toBeNull();
  });

  it("SEO-tier subscription doesn't count as trade access (same rule as getSession)", async () => {
    const bearer = fakeClient({
      user: { id: USER },
      rows: { ...tradeRows, subscriptions: { status: "active", tier: "seo" } },
    });
    const res = await getSessionFromRequest(req({ Authorization: `Bearer ${TOKEN}` }), deps({ bearer: bearer.client }));
    expect(res?.session.hasTradeAccess).toBe(false);
  });

  it("returns null when Supabase isn't configured", async () => {
    const d = deps({ configured: () => false });
    expect(await getSessionFromRequest(req({ Authorization: `Bearer ${TOKEN}` }), d)).toBeNull();
    expect(d.bearerClient).not.toHaveBeenCalled();
  });
});
