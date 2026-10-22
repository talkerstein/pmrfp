"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { ACCOUNT_COOKIE } from "@/lib/visitor-geo";
import { isUsState } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, roleHome } from "@/lib/access/access";
import { buyerTags, isCheckViolation, parseBuyerKind } from "@/lib/auth/org-kind";
import { safeNextPath } from "@/lib/auth/next";
import { DEFAULT_SIGNUP_ROLE, onboardingPath, resolveRolePick } from "@/lib/auth/oauth";
import {
  companyProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations";
import { sendAdminNewSignup, sendWelcomeEmail } from "@/lib/email/send";
import { lifecycleEnabled } from "@/lib/lifecycle/config";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";
import { gcFormPath, parseAwardRef } from "@/lib/gc/packages";
import { parsePrefSlugs } from "@/lib/auth/signup-prefs";
import { recordSignupAttribution, recordSignupAttributionForEmail } from "@/lib/attribution/record";
import { recordOnboardingStep } from "@/lib/onboarding/progress";
import { errorDetail } from "@/lib/onboarding/steps";
import { linkDigestSubscriber } from "@/lib/digest/link";
import { magicLinkRedirect, parseSignupMethod } from "@/lib/auth/magic-link";
import { SIGNUP_INTENT_COOKIE } from "@/lib/auth/signup-intent";
import { marketingTicked } from "@/lib/consent/email";
import { normalizeWebsite } from "@/lib/auth/website";
import { recordEmailConsent, recordEmailConsentForEmail } from "@/lib/consent/record";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { cleanEmail } from "@/lib/dedupe/email";
import { existingAccountFor, existingAccountPath } from "@/lib/dedupe/signup";
import { findCompanyMatches } from "@/lib/dedupe/lookup";
import { isMissingRelation, orderedPair } from "@/lib/dedupe/review";
import type { MatchReason } from "@/lib/dedupe/company";
import { logAudit } from "@/lib/audit";
import { getDictionary } from "@/i18n/dictionaries";

async function authIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** An existing listing that looks like the one being created (onboarding). */
export interface DuplicateCompanyView {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  /** Public in the directory (so "View listing" can link to it). */
  listed: boolean;
  reasons: MatchReason[];
}

export interface ActionState {
  error?: string;
  success?: string;
  /** Onboarding: "This company may already be on PMRFP". */
  duplicates?: DuplicateCompanyView[];
  /** Onboarding: the submitted fields, replayed by "It's a different company". */
  echo?: [string, string][];
}

/** The submitted fields minus Next's own and the acknowledgement, to resubmit as hidden inputs. */
function formEcho(formData: FormData): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$") || k === "dup_ack" || typeof v !== "string") continue;
    out.push([k, v.slice(0, 2000)]);
  }
  return out.slice(0, 400);
}

/**
 * They said "It's a different company": the new listing is created, and each
 * pair goes to /admin/duplicates for a second look. Never blocks onboarding.
 */
async function flagDifferentCompany(newOrgId: string, otherIds: string[], userId: string): Promise<void> {
  if (!isServiceConfigured()) return;
  const rows = otherIds
    .filter((id) => id !== newOrgId)
    .map((id) => {
      const [a_id, b_id] = orderedPair(newOrgId, id);
      return { kind: "company", a_id, b_id, status: "open", source: "onboarding", note: "The new member said it's a different company." };
    });
  if (!rows.length) return;
  const { error } = await createServiceClient()
    .from("duplicate_reviews")
    .upsert(rows, { onConflict: "kind,a_id,b_id", ignoreDuplicates: true });
  if (error && !isMissingRelation(error)) console.error("[dedupe:flag]", error.message);
  await logAudit({ actorUserId: userId, action: "company.duplicate_acknowledged", entityType: "organization", entityId: newOrgId, metadata: { similarTo: otherIds } });
}

/**
 * The language of the form that was submitted (a hidden "lang" input from
 * useLang()). Picks the messages returned to it and keeps redirects in that
 * language. Missing or unknown: English, exactly as before.
 */
function formLang(formData: FormData): Locale {
  const v = formData.get("lang");
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

function messages(lang: Locale) {
  return getDictionary(lang).auth.actions;
}

/**
 * A message we don't write ourselves (a zod schema in lib/validations, or
 * Supabase Auth), in the form's language. English passes through untouched;
 * other languages look the English text up in the auth dictionary and use
 * `fallback` when it isn't there.
 */
function translated(group: "validation" | "upstream", message: string | undefined, lang: Locale, fallback: string): string {
  if (!message) return fallback;
  if (lang === DEFAULT_LOCALE) return message;
  const en: Record<string, string> = messages(DEFAULT_LOCALE)[group];
  const key = Object.keys(en).find((k) => en[k] === message);
  const local: Record<string, string> = messages(lang)[group];
  return key ? local[key] : fallback;
}

/** What the onboarding form says about email: the notice (service) always, the optional box (marketing) only if ticked. */
async function recordOnboardingConsent(userId: string, formData: FormData, lang: Locale): Promise<void> {
  await recordEmailConsent(userId, "service", "onboarding", lang);
  if (marketingTicked(formData.get("marketing"))) await recordEmailConsent(userId, "marketing", "onboarding", lang);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "company";
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  // "link": passwordless (Supabase emails a sign-in link). Older forms send no method: password.
  const method = parseSignupMethod(formData.get("method"));
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: cleanEmail(String(formData.get("email") ?? "")),
    password: method === "link" ? undefined : (formData.get("password") ?? undefined),
    role: formData.get("role"),
    company_website: formData.get("company_website") ?? "",
  });
  if (!parsed.success) {
    return { error: translated("validation", parsed.error.issues[0]?.message, lang, m.checkDetails) };
  }
  if (method === "password" && !parsed.data.password) {
    return { error: translated("validation", "Password must be at least 8 characters", lang, m.checkDetails) };
  }
  if (parsed.data.company_website) return { success: m.thanks }; // honeypot
  // The form was submitted and passed validation (signup_viewed is the page opening; lib/tracking/events).
  await trackEvent(EVENT.SIGNUP_STARTED, { role: parsed.data.role, method, plan: formData.get("plan") === "pro" ? "pro" : null, hasNext: !!safeNextPath(formData.get("next")?.toString()) });
  if (!isSupabaseConfigured()) return { error: m.demo };

  // One account per mailbox (lib/dedupe): an address that already has an
  // account (same normalized email: case, Gmail dots and +tags) goes to sign
  // in instead of creating a second one, whichever method it used.
  const existing = await existingAccountFor(parsed.data.email);
  if (existing) {
    await logAudit({ actorUserId: null, action: "signup.duplicate_blocked", entityType: "user", entityId: existing.id, metadata: { method } });
    redirect(localizePath(existingAccountPath(safeNextPath(formData.get("next")?.toString())), lang));
  }

  // General contractors sign up as buyers (primary_role property_manager, so
  // they post exactly like a PM) and get a 'builder' organization at
  // onboarding. The intent + award ride in auth metadata so they survive the
  // email-confirmation round trip.
  const buyerKind = parsed.data.role === "property_manager" ? parseBuyerKind(formData.get("orgKind")) : null;
  const isGc = buyerKind === "builder";
  const isLandlord = buyerKind === "landlord";
  const gcAward = isGc ? parseAwardRef(formData.get("award")?.toString()) : null;
  // Tradespeople looking for work skip company onboarding: straight to their profile.
  const isTalent = parsed.data.role === "talent";
  // Trades / regions picked on the sign-up page: a pre-selection for onboarding.
  const prefCategories = parsePrefSlugs(formData.getAll("pref_categories"));
  const prefRegions = parsePrefSlugs(formData.getAll("pref_regions"));
  const prefCompany = String(formData.get("pref_company") ?? "").trim().slice(0, 120);
  // Chose Trade Pro on the sign-up page: the confirmation page offers checkout.
  const wantsPro = formData.get("plan") === "pro";

  const supabase = await createClient();
  const metadata = {
    full_name: parsed.data.fullName ?? "",
    primary_role: parsed.data.role,
    ...(isGc ? { org_kind: "builder", ...(gcAward ? { gc_award: gcAward } : {}) } : {}),
    ...(isLandlord ? { org_kind: "landlord" } : {}),
    ...(prefCategories.length ? { pref_categories: prefCategories } : {}),
    ...(prefRegions.length ? { pref_regions: prefRegions } : {}),
    ...(prefCompany ? { pref_company: prefCompany } : {}),
  };
  const next = safeNextPath(formData.get("next")?.toString());
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  if (method === "link") {
    // Passwordless: Supabase creates the account (same metadata, same
    // handle_new_user trigger) and emails one link; an existing address just
    // gets a sign-in link, so the answer never reveals who has an account.
    const linkNext = isTalent ? "/talent/edit" : next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true, data: metadata, emailRedirectTo: magicLinkRedirect(siteUrl, linkNext) },
    });
    if (error) {
      console.error("[signUp:link]", error.message);
      return { error: m.signUpFailed };
    }
    // Where they came from, recorded now (this browser has the first-touch
    // cookie; the emailed link may be opened on another device). Supabase
    // returns no user id for OTP, so the fresh account is found by email.
    await recordSignupAttributionForEmail({ email: parsed.data.email, method: "magic_link", role: parsed.data.role, lang });
    await recordEmailConsentForEmail(parsed.data.email, "service", "signup_form", lang);
    await trackEvent(EVENT.SIGNUP_COMPLETED, { role: parsed.data.role, hasNext: !!next, gc: isGc, landlord: isLandlord, method: "link" });
    await sendAdminNewSignup({ email: parsed.data.email, name: parsed.data.fullName ?? "", role: parsed.data.role, method: "email", gc: isGc, landlord: isLandlord });
    await syncPmrfpUserToGhl({
      email: parsed.data.email,
      fullName: parsed.data.fullName ?? "",
      role: parsed.data.role,
      subscriptionStatus: "none",
    }, { extraTags: buyerTags("pmrfp-signup", buyerKind) });
    const done = new URLSearchParams({ email: parsed.data.email, role: isGc ? "general_contractor" : isLandlord ? "landlord" : parsed.data.role, method: "link" });
    if (wantsPro) done.set("plan", "pro");
    if (next) done.set("next", next);
    (await cookies()).delete(SIGNUP_INTENT_COOKIE);
    redirect(localizePath(`/check-email?${done.toString()}`, lang));
  }

  // The confirmation link comes back through /auth/callback, like the emailed
  // sign-in link, carrying `next` (a plan chosen on the way in, a town to
  // follow). It used to land on /onboarding with nothing but the code, so
  // the checkout someone had asked for was forgotten.
  const confirmNext = isTalent ? "/talent/edit" : next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password!,
    options: {
      data: metadata,
      emailRedirectTo: magicLinkRedirect(siteUrl, confirmNext),
    },
  });
  if (error) {
    // Avoid leaking whether an email is already registered (account enumeration).
    console.error("[signUp]", error.message);
    return { error: m.signUpFailed };
  }
  // Where they came from (first-touch cookie). Skipped when Supabase hides an
  // existing account behind a placeholder user (no identities).
  const newUserId = data.user?.id && (data.user.identities?.length ?? 1) > 0 ? data.user.id : null;
  if (newUserId) {
    await recordSignupAttribution({ userId: newUserId, method: "password", role: parsed.data.role, lang });
    await recordEmailConsent(newUserId, "service", "signup_form", lang);
  }
  // No welcome email here: it goes out once onboarding completes.
  await trackEvent(EVENT.SIGNUP_COMPLETED, { role: parsed.data.role, hasNext: !!next, gc: isGc, landlord: isLandlord, method: "password" }, { userId: newUserId });
  await sendAdminNewSignup({ email: parsed.data.email, name: parsed.data.fullName, role: parsed.data.role, method: "email", gc: isGc, landlord: isLandlord });
  // Fire-and-forget GHL sync; no-ops if GHL_API_KEY unset.
  await syncPmrfpUserToGhl({
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    subscriptionStatus: "none",
  }, { extraTags: buyerTags("pmrfp-signup", buyerKind) });
  // Email confirmation required → no session yet. Land on an explanation page
  // instead of silently bouncing /onboarding → /sign-in (a dead end for
  // invited trades). The confirmation link itself carries them to /onboarding.
  (await cookies()).delete(SIGNUP_INTENT_COOKIE);
  if (!data.session) {
    const done = new URLSearchParams({ email: parsed.data.email, role: isGc ? "general_contractor" : isLandlord ? "landlord" : parsed.data.role, method: "password" });
    if (wantsPro) done.set("plan", "pro");
    if (next) done.set("next", next);
    redirect(localizePath(`/check-email?${done.toString()}`, lang));
  }
  if (isTalent) redirect(localizePath("/talent/edit", lang));
  redirect(localizePath(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding", lang));
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  const parsed = signInSchema.safeParse({
    email: cleanEmail(String(formData.get("email") ?? "")),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: m.enterEmailPassword };
  if (!isSupabaseConfigured()) return { error: m.demo };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translated("upstream", error.message, lang, error.message) };

  const session = await getSession();
  const next = safeNextPath(formData.get("next")?.toString());
  await trackEvent(EVENT.SIGNIN_COMPLETED, { hasNext: !!next });
  if (session && !session.profile.onboarding_completed) {
    redirect(localizePath(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding", lang));
  }
  if (next) redirect(localizePath(next, lang));
  redirect(localizePath(session ? roleHome(session.profile.primary_role) : "/dashboard", lang));
}

/**
 * "Email me a sign-in link" (passwordless sign-in). Never creates an
 * account here, and answers the same whether or not the address has one.
 */
export async function signInLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  const parsed = forgotPasswordSchema.safeParse({ email: cleanEmail(String(formData.get("email") ?? "")) });
  if (!parsed.success) return { error: m.enterValidEmail };
  if (!isSupabaseConfigured()) return { error: m.demo };
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: magicLinkRedirect(process.env.NEXT_PUBLIC_SITE_URL ?? "", next) },
  });
  // "No such user" is expected for unknown addresses: same answer either way.
  if (error) console.info("[signInLink]", error.message);
  return { success: m.linkSent };
}

/**
 * "Send the link again" on the check-your-email screen. The same answer
 * whether or not the address has an account, so it can't be used to find
 * out who is a member. The new link goes through the same callback and
 * carries the same `next`, so a plan or a town picked at sign-up survives.
 * The screen enforces the cooldown (lib/auth/resend); Supabase enforces its own.
 */
export async function resendSignupLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  const parsed = forgotPasswordSchema.safeParse({ email: cleanEmail(String(formData.get("email") ?? "")) });
  if (!parsed.success) return { error: m.enterValidEmail };
  if (!isSupabaseConfigured()) return { error: m.demo };
  const next = safeNextPath(formData.get("next")?.toString());
  const linkNext = formData.get("role") === "talent" ? "/talent/edit" : next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
  const supabase = await createClient();
  // signInWithOtp, not auth.resend(): only it carries the PKCE challenge the callback needs.
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: magicLinkRedirect(process.env.NEXT_PUBLIC_SITE_URL ?? "", linkNext) },
  });
  if (error) console.info("[resendSignupLink]", error.message);
  return { success: m.linkSent };
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // The company's country stops ruling public pages once signed out.
  (await cookies()).delete(ACCOUNT_COOKIE);
  redirect("/");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  const parsed = forgotPasswordSchema.safeParse({ email: cleanEmail(String(formData.get("email") ?? "")) });
  if (!parsed.success) return { error: m.enterValidEmail };
  if (!isSupabaseConfigured()) return { error: m.demo };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`,
  });
  return { success: m.resetSent };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: translated("validation", parsed.error.issues[0]?.message, lang, m.checkPassword) };
  if (!isSupabaseConfigured()) return { error: m.demo };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translated("upstream", error.message, lang, error.message) };
  redirect(localizePath("/dashboard", lang));
}

/**
 * Saves the role someone picks after signing up with Google. They arrive on
 * the trigger's default role with no role in their metadata (see
 * lib/auth/oauth). resolveRolePick() is the guard: once only, before
 * onboarding, and only to trade, property_manager or supplier (a GC is
 * property_manager + a builder org). Admin roles can't be reached. Then
 * onboarding carries on exactly as for an email sign-up.
 */
export async function chooseRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (!isSupabaseConfigured()) return { error: m.demo };
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect(localizePath("/sign-in", lang));
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const next = safeNextPath(formData.get("next")?.toString());
  const pick = resolveRolePick(
    {
      primaryRole: session.profile.primary_role,
      onboardingCompleted: session.profile.onboarding_completed,
      metadataRole: meta.primary_role,
    },
    formData.get("role"),
  );
  if (!pick.ok) {
    if (pick.reason === "invalid_role") return { error: m.pickRole };
    redirect(localizePath(onboardingPath({ next }), lang)); // already chosen (another tab, say): carry on
  }
  const saveFailed = { error: m.saveFailed };
  if (!isServiceConfigured()) return saveFailed;

  const admin = createServiceClient();
  const award = pick.builder ? parseAwardRef(formData.get("award")?.toString()) : null;

  // Service role, because guard_users_profile_privileged stops users changing
  // their own role. The filters keep it one-shot if two tabs race.
  if (pick.role !== session.profile.primary_role) {
    const { data: rows, error } = await admin
      .from("users_profile")
      .update({ primary_role: pick.role })
      .eq("id", user.id)
      .eq("primary_role", DEFAULT_SIGNUP_ROLE)
      .eq("onboarding_completed", false)
      .select("id");
    if (error) return saveFailed;
    if (!rows?.length) redirect(localizePath(onboardingPath({ next }), lang));
  }
  // The same metadata an email sign-up writes: marks the choice as made and
  // keeps a GC's intent (read by getSignupGcIntent at onboarding).
  const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      primary_role: pick.role,
      ...(pick.builder ? { org_kind: "builder", ...(award ? { gc_award: award } : {}) } : {}),
      ...(pick.orgKind === "landlord" ? { org_kind: "landlord" } : {}),
    },
  });
  if (metaErr) return saveFailed;
  await recordOnboardingStep(user.id, "role_picked");

  // What signUpAction does for an email sign-up (the welcome email goes out
  // when onboarding completes).
  await trackEvent(EVENT.SIGNUP_COMPLETED, { role: pick.role, hasNext: !!next, gc: pick.builder, landlord: pick.orgKind === "landlord", method: "google" }, { userId: user.id });
  // The callback already wrote the row (lib/attribution/record); this adds the role.
  await recordSignupAttribution({ userId: user.id, method: "google", role: pick.role, lang, signedUpAt: user.created_at });
  await sendAdminNewSignup({ email: session.profile.email, name: session.profile.full_name, role: pick.role, method: "google", gc: pick.builder, landlord: pick.orgKind === "landlord" });
  await syncPmrfpUserToGhl({
    email: session.profile.email,
    fullName: session.profile.full_name,
    role: pick.role,
    subscriptionStatus: "none",
  }, { extraTags: buyerTags("pmrfp-signup", pick.orgKind) });

  redirect(
    localizePath(
      onboardingPath({ role: pick.builder ? "general_contractor" : pick.orgKind === "landlord" ? "landlord" : null, award, next }),
      lang,
    ),
  );
}

/**
 * Completes onboarding: creates the organization + membership + taxonomy links
 * and marks the profile complete. Trades require ≥1 category and ≥1 region (§24).
 */
export async function completeOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (!isSupabaseConfigured()) return { error: m.demo };
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));

  const role = session.profile.primary_role;
  const intent = formData.get("intent");
  // Public buyers set up through the claim step (lib/towns/actions), never a company listing.
  if (role === "public_buyer") redirect(localizePath("/onboarding", lang));

  const next = safeNextPath(formData.get("next")?.toString());

  // "Just browsing" users skip org creation.
  if (intent === "browsing" || role === "visitor" || role === "talent") {
    const supabase = await createClient();
    await supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", session.userId);
    await recordSignupAttribution({ userId: session.userId, role, lang });
    await recordOnboardingConsent(session.userId, formData, lang);
    await linkDigestSubscriber(session.userId, session.profile.email);
    await trackEvent(EVENT.ONBOARDING_COMPLETED, { role, browsing: true }, { userId: session.userId });
    redirect(localizePath(next ?? "/directory", lang));
  }

  const categories = formData.getAll("categories").map(String);
  const regions = formData.getAll("regions").map(String);
  const isSupplier = role === "supplier";
  const isListing = role === "trade" || isSupplier; // lists in a directory + needs categories/regions
  // "General contractor — hiring subs": a buyer like a PM (same role, same
  // posting rights, no trade access) whose organization is a 'builder'.
  // Landlords (independent building owners) are the same kind of buyer with a
  // 'landlord' organization; a company name is optional for them.
  const buyerKind = role === "property_manager" ? parseBuyerKind(formData.get("orgKind")) : null;
  const isBuilder = buyerKind === "builder";
  const isLandlord = buyerKind === "landlord";
  const rawName = formData.get("name")?.toString().trim() ?? "";

  const parsed = companyProfileSchema.safeParse({
    name: isLandlord && !rawName ? session.profile.full_name?.trim() || "Individual owner" : formData.get("name"),
    website: normalizeWebsite(formData.get("website")),
    phone: formData.get("phone") ?? "",
    // Left blank (the box looks optional): the account's own address, not "Enter a valid email".
    email: String(formData.get("email") ?? "").trim() || session.profile.email,
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    shortDescription: formData.get("shortDescription") ?? "",
    publicContactVisibility: (formData.get("publicContactVisibility") as string) ?? "request_intro",
    categories: isListing ? categories : categories.length ? categories : ["__pm__"],
    regions: isListing ? regions : regions.length ? regions : ["__pm__"],
  });
  if (!parsed.success) {
    await recordOnboardingStep(session.userId, "form_error", errorDetail(parsed.error.issues[0]?.path));
    await trackEvent(EVENT.ONBOARDING_STEP, { step: "form_error", field: errorDetail(parsed.error.issues[0]?.path) }, { userId: session.userId, role });
    return { error: translated("validation", parsed.error.issues[0]?.message, lang, m.completeRequired) };
  }
  const data = parsed.data;

  // "This company may already be on PMRFP" (lib/dedupe): before creating a
  // listing, look for one that matches (name, website, phone, company email
  // domain). They choose "Request to join this company" or "It's a
  // different company" (dup_ack, flagged for admin review). Never merged here.
  const acknowledged = formData.getAll("dup_ack").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 5);
  if (!acknowledged.length && !(isLandlord && !rawName) && isServiceConfigured()) {
    const matches = await findCompanyMatches(createServiceClient(), {
      name: data.name,
      website: data.website,
      phone: data.phone,
      email: data.email,
    });
    if (matches.length) {
      return {
        duplicates: matches.map(({ candidate: c, reasons }) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          city: c.city ?? null,
          province: c.province ?? null,
          listed: c.profile_status === "approved" && c.status === "active",
          reasons,
        })),
        echo: formEcho(formData),
      };
    }
  }

  const admin = isServiceConfigured() ? createServiceClient() : await createClient();

  // Create org
  const slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`;
  const orgType = isSupplier ? "supplier" : isListing ? "trade_company" : isBuilder ? "builder" : isLandlord ? "landlord" : "property_manager";
  const orgRow = {
      name: data.name,
      slug,
      organization_type: orgType,
      website: data.website || null,
      phone: data.phone || null,
      email: data.email,
      city: data.city || null,
      province: data.province || null,
      // Country-first: the column defaults to Canada, so U.S. companies need it said.
      country: isUsState(data.province) ? "United States" : "Canada",
      short_description: data.shortDescription || null,
      public_contact_visibility: data.publicContactVisibility,
      // Listings auto-approve once they say what they do and where (at least
      // one category and one region), so a signup is visible in the directory
      // immediately. The old floor also required a 40+ character description,
      // and 11 real companies sat invisible for up to 3 months behind it.
      // Profiles with no trade or area still land in pending_review (approve
      // them in /admin/organizations), and admins can suspend anything
      // retroactively. This is also what makes the gated trade×city pages turn
      // on without manual work.
      profile_status: isListing
        ? categories.length > 0 && regions.length > 0
          ? "approved"
          : "pending_review"
        : "approved",
  };
  let { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert(orgRow)
    .select("id")
    .single<{ id: string }>();
  // Before migration 20261007000001_landlord.sql the CHECK constraint rejects
  // 'landlord'. Never break sign-up over it: create a property_manager org
  // (identical capabilities) and keep the landlord kind in auth metadata so
  // the org can be re-typed once the migration runs.
  if (orgErr && isLandlord && isCheckViolation(orgErr)) {
    ({ data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ ...orgRow, organization_type: "property_manager" })
      .select("id")
      .single<{ id: string }>());
    if (!orgErr && isServiceConfigured()) {
      await createServiceClient().auth.admin.updateUserById(session.userId, {
        user_metadata: { org_kind: "landlord", landlord_org_fallback: true },
      });
    }
  }
  if (orgErr || !org) {
    await recordOnboardingStep(session.userId, "org_failed", orgErr?.code ?? null);
    await trackEvent(EVENT.ONBOARDING_STEP, { step: "org_failed" }, { userId: session.userId, role });
    return { error: m.orgFailed };
  }

  await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: session.userId,
    role: "owner",
  });
  if (acknowledged.length) await flagDifferentCompany(org.id, acknowledged, session.userId);

  if (isListing) {
    const { data: catRows } = await admin.from("trade_categories").select("id,slug").in("slug", categories);
    const { data: regRows } = await admin.from("regions").select("id,slug").in("slug", regions);
    if (catRows?.length) {
      await admin.from("organization_categories").insert(
        catRows.map((c: { id: string }) => ({ organization_id: org.id, category_id: c.id })),
      );
    }
    if (regRows?.length) {
      await admin.from("organization_regions").insert(
        regRows.map((r: { id: string }) => ({ organization_id: org.id, region_id: r.id })),
      );
    }
  }

  await admin.from("users_profile").update({ onboarding_completed: true }).eq("id", session.userId);
  await recordSignupAttribution({ userId: session.userId, orgId: org.id, role, lang });
  await recordOnboardingConsent(session.userId, formData, lang);
  await linkDigestSubscriber(session.userId, session.profile.email);
  await trackEvent(EVENT.ONBOARDING_COMPLETED, { role, gc: isBuilder, landlord: isLandlord }, { userId: session.userId });

  // One welcome email per member, with the next step for their kind of account.
  // Trade companies get the lifecycle sequence's Day 0 welcome instead when
  // it's on (lib/lifecycle), so nobody gets two welcomes.
  if (!(orgType === "trade_company" && lifecycleEnabled())) await sendWelcomeEmail(session.profile.email, {
    name: session.profile.full_name,
    kind: isBuilder ? "general_contractor" : isLandlord ? "landlord" : isSupplier ? "supplier" : isListing ? "trade" : "property_manager",
    companyName: data.name,
    profileSlug: isListing ? slug : null,
    live: isListing && categories.length > 0 && regions.length > 0,
    tradeSlug: isListing ? categories[0] ?? null : null,
  });

  // Sync the freshly-onboarded user to GHL with the org fields filled in.
  await syncPmrfpUserToGhl({
    email: session.profile.email,
    fullName: session.profile.full_name,
    role,
    orgId: org?.id ?? null,
    orgSlug: slug,
    orgName: data.name,
    city: data.city,
    province: data.province,
    tradeCategory: isListing && categories.length > 0 ? categories[0] : null,
    subscriptionStatus: "none",
    profileCompletionPct: 50, // baseline after onboarding; will rise as they add logo/portfolio
  }, { extraTags: buyerTags("pmrfp-onboarded", buyerKind) });

  if (next) redirect(localizePath(next, lang));
  // A GC lands straight on the package form (award prefilled if they came from one).
  if (isBuilder) redirect(localizePath(gcFormPath(parseAwardRef(formData.get("award")?.toString())), lang));
  redirect(localizePath(isListing ? "/dashboard" : "/pm-dashboard", lang));
}
