import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, checkRecipientLimit, rateLimitResponse } from "@/lib/rate-limit";
import { rfpEmailDraftSchema } from "@/lib/rfp-writer/schema";
import { sendRfpDraftEmail } from "@/lib/email/send";
import { upsertGhlContact } from "@/lib/ghl/client";

/**
 * POST /api/rfp-writer/email — "Email me this RFP". The property manager asked
 * for it, so it's a requested message, not marketing. Also records them in GHL
 * as a PM lead (tagged) so a human can follow up about posting it.
 */
const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
  rfp: rfpEmailDraftSchema,
  tradeName: z.string().trim().max(120).optional(),
  lang: z.enum(["en", "fr", "es"]).optional(),
  // Honeypot — must stay empty.
  company_website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "rfp-email");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 422 });
  const d = parsed.data;
  if (d.company_website) return NextResponse.json({ ok: true });
  const tooMany = await checkRecipientLimit(d.email);
  if (tooMany) return rateLimitResponse(tooMany);

  const [firstName, ...rest] = (d.name ?? "").split(/\s+/).filter(Boolean);
  await Promise.allSettled([
    sendRfpDraftEmail(d.email, d.rfp, d.lang ?? "en"),
    upsertGhlContact({
      email: d.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      tags: ["pmrfp-property_manager", "pmrfp-rfp-writer"],
      customFields: { pmrfp_role: "property_manager", pmrfp_category: d.tradeName ?? "" },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
