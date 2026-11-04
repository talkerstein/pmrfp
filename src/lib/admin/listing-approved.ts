import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { sendListingApprovedEmail } from "@/lib/email/send";

/**
 * A person at PMRFP just approved a listing: tell the company's owner it's
 * live, in the language they signed up in. Skipped for demo companies and
 * addresses on the do-not-contact list. Never blocks the admin's approval.
 */
export async function notifyListingApproved(db: SupabaseClient, orgId: string): Promise<void> {
  try {
    const { data: org } = await db.from("organizations").select("name,slug,is_demo").eq("id", orgId).maybeSingle<{ name: string; slug: string | null; is_demo: boolean }>();
    if (!org || org.is_demo) return;
    const { data: owner } = await db
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ user_id: string }>();
    if (!owner) return;
    const { data: profile } = await db.from("users_profile").select("email,status").eq("id", owner.user_id).maybeSingle<{ email: string | null; status: string }>();
    if (!profile?.email || profile.status !== "active") return;
    const { data: blocked } = await db.from("email_suppressions").select("email_key").eq("email_key", profile.email.trim().toLowerCase()).maybeSingle();
    if (blocked) return;
    const { data: signup } = await db.from("signup_attribution").select("lang").eq("user_id", owner.user_id).maybeSingle<{ lang: string | null }>();
    await sendListingApprovedEmail(profile.email, { lang: emailLang(signup?.lang), companyName: org.name, slug: org.slug });
  } catch (e) {
    console.warn("[listing-approved]", e instanceof Error ? e.message : e);
  }
}
