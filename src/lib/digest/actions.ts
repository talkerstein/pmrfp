"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { getCategories } from "@/lib/data/taxonomy";
import { getSessionUserId } from "@/lib/access/access";
import { sendDigestEmail } from "@/lib/email/send";
import { SITE } from "@/lib/site";
import { regionName } from "@/i18n/terms";
import { CONFIRM_RESEND_MS, CONSENT_VERSION, newConfirmToken, parseDigestSignup, weeklyDigestEnabled, type DigestSignupError } from "./config";
import { renderConfirmEmail } from "./build";

/**
 * Free weekly email sign-up (double opt-in). The form only renders when
 * WEEKLY_DIGEST_ENABLED is on, and this refuses when it's off.
 *
 * The answer is the same whatever the address's state ("check your inbox"),
 * so the form never reveals who is subscribed. Only a new, pending or
 * unsubscribed address gets a confirmation email, at most one per 10
 * minutes; an active, bounced or suppressed one gets nothing.
 */

export interface DigestSignupState {
  ok?: boolean;
  email?: string;
  error?: DigestSignupError | "rate" | "off" | "failed";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function subscribeDigestAction(_prev: DigestSignupState, formData: FormData): Promise<DigestSignupState> {
  if (!weeklyDigestEnabled()) return { error: "off" };
  // Honeypot: bots fill every field. Pretend it worked.
  if (String(formData.get("company_website") ?? "")) return { ok: true, email: String(formData.get("email") ?? "") };
  if (await checkRateLimitByIp(await clientIp(), "contact")) return { error: "rate" };

  const categories = await getCategories().catch(() => []);
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
    new Set(categories.map((c) => c.slug)),
  );
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const done: DigestSignupState = { ok: true, email: v.email };
  if (!isServiceConfigured()) return { error: "failed" };

  const db = createServiceClient();
  const key = v.email.toLowerCase();
  const [{ data: existing }, { data: suppressed }] = await Promise.all([
    db.from("digest_subscribers").select("id,status,confirm_sent_at").eq("email_key", key).maybeSingle<{ id: string; status: string; confirm_sent_at: string | null }>(),
    db.from("email_suppressions").select("email_key").eq("email_key", key).maybeSingle(),
  ]);
  if (suppressed || existing?.status === "bounced" || existing?.status === "active") return done;
  if (existing?.status === "pending" && existing.confirm_sent_at && Date.now() - Date.parse(existing.confirm_sent_at) < CONFIRM_RESEND_MS) return done;

  const { token, hash } = newConfirmToken();
  const now = new Date().toISOString();
  const userId = await getSessionUserId().catch(() => null);
  const row = {
    email: v.email,
    country: v.country,
    province: v.province,
    trades: v.trades,
    lang: v.lang,
    status: "pending",
    confirm_token_hash: hash,
    confirm_sent_at: now,
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

  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const confirmUrl = `${base}/api/digest/confirm?s=${encodeURIComponent(saved.id)}&t=${encodeURIComponent(token)}`;
  await sendDigestEmail(v.email, renderConfirmEmail(v.lang, { confirmUrl, placeName: regionName(v.province, v.lang), contactEmail: SITE.email }), v.lang);
  return done;
}
