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
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";
import { gcFormPath, parseAwardRef } from "@/lib/gc/packages";
import { parsePrefSlugs } from "@/lib/auth/signup-prefs";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
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

export interface ActionState {
  error?: string;
  success?: string;
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "company";
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = messages(lang);
  if (await checkRateLimitByIp(await authIp(), "auth")) {
    return { error: m.rateLimit };
  }
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    company_website: formData.get("company_website") ?? "",
  });
  if (!parsed.success) {
    return { error: translated("validation", parsed.error.issues[0]?.message, lang, m.checkDetails) };
  }
  if (parsed.data.company_website) return { success: m.thanks }; // honeypot
  if (!isSupabaseConfigured()) return { error: m.demo };

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
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        primary_role: parsed.data.role,
        ...(isGc ? { org_kind: "builder", ...(gcAward ? { gc_award: gcAward } : {}) } : {}),
        ...(isLandlord ? { org_kind: "landlord" } : {}),
        ...(prefCategories.length ? { pref_categories: prefCategories } : {}),
        ...(prefRegions.length ? { pref_regions: prefRegions } : {}),
        ...(prefCompany ? { pref_company: prefCompany } : {}),
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${isTalent ? "/talent/edit" : "/onboarding"}`,
    },
  });
  if (error) {
    // Avoid leaking whether an email is already registered (account enumeration).
    console.error("[signUp]", error.message);
    return { error: m.signUpFailed };
  }
  // No welcome email here: it goes out once onboarding completes.
  const next = safeNextPath(formData.get("next")?.toString());
  await trackEvent(EVENT.SIGNUP_COMPLETED, { role: parsed.data.role, hasNext: !!next, gc: isGc, landlord: isLandlord });
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
  if (!data.session) {
    const done = new URLSearchParams({ email: parsed.data.email, role: isGc ? "general_contractor" : isLandlord ? "landlord" : parsed.data.role });
    if (wantsPro) done.set("plan", "pro");
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
    email: formData.get("email"),
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
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
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

  // What signUpAction does for an email sign-up (the welcome email goes out
  // when onboarding completes).
  await trackEvent(EVENT.SIGNUP_COMPLETED, { role: pick.role, hasNext: !!next, gc: pick.builder, landlord: pick.orgKind === "landlord", method: "google" });
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

  const next = safeNextPath(formData.get("next")?.toString());

  // "Just browsing" users skip org creation.
  if (intent === "browsing" || role === "visitor" || role === "talent") {
    const supabase = await createClient();
    await supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", session.userId);
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
    website: formData.get("website") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? session.profile.email,
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    shortDescription: formData.get("shortDescription") ?? "",
    publicContactVisibility: (formData.get("publicContactVisibility") as string) ?? "request_intro",
    categories: isListing ? categories : categories.length ? categories : ["__pm__"],
    regions: isListing ? regions : regions.length ? regions : ["__pm__"],
  });
  if (!parsed.success) {
    return { error: translated("validation", parsed.error.issues[0]?.message, lang, m.completeRequired) };
  }
  const data = parsed.data;

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
  if (orgErr || !org) return { error: m.orgFailed };

  await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: session.userId,
    role: "owner",
  });

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
  await trackEvent(EVENT.ONBOARDING_COMPLETED, { role, gc: isBuilder, landlord: isLandlord });

  // One welcome email per member, with the next step for their kind of account.
  await sendWelcomeEmail(session.profile.email, {
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
