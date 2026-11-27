import { D1ApiError, readD1Json, type D1Binding } from "../../src/lib/d1/contracts";
import { verifyGateway } from "./auth";
import { readCustomerSession } from "./customer-session";
import { applyPaidTradeCheckout, applyRecurringSubscriptionState } from "./stripe-subscription";

const fixtureUser = "5da718a5-f971-4944-a61b-8734c0767d29";
type Env = Parameters<typeof applyPaidTradeCheckout>[1] & { MODE: string; APP_DB: D1Binding };

export default {
  async fetch(request: Request, env: Env) {
    const headers = { "cache-control": "no-store" };
    try {
      if (env.MODE !== "stripe-fixtures-only") throw new D1ApiError(404, "not_found");
      const url = new URL(request.url);
      if (url.protocol !== "https:" || url.search) throw new D1ApiError(404, "not_found");
      await verifyGateway(request.headers.get("x-pmrfp-stripe-gateway"), env.STRIPE_BILLING_GATEWAY_SECRET);
      const fixture = await env.APP_DB.prepare(
        "SELECT 1 AS ok FROM _billing_rehearsal WHERE id=1 AND mode='stripe-fixtures-only'",
      ).first<{ ok: number }>();
      if (fixture?.ok !== 1) throw new D1ApiError(503, "fixture_database_required");
      const write = url.pathname === "/v1/billing/paid-trade-checkout" ? applyPaidTradeCheckout :
        url.pathname === "/v1/billing/rehearsal/subscription-state" ? applyRecurringSubscriptionState : null;
      if (write) {
        const clone = request.clone();
        const body = await readD1Json(clone, 2048) as { userId?: string } | null;
        if (body?.userId !== fixtureUser) throw new D1ApiError(400, "fixture_user_required");
        return Response.json(await write(request, env), { headers });
      }
      if (url.pathname === "/v1/billing/rehearsal/status" && request.method === "GET") {
        return Response.json({ pro: (await readCustomerSession(env.APP_DB, fixtureUser)).hasTradeAccess }, { headers });
      }
      throw new D1ApiError(404, "not_found");
    } catch (error) {
      return Response.json({ error: error instanceof D1ApiError ? error.code : "rehearsal_unavailable" },
        { status: error instanceof D1ApiError ? error.status : 503, headers });
    }
  },
};
