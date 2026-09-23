import { z } from "zod";

/**
 * "Can my company bid?" — what decides whether a trade can bid, pulled from a
 * tender's own notice text. Every field allows "unknown": the notice is often
 * silent, and a wrong "not required" is worse than an honest "check the
 * documents".
 */
const requirement = z.object({
  status: z.enum(["required", "not_required", "unknown"]),
  /** What the notice says, in a few words ("10% bid bond, 50% performance bond"). Empty when unknown. */
  detail: z.string(),
});

export const bidCheckSchema = z.object({
  /** One or two plain-English sentences: the work, where, and scale if stated. */
  plainSummary: z.string(),
  siteVisit: z.object({
    status: z.enum(["mandatory", "optional", "none", "unknown"]),
    detail: z.string(),
  }),
  bonding: requirement,
  insurance: requirement,
  securityClearance: requirement,
  /** Licences, certifications and registrations the notice names (e.g. "COR", "ESA licence"). */
  licences: z.array(z.string()).max(6),
  /** Experience / references required, as stated. Empty if not stated. */
  experience: z.string(),
  /** Set-aside or eligibility restriction (small business, Indigenous, etc.). Empty if none stated. */
  setAside: z.string(),
  /** How bids are submitted and any questions deadline, as stated. Empty if not stated. */
  submission: z.string(),
  /** Up to three things a small contractor could easily miss. */
  watchOuts: z.array(z.string()).max(3),
});

export type BidCheck = z.infer<typeof bidCheckSchema>;

export interface BidCheckRow {
  key: string;
  label: string;
  /** "yes" = needed / applies, "no" = explicitly not needed, "unknown" = the notice doesn't say. */
  state: "yes" | "no" | "unknown";
  value: string;
}

const req = (s: "required" | "not_required" | "unknown"): BidCheckRow["state"] =>
  s === "required" ? "yes" : s === "not_required" ? "no" : "unknown";

/** Flatten a check into display rows (same order everywhere: page, teaser, email). */
export function bidCheckRows(c: BidCheck): BidCheckRow[] {
  const site = c.siteVisit.status;
  return [
    {
      key: "siteVisit",
      label: "Site visit",
      state: site === "mandatory" ? "yes" : site === "none" || site === "optional" ? "no" : "unknown",
      value: site === "optional" ? `Optional${c.siteVisit.detail ? `: ${c.siteVisit.detail}` : ""}` : c.siteVisit.detail,
    },
    { key: "bonding", label: "Bonding", state: req(c.bonding.status), value: c.bonding.detail },
    { key: "insurance", label: "Insurance", state: req(c.insurance.status), value: c.insurance.detail },
    { key: "securityClearance", label: "Security clearance", state: req(c.securityClearance.status), value: c.securityClearance.detail },
    { key: "licences", label: "Licences & certifications", state: c.licences.length ? "yes" : "unknown", value: c.licences.join(", ") },
    { key: "experience", label: "Experience & references", state: c.experience ? "yes" : "unknown", value: c.experience },
    { key: "setAside", label: "Set-aside / eligibility", state: c.setAside ? "yes" : "unknown", value: c.setAside },
    { key: "submission", label: "How to submit", state: c.submission ? "yes" : "unknown", value: c.submission },
  ];
}

/** Rows the notice actually covers — shown (values hidden) to non-members. */
export function coveredRows(c: BidCheck): BidCheckRow[] {
  return bidCheckRows(c).filter((r) => r.state !== "unknown");
}
