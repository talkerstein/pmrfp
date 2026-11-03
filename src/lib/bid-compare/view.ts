/**
 * Bid Comparison Sheet: the rows as stored, and the sheet built from them
 * (pure, client-safe). The workspace, the owner's board view and the
 * shared board view all go through buildSheet, so they show the same
 * numbers; the shared one drops contact emails and files.
 */

import { LOCALE_TAG, type Locale } from "@/i18n/config";
import {
  bidderCoverage,
  currencyOf,
  compareBids,
  readLinePrices,
  readScopeItems,
  type BidComparison,
  type BidCountry,
  type CoverageState,
  type SheetItem,
  type TrackerCert,
} from "./rules";

export interface ComparisonRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  title: string;
  building_name: string | null;
  building_address: string | null;
  trade: string | null;
  country: BidCountry;
  rfp_id: string | null;
  scope_items: unknown;
  recommendation: string | null;
  recommended_bid_id: string | null;
  share_created_at: string | null;
  awarded_at: string | null;
  awarded_bid_id: string | null;
  awarded_company: string | null;
  awarded_amount: number | string | null;
  award_rfp_recorded: boolean;
  award_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BidRow {
  id: string;
  comparison_id: string;
  organization_id: string;
  position: number;
  company_name: string;
  contact_email: string | null;
  total_price: number | string | null;
  tax_amount: number | string | null;
  tax_percent: number | string | null;
  line_prices: unknown;
  start_date: string | null;
  duration: string | null;
  warranty: string | null;
  payment_terms: string | null;
  notes: string | null;
  bidder_organization_id: string | null;
  rfp_interest_id: string | null;
  file_path: string | null;
  file_name: string | null;
  file_uploaded_at: string | null;
  invited_at: string | null;
  created_at: string;
}

/** A bidder's own PMRFP company, as the sheet shows it. */
export interface BidderOrg {
  id: string;
  name: string;
  slug: string;
  approved: boolean;
  insurance_status: string | null;
  wsib_status: string | null;
}

export interface GridBid {
  id: string;
  company: string;
  price: number | null;
  taxAmount: number | null;
  taxPercent: number | null;
  linePrices: Record<string, number>;
  startDate: string | null;
  duration: string | null;
  warranty: string | null;
  paymentTerms: string | null;
  notes: string | null;
  /** Linked to a PMRFP company (and its name there). */
  onPmrfp: boolean;
  orgName: string | null;
  /** Its public profile, when approved. */
  profileSlug: string | null;
  /** Pulled in from a response to the linked RFP. */
  fromRfp: boolean;
  insurance: CoverageState;
  wsib: CoverageState;
  /** What the bidder's PMRFP profile says, when it says something. */
  insuranceProfile: string | null;
  wsibProfile: string | null;
  /** Owner only (never on a shared link). */
  contactEmail: string | null;
  hasFile: boolean;
  fileName: string | null;
  invitedAt: string | null;
}

export interface SheetView {
  items: SheetItem[];
  bids: GridBid[];
  math: BidComparison;
}

/** $48,500 / 48 500 $ / US$48,500, cents only when there are some. */
export function formatMoney(n: number, country: BidCountry, lang: Locale): string {
  return n.toLocaleString(LOCALE_TAG[lang], { style: "currency", currency: currencyOf(country), maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 });
}

const num = (v: number | string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Bids in the order the PM added them. */
export function sortBids<T extends { position: number; created_at: string }>(bids: readonly T[]): T[] {
  return [...bids].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

export function buildSheet(input: {
  scopeItems: unknown;
  bids: readonly BidRow[];
  certs: readonly TrackerCert[];
  orgs: ReadonlyMap<string, BidderOrg>;
  /** The shared (board) link: no contact emails, no files, no invite stamps. */
  shared?: boolean;
}): SheetView {
  const items = readScopeItems(input.scopeItems);
  const bids: GridBid[] = sortBids(input.bids).map((b) => {
    const org = b.bidder_organization_id ? input.orgs.get(b.bidder_organization_id) : undefined;
    const cover = bidderCoverage(
      { companyName: b.company_name, contactEmail: b.contact_email, bidderOrgId: b.bidder_organization_id },
      input.certs,
      org ? { insurance_status: org.insurance_status, wsib_status: org.wsib_status } : null,
    );
    return {
      id: b.id,
      company: b.company_name,
      price: num(b.total_price),
      taxAmount: num(b.tax_amount),
      taxPercent: num(b.tax_percent),
      linePrices: readLinePrices(b.line_prices),
      startDate: b.start_date,
      duration: b.duration,
      warranty: b.warranty,
      paymentTerms: b.payment_terms,
      notes: b.notes,
      onPmrfp: Boolean(b.bidder_organization_id),
      orgName: org?.name ?? null,
      profileSlug: org?.approved ? org.slug : null,
      fromRfp: Boolean(b.rfp_interest_id),
      insurance: cover.insurance,
      wsib: cover.wsib,
      insuranceProfile: org?.insurance_status?.trim() || null,
      wsibProfile: org?.wsib_status?.trim() || null,
      contactEmail: input.shared ? null : b.contact_email,
      hasFile: !input.shared && Boolean(b.file_path),
      fileName: input.shared ? null : b.file_name,
      invitedAt: input.shared ? null : b.invited_at,
    };
  });
  const math = compareBids(
    bids.map((b) => ({ id: b.id, price: b.price, taxAmount: b.taxAmount, taxPercent: b.taxPercent, linePrices: b.linePrices })),
    items,
  );
  return { items, bids, math };
}
