import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const route = "/api/stripe/webhook";
const receiver = process.env.PMRFP_STRIPE_RECEIVER;
if (receiver !== "d1" && receiver !== "hold") throw new Error("Unexpected Stripe receiver");
const key = process.env.STRIPE_SECRET_KEY ?? "";
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
if (!/^(rk|sk)_live_/.test(key) || !/^whsec_[A-Za-z0-9_-]{16,160}$/.test(secret)) {
  throw new Error("Production Stripe relay configuration is invalid");
}

const events = new Set([
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.payment_failed", "invoice.paid",
  "checkout.session.expired", "checkout.session.async_payment_succeeded",
]);

function signatureParts(header) {
  if (typeof header !== "string" || header.length > 2048) return null;
  const parts = new URLSearchParams(header.replaceAll(",", "&"));
  const timestamp = parts.get("t");
  const signatures = parts.getAll("v1").filter(value => /^[0-9a-f]{64}$/.test(value));
  if (!timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !signatures.length) return null;
  return { timestamp, signatures };
}

function signatureMatches(body, signature) {
  const expected = createHmac("sha256", secret).update(signature.timestamp + ".").update(body).digest();
  return signature.signatures.some(value => timingSafeEqual(expected, Buffer.from(value, "hex")));
}

createServer(async (req, res) => {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json");
  res.setHeader("x-content-type-options", "nosniff");
  const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  const error = (status, code) => reply(status, { error: code });
  try {
    if (req.method === "GET" && req.url === "/api/stripe/live-health") {
      return reply(200, { mode: "production-relay", ready: true, receiver });
    }
    if (req.url !== route) return error(404, "not_found");
    if (req.method !== "POST") return error(405, "method_not_allowed");
    const header = req.headers["stripe-signature"];
    const signature = signatureParts(header);
    if (!signature) return error(400, "invalid_signature_header");
    const parts = [];
    let size = 0;
    for await (const data of req) {
      size += data.length;
      if (size > 1024 * 1024) return error(413, "event_too_large");
      parts.push(data);
    }
    const body = Buffer.concat(parts);
    let id;
    try { id = JSON.parse(body.toString("utf8"))?.id; }
    catch { return error(400, "invalid_event"); }
    if (typeof id !== "string" || !/^evt_[A-Za-z0-9]{1,100}$/.test(id)) return error(400, "invalid_event");
    if (!signatureMatches(body, signature)) return error(400, "invalid_signature");

    // Bind the signed event to the live Stripe account. The D1 writer
    // re-verifies the forwarded delivery before processing it.
    const trusted = await fetch("https://api.stripe.com/v1/events/" + id, {
      headers: { authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(3500),
    });
    if (trusted.status === 404) return error(400, "unknown_event");
    if (!trusted.ok) return error(503, "stripe_verification_unavailable");
    const event = await trusted.json();
    if (event.id !== id || event.livemode !== true || !events.has(event.type)) return error(400, "unsupported_event");
    // A signed delivery during handover must be retried by Stripe.
    if (receiver === "hold") return error(503, "billing_handover_in_progress");
    const upstream = "http://pmrfp-stripe-d1-writer:4322" + route;
    const result = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body, redirect: "error", signal: AbortSignal.timeout(22000),
    });
    if (!result.ok) {
      console.error("Billing receiver rejected", event.type, result.status);
      return error(503, "billing_receiver_unavailable");
    }
    const receipt = await result.json();
    if (receipt?.received !== true) return error(503, "invalid_billing_receipt");
    return reply(200, { received: true, ...(receipt.duplicate === true && { duplicate: true }) });
  } catch {
    return error(503, "billing_relay_unavailable");
  }
}).listen(4321, "0.0.0.0");
