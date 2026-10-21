import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAdminBuyerClaim, sendAdminBuyerSourceRequest } from "@/lib/email/send";

/**
 * Admin heads-ups for PMRFP for Towns (Part B1): an email to the admin
 * inbox (ADMIN_NOTIFICATION_EMAIL, else info@pmrfp.com, the same helper
 * the PM job flow uses for pending posts) whenever a public-buyer page
 * claim or a /for-public-buyers request is created, and the count behind
 * the "Buyer Sources" badge in the admin nav. Never throws: a failed email
 * or count never breaks the claim or the request.
 */

type Db = Pick<SupabaseClient, "from">;

/** Why a claim waits for review (lib/towns/domains PendingReason), in plain English. */
export const CLAIM_REASON_LABEL: Record<string, string> = {
  free_mail: "Personal mailbox (gmail, outlook, ISP…)",
  email_unconfirmed: "Email not confirmed",
  no_domain_on_file: "No domain on file for this buyer",
  domain_mismatch: "Email domain isn't one we have for this buyer",
  shared_domain: "Domain shared by several public bodies",
  bad_email: "Unusual email address",
  managed: "Page already managed: sent as a join request",
  email_domain: "Verified by email domain",
};

/** How a request says we may get the tenders, in plain English. */
export const METHOD_WORDS: Record<string, string> = {
  read_public_page: "we read their public page daily",
  email_notices: "they email notices",
  feed: "a feed",
};

/** What waits at /admin/buyer-sources: page claims to check and new "list your tenders" requests. */
export async function buyerReviewCounts(db: Db): Promise<{ claims: number; requests: number }> {
  const count = async (table: string, status: string) => {
    try {
      const { count: n, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("status", status);
      return error ? 0 : (n ?? 0);
    } catch {
      return 0;
    }
  };
  const [claims, requests] = await Promise.all([count("buyer_claims", "pending"), count("buyer_source_requests", "new")]);
  return { claims, requests };
}

/** After a claim is recorded (verified, waiting or a join request): email the admin inbox. */
export async function notifyAdminOfClaim(
  db: Db,
  x: {
    status: "verified" | "pending" | "join_requested" | "error";
    reason?: string | null;
    buyer: { name: string; key: string; provinceCode: string };
    who: { email: string; fullName: string | null; jobTitle: string | null };
  },
): Promise<void> {
  if (x.status === "error") return;
  try {
    const { claims, requests } = await buyerReviewCounts(db);
    await sendAdminBuyerClaim({
      status: x.status,
      buyerName: x.buyer.name,
      buyerKey: x.buyer.key,
      provinceCode: x.buyer.provinceCode,
      email: x.who.email,
      fullName: x.who.fullName,
      jobTitle: x.who.jobTitle,
      reason: x.status === "pending" && x.reason ? (CLAIM_REASON_LABEL[x.reason] ?? x.reason) : null,
      waiting: claims + requests,
    });
  } catch (err) {
    console.error("[buyer-claims] admin email failed:", err instanceof Error ? err.message : err);
  }
}

/** After a /for-public-buyers request is stored: email the admin inbox. */
export async function notifyAdminOfSourceRequest(
  db: Db,
  r: { organization: string; contactName: string; workEmail: string; tendersUrl: string; method: string; provinceCode: string; buyerSlug?: string | null },
): Promise<void> {
  try {
    const { claims, requests } = await buyerReviewCounts(db);
    await sendAdminBuyerSourceRequest({
      organization: r.organization,
      contactName: r.contactName,
      workEmail: r.workEmail,
      tendersUrl: r.tendersUrl,
      method: METHOD_WORDS[r.method] ?? r.method,
      provinceCode: r.provinceCode,
      buyerSlug: r.buyerSlug || null,
      waiting: claims + requests,
    });
  } catch (err) {
    console.error("[buyer-sources] admin email failed:", err instanceof Error ? err.message : err);
  }
}
