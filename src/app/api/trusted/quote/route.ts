import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendTrustedQuoteRequest } from "@/lib/email/send";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

const schema = z.object({
  handle: z.string().trim().min(3).max(40),
  organizationId: z.uuid(),
  name: z.string().trim().min(2, "Add your name.").max(80),
  email: z.email("That email doesn't look right.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().min(10, "Tell them a little about the job.").max(2000),
  company_website: z.string().optional().default(""),
});

/**
 * "Request a quote" from a realtor's trusted-trades page. Only trades that are
 * on that published page can be contacted through it. The trade gets the
 * request (Reply-To the client), the page's owner is copied, and it's logged
 * with the other contact requests.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "contact");
  if (limited) return rateLimitResponse(limited);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, { status: 422 });
  }
  const d = parsed.data;
  if (d.company_website) return NextResponse.json({ ok: true }); // honeypot
  if (!isServiceConfigured()) return NextResponse.json({ error: "This isn't available right now." }, { status: 503 });

  const admin = createServiceClient();
  const { data: list } = await admin
    .from("trusted_lists")
    .select("owner_id,display_name,brokerage,contact_email")
    .eq("handle", d.handle)
    .eq("published", true)
    .maybeSingle<{ owner_id: string; display_name: string; brokerage: string | null; contact_email: string | null }>();
  if (!list) return NextResponse.json({ error: "That page isn't available." }, { status: 404 });

  const [{ data: item }, { data: org }, { data: owner }] = await Promise.all([
    admin
      .from("trusted_list_items")
      .select("organization_id")
      .eq("owner_id", list.owner_id)
      .eq("organization_id", d.organizationId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name,email,profile_status")
      .eq("id", d.organizationId)
      .maybeSingle<{ name: string; email: string | null; profile_status: string }>(),
    admin.from("users_profile").select("email").eq("id", list.owner_id).maybeSingle<{ email: string | null }>(),
  ]);
  if (!item || !org || org.profile_status !== "approved") {
    return NextResponse.json({ error: "That company isn't on this page." }, { status: 404 });
  }

  const recommender = list.brokerage ? `${list.display_name} (${list.brokerage})` : list.display_name;
  const cc = [...new Set([list.contact_email, owner?.email].filter((e): e is string => Boolean(e)))];

  await admin.from("contact_requests").insert({
    request_type: "directory_intro",
    requester_name: d.name,
    requester_email: d.email,
    requester_phone: d.phone || null,
    target_organization_id: d.organizationId,
    message: `[Quote request via /trusted/${d.handle}] ${d.message}`,
  });

  await sendTrustedQuoteRequest({
    to: org.email,
    tradeName: org.name,
    recommender,
    pageUrl: `${BASE}/trusted/${d.handle}`,
    requester: { name: d.name, email: d.email, phone: d.phone || null },
    message: d.message,
    cc,
  });

  return NextResponse.json({ ok: true });
}
