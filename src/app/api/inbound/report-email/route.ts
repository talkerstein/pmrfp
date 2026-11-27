import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { inboundConfig, parseResendEvent, signatureHeaders, verifySignature } from "@/lib/report-quotes/inbound";
import { processInboundEmail, resendDeps } from "@/lib/report-quotes/inbound-server";
import { REPORT_COLUMNS, runExtraction, type ReportRow } from "@/lib/report-quotes/server";

// Downloading up to three 15 MB PDFs, then the AI reads them after the reply (a stuck read shows a retry after 5 minutes).
export const maxDuration = 300;

/** The webhook carries metadata only (attachments are downloaded separately), so this is generous. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * POST /api/inbound/report-email — the receiving provider's webhook (Resend
 * "email.received"). A user forwards an inspection report to their private
 * address r-<token>@INBOUND_EMAIL_DOMAIN; each PDF becomes a report in their
 * dashboard and is read like any upload, then waits for their review.
 *
 *   - Off (404) unless INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_SECRET and
 *     RESEND_API_KEY are set.
 *   - The signature (svix-id / svix-timestamp / svix-signature) must match
 *     the raw body and be under 5 minutes old.
 *   - The address token picks the account; the From address is only logged.
 *   - PDFs only (checked by bytes), 15 MB each, the organization's 10 uploads
 *     a day. Links in the email are never fetched.
 *   - Nothing is ever sent back, so there is no reply loop.
 */
export async function POST(request: Request) {
  const cfg = inboundConfig();
  if (!cfg) return new NextResponse(null, { status: 404 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  if (!verifySignature(body, signatureHeaders(request.headers), cfg.secret)) return NextResponse.json({ error: "signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const email = parseResendEvent(payload);
  // Other event types are acknowledged so the provider stops retrying them.
  if (!email) return NextResponse.json({ ok: true, ignored: "event" });

  const admin = createServiceClient();
  let result;
  try {
    result = await processInboundEmail(admin, email, cfg, resendDeps(cfg, admin));
  } catch (e) {
    console.error("[report-quotes] inbound", e instanceof Error ? e.message : e);
    // 5xx: the provider retries later.
    return NextResponse.json({ error: "retry" }, { status: 502 });
  }

  if (result.status === "done" && result.reportIds.length) {
    const ids = result.reportIds;
    // Read the reports after replying (a long report takes the model a minute or more).
    after(async () => {
      const trades = (await getCategories()).map((c) => ({ slug: c.slug, name: c.name }));
      const { data } = await admin.from("quote_reports").select(REPORT_COLUMNS).in("id", ids);
      for (const report of (data ?? []) as ReportRow[]) {
        await runExtraction(admin, report, trades).catch((e) => console.error("[report-quotes] inbound read", e instanceof Error ? e.message : e));
      }
    });
  }
  return NextResponse.json({ ok: true, status: result.status });
}

/** Anything but POST: nothing here. */
export function GET() {
  return inboundConfig() ? new NextResponse(null, { status: 405 }) : new NextResponse(null, { status: 404 });
}
