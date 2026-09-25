"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminContactEmail } from "@/lib/email/send";
import { upsertGhlContact } from "@/lib/ghl/client";
import { checkRateLimitByIp } from "@/lib/rate-limit";
import { cad, sponsorPackage } from "@/components/advertise/packages";

/**
 * Sponsorship enquiry from /advertise. Same three places as a bid-help
 * request: contact_requests (admin inbox), an admin email, and GHL. No new
 * request type (the column has a CHECK constraint), so the row is a
 * general_contact whose message starts with "[Sponsorship]".
 */

export interface SponsorEnquiryState {
  error?: string;
  success?: string;
}

const schema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("Enter a valid work email"),
  company: z.string().trim().min(1, "Your company name is required").max(160),
  website: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  package: z.enum(["trade", "founding", "unsure"]).catch("unsure"),
  focus: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
});

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || "unknown";
}

export async function submitSponsorEnquiry(
  _prev: SponsorEnquiryState,
  formData: FormData,
): Promise<SponsorEnquiryState> {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v : undefined;
  };

  // Honeypot: bots fill every field. Pretend it worked.
  if (text("company_website")) return { success: "Thanks. We'll be in touch." };

  if (await checkRateLimitByIp(await clientIp(), "contact")) {
    return { error: "Too many submissions. Please wait a minute and try again." };
  }

  const parsed = schema.safeParse({
    name: text("name") ?? "",
    email: text("email") ?? "",
    company: text("company") ?? "",
    website: text("website"),
    phone: text("phone"),
    package: text("package"),
    focus: text("focus"),
    message: text("message"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please fill in the required fields." };
  }
  const d = parsed.data;

  const pkg = sponsorPackage(d.package);
  const message = [
    `[Sponsorship] ${pkg ? `${pkg.name} (${cad(pkg.monthly)}/mo)` : "Package not chosen yet"}`,
    `Company: ${d.company}`,
    d.website ? `Website: ${d.website}` : null,
    d.focus ? `Trades: ${d.focus}` : null,
    d.phone ? `Phone: ${d.phone}` : null,
    d.message ? `\n${d.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (isServiceConfigured()) {
    const { error } = await createServiceClient().from("contact_requests").insert({
      request_type: "general_contact",
      requester_name: d.name,
      requester_email: d.email,
      requester_phone: d.phone ?? null,
      requester_organization: d.company,
      message,
    });
    if (error) console.error("[advertise] contact_requests insert failed:", error.message);
  }

  const [firstName, ...rest] = d.name.split(/\s+/);
  await Promise.allSettled([
    sendAdminContactEmail({
      name: esc(d.name),
      email: esc(d.email),
      requestType: "SPONSORSHIP",
      message: esc(message).replace(/\n/g, "<br/>"),
    }),
    upsertGhlContact({
      email: d.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone: d.phone,
      tags: ["pmrfp-sponsor-lead", `pmrfp-sponsor-${d.package}`],
      customFields: { pmrfp_org_name: d.company },
    }),
  ]);

  return { success: "Thanks. We'll email you with the trades that are open, and a sample of your placement." };
}
