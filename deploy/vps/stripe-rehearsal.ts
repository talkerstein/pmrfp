import { createServer } from "node:http";
import Stripe from "stripe";
import { D1ApiError } from "../../src/lib/d1/contracts";
import { rehearseD1TradeCheckout } from "../../src/lib/stripe/d1-rehearsal";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^(sk|rk)_test_/.test(key) || !process.env.STRIPE_WEBHOOK_SECRET ||
    !process.env.PMRFP_STRIPE_BILLING_GATEWAY_SECRET) {
  throw new Error("Isolated sandbox billing settings required");
}

const route = "/api/stripe/rehearsal/webhook";
const stripe = new Stripe(key);
createServer(async (req, res) => {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json");
  try {
    if (req.method === "GET" && req.url === "/api/stripe/rehearsal/health") {
      return res.end(JSON.stringify({ mode: "stripe-sandbox" }));
    }
    if (req.method !== "POST" || req.url !== route) throw new D1ApiError(404, "not_found");
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") throw new D1ApiError(400, "missing_signature");
    const parts = [];
    let size = 0;
    for await (const data of req) {
      size += data.length;
      if (size > 128 * 1024) throw new D1ApiError(413, "request_too_large");
      parts.push(data);
    }
    const result = await rehearseD1TradeCheckout(stripe, Buffer.concat(parts).toString("utf8"), signature);
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error instanceof D1ApiError ? error.status : 503;
    res.end(JSON.stringify({ error: error instanceof D1ApiError ? error.code : "rehearsal_unavailable" }));
  }
}).listen(4319, "0.0.0.0");
