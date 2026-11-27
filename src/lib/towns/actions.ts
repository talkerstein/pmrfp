"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSession, roleHome } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { EVENT, trackEvent } from "@/lib/analytics";
import { cleanEmail } from "@/lib/dedupe/email";
import { existingAccountFor, existingAccountPath } from "@/lib/dedupe/signup";
import { magicLinkRedirect } from "@/lib/auth/magic-link";
import { recordSignupAttribution, recordSignupAttributionForEmail } from "@/lib/attribution/record";
import { findBuyerPage } from "@/lib/buyers/model";
import { DEFAULT_LOCALE, LOCALES, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { claimContext } from "./claim-context";
import { claimableFrom } from "./claimable";
import { submitBuyerClaim } from "./claims";
import { notifyAdminOfClaim } from "@/lib/buyers/admin-notify";
import { changedFields, managedPageSchema, ownLogoUrl, pageUpdateRow, parseBuyerKey, readManagedForm } from "./managed";
import { BUYER_DASHBOARD_PATH, BUYER_PAGE_EDIT_PATH, PUBLIC_BUYER_ROLE, claimOnboardingHref } from "./paths";
import { isVpsLiveCustomerAuth, isVpsNativeAccountSignup } from "@/lib/d1/staging-config";
import { submitVpsBuyerClaim } from "@/lib/d1/vps-buyer-claims";
import { vpsBuyerReviewCounts } from "@/lib/d1/buyer-sources";
import { BUYER_PAGES_TAG } from "@/lib/supabase/public-cache";
import { updateVpsBuyerPage } from "@/lib/d1/vps-buyer-pages";
import { signUpAction } from "@/lib/auth/actions";

/**
 * The public-buyer flow's server actions: sign-up (a passwordless link),
 * the claim at onboarding, and edits to the managed page. Every claim also
 * emails the admin inbox (lib/buyers/admin-notify); claims waiting for
 * review show up at /admin/buyer-sources. The claimant gets no email beyond
 * the sign-in link Supabase sends.
 */

function formLang(fd: FormData): Locale {
  const v = fd.get("lang");
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

/** Every language's copy of a buyer page (ISR): shows a verification or an edit now. */
function revalidateBuyerPage(path: string) {
  for (const l of LOCALES) revalidatePath(`/${l}${path}`);
  if (isVpsLiveCustomerAuth()) revalidateTag(BUYER_PAGES_TAG, { expire: 0 });
}

/** /sign-up?role=public_buyer: email a sign-in link; the claim rides in auth metadata and `next`. */
export async function publicBuyerSignUpAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const rawClaim = String(formData.get("claim") ?? "");
  const claim = parseBuyerKey(rawClaim) ? rawClaim : null;
  const back = (q: Record<string, string>): never =>
    redirect(localizePath(`/sign-up?${new URLSearchParams({ role: PUBLIC_BUYER_ROLE, ...(claim ? { claim } : {}), ...q }).toString()}`, lang));

  if (isVpsNativeAccountSignup()) {
    formData.set("role", PUBLIC_BUYER_ROLE);
    formData.set("method", "link");
    formData.set("next", claimOnboardingHref(claim));
    const response = await signUpAction({}, formData);
    back(response.success ? { sent: "1" } : { error: "failed" });
  }
  if (await checkRateLimitByIp(await clientIp(), "auth")) back({ error: "rate" });
  if (String(formData.get("company_website") ?? "")) back({ sent: "1" }); // honeypot: bots see success
  const email = cleanEmail(String(formData.get("email") ?? ""));
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back({ error: "email" });
  if (!isSupabaseConfigured()) back({ error: "demo" });

  const next = claimOnboardingHref(claim);
  // One account per mailbox: an address that already has one signs in instead.
  const existing = await existingAccountFor(email);
  if (existing) {
    await logAudit({ actorUserId: null, action: "signup.duplicate_blocked", entityType: "user", entityId: existing.id, metadata: { method: "link", role: PUBLIC_BUYER_ROLE } });
    redirect(localizePath(existingAccountPath(next), lang));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { primary_role: PUBLIC_BUYER_ROLE, ...(claim ? { claim_buyer: claim } : {}) },
      emailRedirectTo: magicLinkRedirect(process.env.NEXT_PUBLIC_SITE_URL ?? "", next, lang),
    },
  });
  if (error) {
    console.error("[public-buyer:signup]", error.message);
    back({ error: "failed" });
  }
  // Where the town came from, recorded in this browser (lib/attribution/record).
  await recordSignupAttributionForEmail({ email, method: "magic_link", role: PUBLIC_BUYER_ROLE, lang });
  await trackEvent(EVENT.SIGNUP_COMPLETED, { role: PUBLIC_BUYER_ROLE, hasNext: !!claim, method: "link" });
  back({ sent: "1" });
}

/** Onboarding: "Claim this page". Verified on the spot, sent to review, or turned into a join request. */
export async function claimBuyerPageAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  if (session.profile.primary_role !== PUBLIC_BUYER_ROLE) redirect(localizePath(roleHome(session.profile.primary_role), lang));
  const rawKey = String(formData.get("buyer") ?? "");
  const key = parseBuyerKey(rawKey);
  const fail = (error: string): never => redirect(localizePath(claimOnboardingHref(key ? rawKey : null, { error }), lang));
  if (!key) fail("pick");
  if (formData.get("confirm") !== "on") fail("confirm");
  const fullName = text(formData, "fullName", 120);
  if (!fullName || fullName.length < 2) fail("name");
  const native = isVpsLiveCustomerAuth();
  if (!native && !isServiceConfigured()) fail("failed");
  if (await checkRateLimitByIp(await clientIp(), "contact")) fail("rate");

  const ctx = await claimContext();
  const page = findBuyerPage(ctx.pages, key!.provinceSlug, key!.slug);
  if (!page) fail("pick");
  const buyer = claimableFrom(page!, ctx.trusted.get(rawKey) ?? []);

  const user = native ? { email: session.profile.email, email_confirmed_at: true }
    : (await (await createClient()).auth.getUser()).data.user;
  const email = user?.email;
  if (!email) redirect(localizePath("/sign-in", lang));

  const input = {
    who: {
      userId: session.userId,
      email,
      emailConfirmed: Boolean(user?.email_confirmed_at),
      fullName,
      jobTitle: text(formData, "jobTitle", 120),
      phone: text(formData, "phone", 40),
      note: text(formData, "note", 1000),
    },
    buyer,
    owners: ctx.owners,
    now: new Date().toISOString(),
  };
  const result = native
    ? await submitVpsBuyerClaim(input).catch(() => fail("failed"))
    : await submitBuyerClaim(createServiceClient(), input);
  if (result.status === "error") fail(result.reason);
  await notifyAdminOfClaim(native ? vpsBuyerReviewCounts : createServiceClient(), {
    status: result.status,
    reason: result.status === "pending" ? result.reason : null,
    buyer: { name: buyer.name, key: buyer.key, provinceCode: buyer.provinceCode },
    who: { email, fullName, jobTitle: text(formData, "jobTitle", 120) },
  });
  if (!native) await logAudit({
    actorUserId: session.userId,
    action: `buyer_claim.${result.status}`,
    entityType: "buyer_claims",
    entityId: "claimId" in result ? result.claimId : null,
    metadata: { buyerKey: buyer.key, ...(result.status === "pending" ? { reason: result.reason } : {}) },
  });
  const who = { userId: session.userId, role: PUBLIC_BUYER_ROLE };
  await trackEvent(EVENT.CLAIM_STARTED, { kind: "buyer_page", outcome: result.status }, who);
  // A town that never reached the sign-up form's write (lib/attribution/record) still gets its row.
  await recordSignupAttribution({ userId: session.userId, role: PUBLIC_BUYER_ROLE, lang });
  if (result.status === "verified") {
    revalidateBuyerPage(buyer.path);
    await trackEvent(EVENT.CLAIM_VERIFIED, { kind: "buyer_page" }, who);
    await trackEvent(EVENT.ONBOARDING_COMPLETED, { role: PUBLIC_BUYER_ROLE, verified: true }, who);
  }
  if (result.status === "join_requested") redirect(localizePath("/onboarding", lang));
  redirect(localizePath(`${BUYER_DASHBOARD_PATH}?claim=${result.status}`, lang));
}

/** /buyer-dashboard/edit: the verified buyer edits its page. Logged in the audit log (field names, never values). */
export async function updateBuyerPageAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const back = (q: string): never => redirect(localizePath(`${BUYER_PAGE_EDIT_PATH}?${q}`, lang));
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  if (session.profile.primary_role !== PUBLIC_BUYER_ROLE || session.profile.status === "suspended") redirect(localizePath(roleHome(session.profile.primary_role), lang));
  const org = session.organization;
  if (!org) redirect(localizePath("/onboarding", lang));
  if (org.status !== "active" || org.organization_type !== PUBLIC_BUYER_ROLE) back("error=notVerified");
  const parsed = managedPageSchema.safeParse(readManagedForm(formData));
  if (!parsed.success) back(`error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "failed")}`);
  const now = new Date().toISOString();
  if (isVpsLiveCustomerAuth()) {
    const logo = formData.get("logoUrl");
    const key = await updateVpsBuyerPage(session, parsed.data!, typeof logo === "string" ? logo : null, now)
      .catch(() => back("error=failed"));
    if (!key) back("error=notVerified");
    revalidateBuyerPage(`/buyers/${key}`);
    back("saved=1");
  }
  if (!isServiceConfigured()) back("error=failed");

  const db = createServiceClient();
  const { data: before } = await db.from("buyer_pages").select("*").eq("organization_id", org.id).maybeSingle<Record<string, unknown> & { buyer_key: string }>();
  if (!before) back("error=notVerified");

  const row = pageUpdateRow(parsed.data!, ownLogoUrl(String(formData.get("logoUrl") ?? ""), process.env.NEXT_PUBLIC_SUPABASE_URL), session.userId, now);
  const { error } = await db.from("buyer_pages").update(row).eq("buyer_key", before!.buyer_key).eq("organization_id", org.id);
  if (error) back("error=failed");
  await logAudit({
    actorUserId: session.userId,
    action: "buyer_page.updated",
    entityType: "buyer_pages",
    entityId: org.id,
    metadata: { buyerKey: before!.buyer_key, fields: changedFields(before!, row) },
  });
  revalidateBuyerPage(`/buyers/${before!.buyer_key}`);
  back("saved=1");
}
