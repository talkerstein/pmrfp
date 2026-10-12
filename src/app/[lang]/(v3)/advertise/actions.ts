"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminContactEmail } from "@/lib/email/send";
import { upsertGhlContact } from "@/lib/ghl/client";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { getCategories } from "@/lib/data/taxonomy";
import { getSponsorSnapshot } from "@/lib/sponsors/data";
import { normalizeRegion, regionCountryOf, slotState, sponsorSlug, torontoDay, hash } from "@/lib/sponsors/model";
import { SPONSOR_PRODUCT, parseTierParam, sponsorPrice, sponsorStripePrice, type SponsorTier } from "@/lib/sponsors/pricing";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * /advertise: a sponsorship enquiry (always), or a card checkout for a
 * monthly slot (only when that tier's Stripe Price ID is set for the
 * visitor's currency, lib/sponsors/pricing). Both answer with a code the
 * form translates (v3Pages.advertise.form.errors).
 *
 * Enquiries go where bid-help requests go: contact_requests (admin inbox),
 * an admin email and GHL. A paid checkout also creates a draft sponsor row;
 * the Stripe webhook marks it pending (paid, slot held) and an admin reviews
 * the message before it goes live.
 */

export type SponsorFormError =
  | "name"
  | "email"
  | "company"
  | "rateLimited"
  | "trade"
  | "where"
  | "website"
  | "taken"
  | "payOff"
  | "payFailed"
  | "other";

export interface SponsorEnquiryState {
  error?: SponsorFormError;
  success?: "sent" | "honeypot";
}

const schema = z.object({
  name: z.string().trim().min(1, "name").max(120),
  email: z.string().trim().email("email"),
  company: z.string().trim().min(1, "company").max(160),
  website: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  tier: z.string().trim().max(20).optional(),
  trade: z.string().trim().max(60).optional(),
  where: z.string().trim().max(60).optional(),
  country: z.enum(["CA", "US"]).catch("CA"),
  message: z.string().trim().max(2000).optional(),
});

type Parsed = z.infer<typeof schema> & { tierValue: SponsorTier | "unsure"; region: string | null };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
}

async function parse(formData: FormData): Promise<{ ok: true; d: Parsed } | { ok: false; error: SponsorFormError } | { ok: false; honeypot: true }> {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  // Honeypot: bots fill every field. Pretend it worked.
  if (text("company_website")) return { ok: false, honeypot: true };
  if (await checkRateLimitByIp(await clientIp(), "contact")) return { ok: false, error: "rateLimited" };
  const parsed = schema.safeParse({
    name: text("name") ?? "",
    email: text("email") ?? "",
    company: text("company") ?? "",
    website: text("website"),
    phone: text("phone"),
    tier: text("tier"),
    trade: text("trade"),
    where: text("where"),
    country: text("country"),
    message: text("message"),
  });
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { ok: false, error: code === "name" || code === "email" || code === "company" ? code : "other" };
  }
  const d = parsed.data;
  const region = d.where && d.where !== "*" ? normalizeRegion(d.where) : null;
  // Canada and the U.S. are never mixed: a province from the other country is no answer.
  if (region && regionCountryOf(region) !== d.country) return { ok: false, error: "where" };
  return { ok: true, d: { ...d, tierValue: parseTierParam(d.tier), region } };
}

function summary(d: Parsed, extra?: string): string {
  const tier = d.tierValue === "unsure" ? null : d.tierValue;
  const price = tier ? sponsorPrice(tier, d.country) : null;
  return [
    `[Sponsorship] ${tier ? `${tier} (${price!.currency} ${price!.amount}/mo)` : "Tier not chosen yet"} · ${d.country}`,
    `Company: ${d.company}`,
    d.website ? `Website: ${d.website}` : null,
    d.trade ? `Trade: ${d.trade}` : null,
    d.region ? `Province/state: ${d.region}` : d.where === "*" ? "Where: national" : null,
    d.phone ? `Phone: ${d.phone}` : null,
    extra ?? null,
    d.message ? `\n${d.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function notify(d: Parsed, message: string, tags: string[]) {
  if (isServiceConfigured()) {
    const { error } = await createServiceClient().from("contact_requests").insert({
      request_type: "general_contact",
      requester_name: d.name,
      requester_email: d.email,
      requester_phone: d.phone ?? null,
      requester_organization: d.company,
      message,
    });
    if (error) console.error("[advertise] contact_requests insert failed:", error.message);
  }
  const [firstName, ...rest] = d.name.split(/\s+/);
  await Promise.allSettled([
    sendAdminContactEmail({
      name: esc(d.name),
      email: esc(d.email),
      requestType: "SPONSORSHIP",
      message: esc(message).replace(/\n/g, "<br/>"),
    }),
    upsertGhlContact({
      email: d.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone: d.phone,
      tags,
      customFields: { pmrfp_org_name: d.company },
    }),
  ]);
}

export async function submitSponsorEnquiry(_prev: SponsorEnquiryState, formData: FormData): Promise<SponsorEnquiryState> {
  const p = await parse(formData);
  if (!p.ok) return "honeypot" in p ? { success: "honeypot" } : { error: p.error };
  const d = p.d;
  await notify(d, summary(d), ["pmrfp-sponsor-lead", `pmrfp-sponsor-${d.tierValue}`, `pmrfp-sponsor-${d.country.toLowerCase()}`]);
  return { success: "sent" };
}

function httpsUrl(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    u.protocol = "https:";
    return u.hostname.includes(".") ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

/**
 * Card checkout for one monthly slot. Checks the slot is free, creates a
 * draft sponsor row (holds nothing until paid), and sends the buyer to
 * Stripe Checkout with the env-configured recurring Price. No Stripe object
 * is created here except the Checkout Session itself.
 */
export async function startSponsorCheckout(_prev: SponsorEnquiryState, formData: FormData): Promise<SponsorEnquiryState> {
  const p = await parse(formData);
  if (!p.ok) return "honeypot" in p ? { success: "honeypot" } : { error: p.error };
  const d = p.d;
  if (d.tierValue === "unsure") return { error: "payOff" };
  const tier = d.tierValue;
  const priceId = sponsorStripePrice(tier, d.country);
  if (!priceId || !process.env.STRIPE_SECRET_KEY || !isServiceConfigured()) return { error: "payOff" };

  const categories = await getCategories().catch(() => []);
  const trade = categories.find((c) => c.slug === d.trade);
  if (!trade) return { error: "trade" };
  if (tier !== "national" && !d.region) return { error: "where" };
  const url = httpsUrl(d.website);
  if (!url) return { error: "website" };

  const state = slotState({ country: d.country, trade: trade.slug, region: tier === "national" ? "*" : d.region!, tier }, await getSponsorSnapshot(), torontoDay());
  if (state.taken) return { error: "taken" };

  const svc = createServiceClient();
  const price = sponsorPrice(tier, d.country);
  // A unique, readable /go slug: the company name, plus a short suffix.
  const slug = `${sponsorSlug(d.company).slice(0, 33)}-${(hash(`${d.email}|${Date.now()}`) % 46656).toString(36).padStart(3, "0")}`;
  const { data: row, error } = await svc
    .from("sponsors")
    .insert({
      slug,
      name: d.company,
      url,
      tier,
      country: d.country,
      trades: [trade.slug],
      regions: tier === "national" ? [] : [d.region],
      status: "draft",
      monthly_price: price.amount,
      currency: price.currency,
      contact_name: d.name,
      contact_email: d.email,
      notes: d.message ? `From /advertise checkout:\n${d.message}`.slice(0, 4000) : "From /advertise checkout.",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) {
    console.error("[advertise] sponsor draft insert failed:", error?.message);
    return { error: "payFailed" };
  }

  let checkoutUrl: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: d.email,
      metadata: { product: SPONSOR_PRODUCT, sponsor_id: row.id, tier, country: d.country },
      subscription_data: {
        description: `PMRFP sponsorship: ${trade.name}${d.region ? ` · ${d.region}` : ` · ${d.country === "US" ? "U.S." : "Canada"}`}`,
        metadata: { product: SPONSOR_PRODUCT, sponsor_id: row.id },
      },
      success_url: `${SITE_URL}/advertise?paid=1#enquire`,
      cancel_url: `${SITE_URL}/advertise?tier=${tier}#enquire`,
    });
    checkoutUrl = session.url;
    await svc.from("sponsors").update({ stripe_checkout_session_id: session.id }).eq("id", row.id);
    await trackEvent(EVENT.CHECKOUT_STARTED, { plan: `sponsor_${tier}`, market: d.country });
  } catch (e) {
    console.error("[advertise] sponsor checkout failed:", e instanceof Error ? e.message : e);
  }
  if (!checkoutUrl) return { error: "payFailed" };
  await notify(d, summary(d, `Checkout started (sponsor ${row.id}). Not paid yet.`), ["pmrfp-sponsor-checkout", `pmrfp-sponsor-${tier}`]);
  redirect(checkoutUrl);
}
