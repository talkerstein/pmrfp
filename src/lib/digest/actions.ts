"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { getCategories } from "@/lib/data/taxonomy";
import { getSessionUserId } from "@/lib/access/access";
import { emailConfigured, sendDigestEmail } from "@/lib/email/send";
import { SITE } from "@/lib/site";
import { regionName } from "@/i18n/terms";
import { CONSENT_VERSION, decideSubscribe, newConfirmToken, parseDigestSignup, type DigestSignupError, type DigestSignupInput } from "./config";
import { renderConfirmEmail } from "./build";

/**
 * Free weekly email sign-up (double opt-in). Always open: capture is
 * decoupled from sending (see lib/digest/config). The weekly email itself
 * still waits for WEEKLY_DIGEST_ENABLED.
 *
 * The answer is the same whatever the address's state ("check your inbox"),
 * so the form never reveals who is subscribed. Only a new, pending or
 * unsubscribed address gets a confirmation email, at most one per 10
 * minutes; an active, bounced or suppressed one gets nothing.
 *
 * When email can't send yet (no RESEND_API_KEY) the sign-up is stored as
 * pending and the answer says so ("held": check back), so nobody waits for
 * a link that isn't coming.
 */

export interface DigestSignupState {
  ok?: boolean;
  email?: string;
  /** Saved, but no confirmation email could go out yet. */
  held?: boolean;
  error?: DigestSignupError | "rate" | "off" | "failed";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Store (or refresh) one pending sign-up and send its confirmation when email can send. */
async function savePendingSubscriber(v: DigestSignupInput): Promise<DigestSignupState> {
  const emailReady = emailConfigured();
  const done: DigestSignupState = { ok: true, email: v.email, ...(emailReady ? {} : { held: true }) };
  if (!isServiceConfigured()) return { error: "failed" };

  const db = createServiceClient();
  const key = v.email.toLowerCase();
  const [{ data: existing }, { data: suppressed }] = await Promise.all([
    db
      .from("digest_subscribers")
      .select("id,status,confirm_sent_at,trades")
      .eq("email_key", key)
      .maybeSingle<{ id: string; status: string; confirm_sent_at: string | null; trades: string[] | null }>(),
    db.from("email_suppressions").select("email_key").eq("email_key", key).maybeSingle(),
  ]);
  const decision = decideSubscribe(existing ?? null, Boolean(suppressed), v.trades, emailReady);
  if (decision.kind === "skip") return done;

  const { token, hash } = newConfirmToken();
  const now = new Date().toISOString();
  const userId = await getSessionUserId().catch(() => null);
  const row = {
    email: v.email,
    country: v.country,
    province: v.province,
    trades: decision.trades,
    lang: v.lang,
    status: "pending",
    confirm_token_hash: hash,
    // No sent time = the token can't validate (it was never emailed).
    confirm_sent_at: decision.sendConfirm ? now : null,
    source: v.source,
    consent_text_version: CONSENT_VERSION,
    consent_at: now,
    updated_at: now,
    ...(userId ? { user_id: userId } : {}),
  };
  const { data: saved, error } = existing
    ? await db.from("digest_subscribers").update(row).eq("id", existing.id).select("id").single<{ id: string }>()
    : await db.from("digest_subscribers").insert(row).select("id").single<{ id: string }>();
  if (error || !saved) {
    console.error("[digest] sign-up failed:", error?.message);
    return { error: "failed" };
  }
  if (!decision.sendConfirm) return done;

  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const confirmUrl = `${base}/api/digest/confirm?s=${encodeURIComponent(saved.id)}&t=${encodeURIComponent(token)}`;
  await sendDigestEmail(v.email, renderConfirmEmail(v.lang, { confirmUrl, placeName: regionName(v.province, v.lang), contactEmail: SITE.email }), v.lang);
  return done;
}

async function validTradeSlugs(): Promise<Set<string>> {
  const categories = await getCategories().catch(() => []);
  return new Set(categories.map((c) => c.slug));
}

export async function subscribeDigestAction(_prev: DigestSignupState, formData: FormData): Promise<DigestSignupState> {
  // Honeypot: bots fill every field. Pretend it worked.
  if (String(formData.get("company_website") ?? "")) return { ok: true, email: String(formData.get("email") ?? "") };
  if (await checkRateLimitByIp(await clientIp(), "contact")) return { error: "rate" };

  const parsed = parseDigestSignup(
    {
      email: formData.get("email"),
      country: formData.get("country"),
      province: formData.get("province"),
      trades: formData.getAll("trades"),
      lang: formData.get("lang"),
      consent: formData.get("consent"),
      source: formData.get("source"),
    },
    await validTradeSlugs(),
  );
  if (!parsed.ok) return { error: parsed.error };
  return savePendingSubscriber(parsed.value);
}
