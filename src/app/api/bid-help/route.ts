import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminContactEmail } from "@/lib/email/send";
import { upsertGhlContact } from "@/lib/ghl/client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * "Need help bidding on this?" — a trade asks for help with a public tender.
 * Lands in three places: contact_requests (admin inbox), an admin email, and
 * GHL tagged for the Talkerstein bid-support follow-up. No new DB type: the
 * row is a general_contact with a [Bid help] prefix, so no migration needed.
 */
const bidHelpSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
  rfpSlug: z.string().trim().min(1).max(200),
  rfpTitle: z.string().trim().min(1).max(300),
  trade: z.string().trim().max(120).optional(),
  // Honeypot — must stay empty.
  company_website: z.string().max(0).optional(),
});

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "contact");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bidHelpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const d = parsed.data;
  if (d.company_website) return NextResponse.json({ ok: true });

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  const tenderUrl = `${base}/rfps/${d.rfpSlug}`;
  const message = [
    `[Bid help] ${d.rfpTitle}`,
    tenderUrl,
    d.trade ? `Trade: ${d.trade}` : null,
    d.company ? `Company: ${d.company}` : null,
    d.phone ? `Phone: ${d.phone}` : null,
    d.message ? `\n${d.message}` : null,
  ].filter(Boolean).join("\n");

  if (isServiceConfigured()) {
    const supabase = createServiceClient();
    await supabase.from("contact_requests").insert({
      request_type: "general_contact",
      requester_name: d.name,
      requester_email: d.email,
      requester_phone: d.phone ?? null,
      requester_organization: d.company ?? null,
      message,
    });
  }

  const [firstName, ...rest] = d.name.split(/\s+/);
  await Promise.allSettled([
    sendAdminContactEmail({
      name: esc(d.name),
      email: esc(d.email),
      requestType: "BID HELP",
      message: esc(message).replace(/\n/g, "<br/>"),
    }),
    upsertGhlContact({
      email: d.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone: d.phone,
      tags: ["pmrfp-bid-help", "talkerstein-lead", "pmrfp-trade"],
      customFields: {
        pmrfp_role: "trade",
        pmrfp_org_name: d.company ?? "",
        pmrfp_category: d.trade ?? "",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
