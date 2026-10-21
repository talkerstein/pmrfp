import { NextResponse } from "next/server";
import { interestSchema } from "@/lib/validations";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionFromRequest } from "@/lib/access/request-session";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { karmaSyncAfter } from "@/lib/karma/sync";
import { validAttachments } from "@/lib/projects/attach";
import { isSchemaMissing } from "@/lib/projects/compat";
import { isEnabledLocale } from "@/i18n/config";
import { REFUSAL_STATUS, isFreeLimitError, parseQuoteAmount, parseQuoteKind, respondDecision, responseAllowance } from "@/lib/pm-jobs/rules";
import { freeResponsesUsed } from "@/lib/pm-jobs/server";
import { loadJobForDecision, notifyNewInterest } from "@/lib/pm-jobs/decisions";
import { loadTownJob } from "@/lib/town-jobs/server";
import { respondSealed } from "@/lib/town-jobs/sealed-respond";

/**
 * A trade responds to a listing ("Express interest" / "Respond").
 *
 * Who: Trade Pro (and trials) on any private listing, as before; any
 * approved trade company or supplier on a PM job, free accounts up to 3 a
 * calendar month (lib/pm-jobs/rules; the database enforces the same limit).
 * The row is written with the service role after these checks (signed-in
 * users can't write rfp_interests directly since migration 20261021000020).
 * Then, only once the row exists, the poster is emailed and notified in-app
 * (their address is read server-side: the trade's session can't read it).
 * The mobile app calls this too, with its Supabase access token as a bearer.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "rfp-interest");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = interestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // The web's cookie session, or the mobile app's bearer token (verified with Supabase Auth).
  const session = (await getSessionFromRequest(request))?.session ?? null;
  if (!session) return NextResponse.json({ error: "Sign in required", reason: "signin" }, { status: 401 });
  if (!session.organization) {
    return NextResponse.json({ error: "Complete your company profile first", reason: "org" }, { status: 400 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ error: "Not available right now" }, { status: 503 });

  const db = createServiceClient();
  const rfp = await loadJobForDecision(db, data.rfpId);
  if (!rfp) return NextResponse.json({ error: "Opportunity not found", reason: "not_open" }, { status: 404 });

  const org = session.organization;
  const pro = session.hasTradeAccess;
  // A town's job (lib/town-jobs): always free, never counted, so no allowance to read or show.
  const townJob = rfp.source_type === "public_buyer_direct";
  // "Sealed until closing" (Part C): the quote goes into the sealed box, never into a response the town can read.
  if (townJob) {
    const town = await loadTownJob(db, rfp.id);
    if (town?.sealed) {
      const reply = await respondSealed(db, session, town, data);
      // First-party: respond_to_job (a sealed quote; never its price).
      if (reply.body.ok) await trackEvent(EVENT.RFP_INTEREST_SUBMITTED, { rfpId: rfp.id, kind: "town_sealed" }, { userId: session.userId, role: session.profile.primary_role });
      return NextResponse.json(reply.body.ok ? { ...reply.body, allowance: { unlimited: true } } : reply.body, { status: reply.status });
    }
  }
  const used = pro || townJob ? 0 : await freeResponsesUsed(db, org.id);
  const decision = respondDecision({
    signedIn: true,
    org: { id: org.id, organization_type: org.organization_type, status: org.status, profile_status: org.profile_status },
    pro,
    rfp,
    userId: session.userId,
    // Before the migration there's no allowance to count: free responses stay unavailable.
    usedThisMonth: used ?? Infinity,
  });
  if (decision.refusal) {
    const reason = used === null && decision.refusal === "limit" ? "pro_required" : decision.refusal;
    return NextResponse.json({ error: refusalMessage(reason), reason }, { status: REFUSAL_STATUS[reason] });
  }

  // Projects the trade chose to show this buyer: only its own published ones
  // (private ones get a share link so the PM can open them).
  const caseStudyIds = data.caseStudyIds?.length
    ? await validAttachments({
        organizationId: org.id,
        userId: session.userId,
        ids: data.caseStudyIds,
        label: `Interest: ${rfp.title}`,
      })
    : [];
  const lang = isEnabledLocale(data.lang) ? data.lang : "en";
  const quote = {
    amount: parseQuoteAmount(data.quoteAmount),
    kind: parseQuoteKind(data.quoteKind),
    notes: data.quoteNotes?.trim() || null,
    startDate: data.startDate || null,
  };
  const legacyRow = {
    rfp_id: rfp.id,
    trade_organization_id: org.id,
    submitted_by_user_id: session.userId,
    message: data.message,
    relevant_experience: data.relevantExperience ?? null,
    availability: data.availability ?? null,
    attachment_url: data.attachmentUrl ?? null,
  };
  const row = {
    ...legacyRow,
    ...(caseStudyIds.length ? { case_study_ids: caseStudyIds } : {}),
    quote_amount: quote.amount,
    quote_kind: quote.amount != null ? quote.kind : null,
    quote_notes: quote.notes,
    start_date: quote.startDate,
    used_free_allowance: decision.free,
    lang,
  };
  let { data: inserted, error } = await db.from("rfp_interests").insert(row).select("id").maybeSingle();
  // Before migration 20261021000020: Pro responses go in the old shape (free ones were refused above).
  if (error && isSchemaMissing(error) && pro) {
    const withProjects: Record<string, unknown> = caseStudyIds.length ? { ...legacyRow, case_study_ids: caseStudyIds } : legacyRow;
    ({ data: inserted, error } = await db.from("rfp_interests").insert(withProjects).select("id").maybeSingle());
    if (error && caseStudyIds.length && isSchemaMissing(error)) {
      ({ data: inserted, error } = await db.from("rfp_interests").insert(legacyRow).select("id").maybeSingle());
    }
  }

  if (error || !inserted) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "You've already expressed interest in this opportunity.", reason: "already" }, { status: 409 });
    }
    if (isFreeLimitError(error)) {
      return NextResponse.json({ error: refusalMessage("limit"), reason: "limit" }, { status: REFUSAL_STATUS.limit });
    }
    // A sealed box (the database keeps responses out of it until it's opened).
    if (error?.hint === "pmrfp_sealed") {
      return NextResponse.json({ error: "Quotes on this job are sealed until closing.", reason: "not_open" }, { status: 409 });
    }
    // A town's formal tender (the database refuses responses on a mirror too).
    if (error?.hint === "pmrfp_official_portal") {
      return NextResponse.json({ error: refusalMessage("official_portal"), reason: "official_portal" }, { status: REFUSAL_STATUS.official_portal });
    }
    return NextResponse.json({ error: "Could not submit interest" }, { status: 500 });
  }
  const interestId = (inserted as { id: string }).id;

  // An RFP/package that draws interest from another company earns its poster
  // reputation; re-sync that company after the response.
  await karmaSyncAfter({ userIds: [rfp.posted_by_user_id] });

  const allowance = responseAllowance({ pro: pro || townJob, usedThisMonth: (used ?? 0) + (decision.free ? 1 : 0) });
  await notifyNewInterest(db, {
    interestId,
    job: rfp,
    vendorName: org.name,
    message: data.message,
    quote: { ...quote, availability: data.availability ?? null },
    trade: { userId: session.userId, email: session.profile.email || null, lang },
    allowance,
  }).catch((e) => console.error("[rfp-interest] notify failed", e instanceof Error ? e.message : e));
  // First-party: respond_to_job (lib/analytics).
  await trackEvent(
    EVENT.RFP_INTEREST_SUBMITTED,
    { rfpId: rfp.id, kind: townJob ? "town" : String(rfp.source_type ?? "pm") },
    { userId: session.userId, role: session.profile.primary_role },
  );

  return NextResponse.json({
    ok: true,
    allowance: allowance.unlimited ? { unlimited: true } : { unlimited: false, left: allowance.left, limit: allowance.limit },
  });
}

/** English API messages (the dialog shows its own copy per `reason`). */
function refusalMessage(reason: string): string {
  switch (reason) {
    case "role":
      return "Only trade and supplier companies can respond to jobs.";
    case "suspended":
      return "This account is suspended.";
    case "public_tender":
      return "Public tenders are answered on the buyer's own portal.";
    case "official_portal":
      return "Bids on this tender go to the town's official portal, not through PMRFP.";
    case "not_open":
      return "This job isn't open for responses.";
    case "own_job":
      return "You can't respond to your own job.";
    case "not_approved":
      return "Your company profile is waiting for approval. You can respond once it's approved.";
    case "limit":
      return "You've used your 3 free responses this month. Trade Pro is unlimited.";
    default:
      return "Trade Pro membership required";
  }
}
