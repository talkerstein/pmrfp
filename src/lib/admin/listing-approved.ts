import type { SupabaseClient } from "@supabase/supabase-js";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { sendListingApprovedEmail } from "@/lib/email/send";
import type { D1Binding } from "@/lib/d1/contracts";

/**
 * A person at PMRFP just approved a listing: tell the company's owner it's
 * live, in the language they signed up in. Skipped for demo companies and
 * addresses on the do-not-contact list. Never blocks the admin's approval.
 */
export async function notifyListingApproved(db: SupabaseClient | D1Binding, orgId: string): Promise<void> {
  try {
    if ("prepare" in db) {
      const row = await db.prepare(`SELECT o.name,o.slug,u.email,a.lang FROM organizations o
        JOIN organization_members m ON m.id=(SELECT id FROM organization_members
          WHERE organization_id=o.id AND role='owner' ORDER BY created_at,id LIMIT 1)
        JOIN users_profile u ON u.id=m.user_id LEFT JOIN signup_attribution a ON a.user_id=u.id
        WHERE o.id=? AND o.status='active' AND o.profile_status='approved' AND o.is_demo=0
          AND u.status='active' AND u.email IS NOT NULL AND trim(u.email)<>''
          AND NOT EXISTS (SELECT 1 FROM email_suppressions e WHERE e.email_key=lower(trim(u.email)))`)
        .bind(orgId).first<{ name: string; slug: string; email: string; lang: string | null }>();
      if (row) await sendListingApprovedEmail(row.email, { lang: emailLang(row.lang), companyName: row.name, slug: row.slug });
      return;
    }
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
