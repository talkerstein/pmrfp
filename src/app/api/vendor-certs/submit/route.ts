import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { attachCertFile, lookupRequest, readCertFile } from "@/lib/vendor-certs/server";
import { cleanVendorInput } from "@/lib/vendor-certs/rules";

export const maxDuration = 30;

/**
 * POST /api/vendor-certs/submit — the vendor's upload from the one-time
 * link (/vendor-certificate/<token>), no account. The token (hashed in the
 * table) is the only credential; the service role writes the file and the
 * details the vendor typed, then retires the token so the link can't be
 * replayed. The PM's digest starts over for the new expiry date.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "cert-upload");
  if (limited) return rateLimitResponse(limited);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "upload" }, { status: 400 });
  }
  const req = await lookupRequest(String(form.get("token") ?? ""));
  if (req.state !== "open") return NextResponse.json({ error: req.state }, { status: 410 });

  const fields = cleanVendorInput(
    {
      vendor_name: req.vendorName,
      cert_type: req.type,
      insurer: form.get("insurer"),
      policy_number: form.get("policy_number"),
      coverage_amount: form.get("coverage_amount"),
      expires_on: form.get("expires_on"),
    },
    req.country,
  );
  if (!fields.ok) return NextResponse.json({ error: fields.field }, { status: 422 });
  if (!fields.value.expires_on) return NextResponse.json({ error: "date" }, { status: 422 });
  const file = await readCertFile(form.get("file"));
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: file.error === "tooBig" ? 413 : 415 });

  const ok = await attachCertFile(createServiceClient(), { id: req.certId, organization_id: req.organizationId, file_path: req.filePath }, file, "vendor", {
    insurer: fields.value.insurer,
    policy_number: fields.value.policy_number,
    coverage_amount: fields.value.coverage_amount,
    expires_on: fields.value.expires_on,
    request_token_hash: null,
    request_expires_at: null,
    reminder_stage: null,
    reminder_for: null,
    vendor_reminded_stage: null,
  });
  if (!ok) return NextResponse.json({ error: "upload" }, { status: 502 });
  return NextResponse.json({ ok: true, onPmrfp: req.onPmrfp });
}
