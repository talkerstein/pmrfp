import { D1ApiError, UUID, type D1Binding } from "../../src/lib/d1/contracts";
import { pmSeesTradeContact, tradeContactCard } from "../../src/lib/pm-jobs/rules";

const authorizedJob = `
  FROM rfp_posts r JOIN users_profile actor ON actor.id=?
  WHERE r.id=? AND r.sealed=0 AND actor.status='active' AND (
    actor.primary_role IN ('admin','super_admin')
    OR (actor.primary_role IN ('property_manager','real_estate_agent','public_buyer') AND (
      r.posted_by_user_id=actor.id OR EXISTS(
        SELECT 1 FROM organization_members m
        WHERE m.user_id=actor.id AND m.organization_id=r.posted_by_organization_id
      )
    ))
  )
`;

interface BuyerResponse {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  quote_amount: string | null;
  quote_kind: string | null;
  company: string;
  visibility: string | null;
  contact_revealed: number;
  organization_email: string | null;
  organization_phone: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
}

/** Buyer-only ordinary bid preview, with the existing contact disclosure rules. */
export async function listSyntheticBuyerResponses(db: D1Binding, url: URL, userId: string) {
  const rfpId = url.searchParams.get("rfpId");
  if (!rfpId || !UUID.test(rfpId) || [...url.searchParams.keys()].length !== 1) {
    throw new D1ApiError(400, "invalid_request");
  }
  const [job, rows] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT r.id,r.title,r.status ${authorizedJob}`).bind(userId, rfpId),
    db.prepare(`
      SELECT i.id,i.status,i.message,i.created_at,i.quote_amount,i.quote_kind,
        o.name AS company,o.public_contact_visibility AS visibility,i.contact_revealed,
        o.email AS organization_email,o.phone AS organization_phone,
        submitter.full_name AS submitter_name,submitter.email AS submitter_email,submitter.phone AS submitter_phone
      FROM (SELECT r.id ${authorizedJob}) job
      JOIN rfp_interests i ON i.rfp_id=job.id
      JOIN organizations o ON o.id=i.trade_organization_id
      LEFT JOIN users_profile submitter ON submitter.id=i.submitted_by_user_id
      ORDER BY i.created_at DESC,i.id DESC LIMIT 1001
    `).bind(userId, rfpId),
  ]);
  if (!job?.success || !rows?.success) throw new D1ApiError(503, "responses_unavailable");
  const listing = job.results[0];
  if (!listing) throw new D1ApiError(404, "not_found");
  if (rows.results.length > 1000) throw new D1ApiError(503, "responses_require_pagination");
  const items = (rows.results as unknown as BuyerResponse[]).map(row => {
    const contactAllowed = pmSeesTradeContact({
      status: row.status, contactRevealed: row.contact_revealed === 1, tradeVisibility: row.visibility,
    });
    return {
      id: row.id, status: row.status, message: row.message, createdAt: row.created_at,
      quoteAmount: row.quote_amount, quoteKind: row.quote_kind, company: row.company,
      contact: contactAllowed ? tradeContactCard({
        org: { name: row.company, email: row.organization_email, phone: row.organization_phone },
        submitter: { full_name: row.submitter_name, email: row.submitter_email, phone: row.submitter_phone },
      }) : null,
    };
  });
  return { listing, items };
}
