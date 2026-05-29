"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession, roleHome } from "@/lib/access/access";
import {
  companyProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validations";
import { sendWelcomeEmail } from "@/lib/email/send";

export interface ActionState {
  error?: string;
  success?: string;
}

const DEMO_NOTICE =
  "Demo mode: accounts require a connected Supabase project. You can still preview the dashboards from the homepage.";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "company";
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    company_website: formData.get("company_website") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  if (parsed.data.company_website) return { success: "Thanks!" }; // honeypot
  if (!isSupabaseConfigured()) return { error: DEMO_NOTICE };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, primary_role: parsed.data.role },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/onboarding`,
    },
  });
  if (error) {
    // Avoid leaking whether an email is already registered (account enumeration).
    console.error("[signUp]", error.message);
    return { error: "We couldn't complete your sign-up. Please try again." };
  }
  await sendWelcomeEmail(parsed.data.email, parsed.data.fullName);
  redirect("/onboarding");
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };
  if (!isSupabaseConfigured()) return { error: DEMO_NOTICE };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  const session = await getSession();
  if (session && !session.profile.onboarding_completed) redirect("/onboarding");
  redirect(session ? roleHome(session.profile.primary_role) : "/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email." };
  if (!isSupabaseConfigured()) return { error: DEMO_NOTICE };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`,
  });
  return { success: "If that email exists, we've sent a reset link." };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your password." };
  if (!isSupabaseConfigured()) return { error: DEMO_NOTICE };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

/**
 * Completes onboarding: creates the organization + membership + taxonomy links
 * and marks the profile complete. Trades require ≥1 category and ≥1 region (§24).
 */
export async function completeOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: DEMO_NOTICE };
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const role = session.profile.primary_role;
  const intent = formData.get("intent");

  // "Just browsing" users skip org creation.
  if (intent === "browsing" || role === "visitor") {
    const supabase = await createClient();
    await supabase.from("users_profile").update({ onboarding_completed: true }).eq("id", session.userId);
    redirect("/directory");
  }

  const categories = formData.getAll("categories").map(String);
  const regions = formData.getAll("regions").map(String);
  const isSupplier = role === "supplier";
  const isListing = role === "trade" || isSupplier; // lists in a directory + needs categories/regions

  const parsed = companyProfileSchema.safeParse({
    name: formData.get("name"),
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
    return { error: parsed.error.issues[0]?.message ?? "Please complete the required fields." };
  }
  const data = parsed.data;

  const admin = isServiceConfigured() ? createServiceClient() : await createClient();

  // Create org
  const slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: data.name,
      slug,
      organization_type: isSupplier ? "supplier" : isListing ? "trade_company" : "property_manager",
      website: data.website || null,
      phone: data.phone || null,
      email: data.email,
      city: data.city || null,
      province: data.province || null,
      short_description: data.shortDescription || null,
      public_contact_visibility: data.publicContactVisibility,
      profile_status: isListing ? "pending_review" : "approved",
    })
    .select("id")
    .single<{ id: string }>();
  if (orgErr || !org) return { error: "Could not create your organization. Please try again." };

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

  redirect(isListing ? "/dashboard" : "/pm-dashboard");
}
