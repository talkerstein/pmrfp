/**
 * Sponsorship packages sold on /advertise. Prices are CAD, billed monthly;
 * paying yearly is 10 months (two free). A sold package is delivered as an
 * entry in lib/sponsors/registry.ts, scoped to its trades. A paid sponsor
 * needs a higher score than the house sponsors (Cleverpays, Talkerstein,
 * Maple: 1–3) so it holds its slot instead of rotating with them.
 */
// No Region Spotlight yet: the sponsor registry matches trades, not regions,
// so a region package couldn't be delivered as sold.
export type SponsorPackageId = "trade" | "founding";

export interface SponsorPackage {
  id: SponsorPackageId;
  name: string;
  monthly: number;
  summary: string;
  features: string[];
  /** Short scarcity or terms line under the price. */
  note?: string;
}

/** Months billed when paying for a year up front. */
export const ANNUAL_MONTHS_BILLED = 10;

export const SPONSOR_PACKAGES: SponsorPackage[] = [
  {
    id: "trade",
    name: "Trade Spotlight",
    monthly: 149,
    summary: "One trade, everywhere it shows up on PMRFP.",
    features: [
      "That trade's pages, in every region",
      "Its tender and RFP pages, beside the scope",
      "Dashboards of members in that trade",
      "That trade's daily match emails",
      "Monthly click report",
    ],
  },
  {
    id: "founding",
    name: "Founding Partner",
    monthly: 399,
    summary: "The whole board, for the first three partners.",
    features: [
      "Every trade and every region",
      "The weekly tender digest email",
      "Named as a founding partner on PMRFP",
      "Price locked for 12 months",
      "Monthly click report",
    ],
    note: "3 partners only",
  },
];

export function sponsorPackage(id: string): SponsorPackage | undefined {
  return SPONSOR_PACKAGES.find((p) => p.id === id);
}

export const cad = (n: number) => `$${n.toLocaleString("en-CA")}`;

/**
 * Signed founding partners, shown on /advertise once there are any. Add one
 * here when the contract is signed (logo goes in /public/logos).
 */
export const FOUNDING_PARTNERS: { name: string; url: string; logo: string }[] = [];
