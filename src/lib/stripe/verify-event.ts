import type Stripe from "stripe";

const EVENT_ID = /^evt_[A-Za-z0-9]+$/;

/**
 * Turn a webhook request into a trusted Stripe event.
 *
 * 1. Signature check with STRIPE_WEBHOOK_SECRET (the normal path).
 * 2. If that fails (the secret in the environment doesn't match the endpoint,
 *    which is what rejected every delivery in Sept 2026), never trust the
 *    posted body: take only its event id and fetch the event from Stripe with
 *    our API key. A forged id doesn't exist in our account and is rejected;
 *    a real id returns Stripe's own copy of the event.
 *
 * Returns null when the event can't be verified either way.
 */
export async function verifyStripeEvent(
  stripe: Stripe,
  body: string,
  signature: string | null,
  secret: string | undefined,
): Promise<{ event: Stripe.Event; via: "signature" | "api" } | null> {
  if (secret && signature) {
    try {
      return { event: stripe.webhooks.constructEvent(body, signature, secret), via: "signature" };
    } catch {
      // fall through to the API lookup
    }
  }

  let id: unknown;
  try {
    id = (JSON.parse(body) as { id?: unknown }).id;
  } catch {
    return null;
  }
  if (typeof id !== "string" || !EVENT_ID.test(id)) return null;

  try {
    return { event: await stripe.events.retrieve(id), via: "api" };
  } catch (err) {
    console.error("[stripe webhook] event lookup failed:", (err as Error).message);
    return null;
  }
}
