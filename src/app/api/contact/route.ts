import { NextResponse } from "next/server";
import { contactRequestSchema } from "@/lib/validations";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminContactEmail } from "@/lib/email/send";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "contact");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = contactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  // Honeypot: silently accept but ignore bots.
  if (data.company_website && data.company_website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  if (isServiceConfigured()) {
    const supabase = createServiceClient();
    let targetOrgId: string | null = null;
    if (data.targetOrganizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", data.targetOrganizationId)
        .maybeSingle<{ id: string }>();
      targetOrgId = org?.id ?? null;
    }
    await supabase.from("contact_requests").insert({
      request_type: data.requestType,
      requester_name: data.name,
      requester_email: data.email,
      requester_phone: data.phone ?? null,
      requester_organization: data.organization ?? null,
      target_organization_id: targetOrgId,
      message: data.message,
    });
  }

  // The admin email is HTML: escape what the visitor typed so it can't inject markup.
  await sendAdminContactEmail({
    name: esc(data.name),
    email: esc(data.email),
    requestType: data.requestType,
    message: esc(data.message).replace(/\n/g, "<br/>"),
  });

  return NextResponse.json({ ok: true });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
