import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendJobApplication } from "@/lib/email/send";
import { applicationSchema } from "@/lib/jobs/rules";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

/**
 * Apply to a job without an account. Stored for the employer's Hiring page
 * and emailed to them (Reply-To the applicant). Only open, unexpired jobs
 * from approved companies accept applications.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "contact");
  if (limited) return rateLimitResponse(limited);

  const parsed = applicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 422 });
  }
  const d = parsed.data;
  if (d.company_website) return NextResponse.json({ ok: true }); // honeypot
  if (!isServiceConfigured()) return NextResponse.json({ error: "This isn't available right now." }, { status: 503 });

  const admin = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: job } = await admin
    .from("job_posts")
    .select("id,title,slug,status,expires_at,posted_by,organizations!inner(email,profile_status,status)")
    .eq("slug", d.slug)
    .maybeSingle<{
      id: string;
      title: string;
      slug: string;
      status: string;
      expires_at: string;
      posted_by: string | null;
      organizations: { email: string | null; profile_status: string; status: string };
    }>();
  if (!job || job.status !== "open" || job.expires_at < today || job.organizations.profile_status !== "approved" || job.organizations.status !== "active") {
    return NextResponse.json({ error: "This job is no longer taking applications." }, { status: 410 });
  }

  const { error } = await admin.from("job_applications").insert({
    job_id: job.id,
    name: d.name,
    email: d.email,
    phone: d.phone || null,
    experience_years: d.experienceYears ?? null,
    certifications: d.certifications || null,
    message: d.message || null,
  });
  if (error) return NextResponse.json({ error: "Could not send your application. Please try again." }, { status: 500 });

  // The company's contact email, else the person who posted the job.
  let to = job.organizations.email;
  if (!to && job.posted_by) {
    const { data: poster } = await admin.from("users_profile").select("email").eq("id", job.posted_by).maybeSingle<{ email: string | null }>();
    to = poster?.email ?? null;
  }
  if (to) {
    await sendJobApplication({
      to,
      jobTitle: job.title,
      jobUrl: `${BASE}/jobs/${job.slug}`,
      applicant: {
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        experienceYears: d.experienceYears ?? null,
        certifications: d.certifications || null,
        message: d.message || null,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
