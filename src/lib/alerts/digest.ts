/**
 * Daily match digests for paying members: ONE email per person per day with
 * every new RFP that matches their trades and regions — not one email per
 * RFP. With ~50 new public tenders a day (Canada + U.S. federal), per-RFP
 * emails would bury members in their inbox. Pure, so it's testable without a
 * database or a mail server.
 */

export interface DigestRfp {
  id: string;
  slug: string;
  title: string;
  deadline: string | null;
  regionId: string | null;
  regionName: string | null;
  categoryIds: string[];
  categoryNames: string[];
  /** Plain-English summary (bid checklist) or the notice summary. */
  summary: string | null;
}

export interface DigestInput {
  rfps: DigestRfp[];
  paidOrgIds: string[];
  catsByOrg: Map<string, Set<string>>;
  /** Already expanded to descendants (a trade serving Ontario serves Toronto). */
  regionsByOrg: Map<string, Set<string>>;
  usersByOrg: Map<string, Set<string>>;
  emailByUser: Map<string, string>;
  /** Users who turned opportunity emails off. */
  optedOut: Set<string>;
  /** `${userId}|${slug}` already notified. */
  alreadySent: Set<string>;
}

export interface Digest {
  userId: string;
  email: string;
  items: DigestRfp[];
  /** The trade that matched most often ("HVAC"), for the subject line. */
  tradeLabel: string;
}

export function buildDigests(input: DigestInput): Digest[] {
  const byUser = new Map<string, { email: string; items: Map<string, DigestRfp>; trades: Map<string, number> }>();

  for (const orgId of input.paidOrgIds) {
    const cats = input.catsByOrg.get(orgId);
    if (!cats?.size) continue;
    const regions = input.regionsByOrg.get(orgId) ?? new Set<string>();
    const matches = input.rfps.filter(
      (r) => r.categoryIds.some((c) => cats.has(c)) && (!r.regionId || regions.has(r.regionId)),
    );
    if (!matches.length) continue;

    for (const userId of input.usersByOrg.get(orgId) ?? []) {
      const email = input.emailByUser.get(userId);
      if (!email || input.optedOut.has(userId)) continue;
      const entry = byUser.get(userId) ?? { email, items: new Map(), trades: new Map() };
      for (const r of matches) {
        if (input.alreadySent.has(`${userId}|${r.slug}`) || entry.items.has(r.id)) continue;
        entry.items.set(r.id, r);
        r.categoryIds.forEach((c, i) => {
          if (cats.has(c)) entry.trades.set(r.categoryNames[i] ?? "", (entry.trades.get(r.categoryNames[i] ?? "") ?? 0) + 1);
        });
      }
      byUser.set(userId, entry);
    }
  }

  const out: Digest[] = [];
  for (const [userId, e] of byUser) {
    if (!e.items.size) continue;
    const items = [...e.items.values()].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
    const tradeLabel = [...e.trades.entries()].filter(([t]) => t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "commercial";
    out.push({ userId, email: e.email, items, tradeLabel });
  }
  return out;
}

/** "3 new HVAC matches today" / "1 new HVAC match today". */
export function digestSubject(d: Pick<Digest, "items" | "tradeLabel">): string {
  const n = d.items.length;
  return `${n} new ${d.tradeLabel} ${n === 1 ? "match" : "matches"} on PMRFP today`;
}
