/**
 * CanadaBuys award notices → "Past public contract" listings.
 *
 * Real federal contracts already awarded to building trades — who won, for
 * how much, when (CanadaBuys "Award notices", Open Government Licence –
 * Canada). Two jobs:
 *  - Honest proof of activity: the board shows the kind of work that gets
 *    tendered and won, clearly labelled as past public contracts — never as
 *    work that went through PMRFP.
 *  - Real value for trades: what similar contracts sold for, and who's
 *    winning them.
 *
 * Rows land as published with deadline = award date, so the board renders
 * them as closed (grayed, below open tenders) and the open-count banners,
 * alerts and weekly digest — which only count future deadlines — ignore them.
 */
import { parseCsv } from "./csv";
import type { TenderInsert } from "./canadabuys";
import { regionForTender } from "./canadabuys";
import { EXCLUDE, RULES, clean, slugify } from "./shared";
import { OGL_CANADA_ATTRIBUTION } from "./sources";

/** Current fiscal year's awards (Apr–Mar). */
export function awardsUrl(today: string): string {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  return `https://canadabuys.canada.ca/opendata/pub/${start}-${start + 1}-awardNotice-avisAttribution.csv`;
}

/** How long a past contract stays on the board. */
export const AWARD_WINDOW_DAYS = 180;

export type AwardRow = Record<string, string>;

const COL = {
  title: "title-titre-eng",
  ref: "referenceNumber-numeroReference",
  contract: "contractNumber-numeroContrat",
  awarded: "contractAwardDate-dateAttributionContrat",
  amount: "contractAmount-montantContrat",
  total: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
  category: "procurementCategory-categorieApprovisionnement",
  gsin: "gsinDescription-nibsDescription-eng",
  unspsc: "unspscDescription-eng",
  supplier: "supplierLegalName-nomLegalFournisseur-eng",
  supplierCity: "supplierAddressCity-fournisseurAdresseVille-eng",
  entity: "contractingEntityName-nomEntitContractante-eng",
  description: "awardDescription-descriptionAttribution-eng",
  amendment: "amendmentNumber-numeroModification",
} as const;

// Consulting/IT/social work that slips past the trade rules, and civil
// infrastructure (bridges, highways, roads) that isn't building-trade work.
const NOT_TRADE =
  /analyst|\bit security|cyber|advisory|software|consult|construction admin|reintegration|elder|vehicle|bridge|highway|\broad\b|ditching|culvert|civil work|dredg|runway|sediment|abrasives|power engineers|laundry|\bmv\b|vessel|transportation upgrades|prequalification/i;

export function classifyAward(r: AwardRow, today: string): string[] {
  if (!/SRV|CNST/.test(r[COL.category] ?? "")) return [];
  // Amendments repeat the original award; only list the original.
  if ((r[COL.amendment] ?? "000") !== "000") return [];
  const awarded = (r[COL.awarded] ?? "").slice(0, 10);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - AWARD_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  // Future-dated awards are data errors; very old ones are stale.
  if (!awarded || awarded > today || awarded < cutoff) return [];
  if (!(r[COL.supplier] ?? "").trim()) return [];
  // Domestic work only — foreign missions pay in USD/EUR.
  if ((r[COL.currency] || "CAD").trim() !== "CAD") return [];
  const title = (r[COL.title] ?? "").toLowerCase();
  if (EXCLUDE.test(title) || NOT_TRADE.test(title)) return [];
  // Title only: award commodity codes are broad ("rehabilitation services"
  // also covers social programs), so a past contract must *say* it's trade work.
  return RULES.filter(([, p]) => p.test(title)).map(([slug]) => slug).slice(0, 3);
}

function money(r: AwardRow): string | null {
  const v = Math.max(Number(r[COL.amount]) || 0, Number(r[COL.total]) || 0);
  if (!v) return null;
  return `$${Math.round(v).toLocaleString("en-CA")} ${(r[COL.currency] || "CAD").trim()}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function awardToRfpInsert(r: AwardRow, today: string): TenderInsert | null {
  const title = clean(r[COL.title] ?? "");
  const ref = (r[COL.ref] ?? "").trim();
  const contract = (r[COL.contract] ?? "").trim();
  const supplier = clean(r[COL.supplier] ?? "");
  const awarded = (r[COL.awarded] ?? "").slice(0, 10);
  if (!title || !supplier || !awarded || !ref) return null;
  const value = money(r);
  const entity = clean(r[COL.entity] ?? "") || "the Government of Canada";
  const city = clean(r[COL.supplierCity] ?? "");
  const description = clean((r[COL.description] ?? "").replace(/&nbsp;/g, " "));

  const headline = `Awarded ${fmtDate(awarded)} to ${supplier}${city ? ` (${city})` : ""}${value ? ` — ${value}` : " — value not disclosed"}.`;
  return {
    title: title.length > 180 ? `${title.slice(0, 177)}…` : title,
    slug: `${slugify(title).slice(0, 60)}-cba-${slugify(ref)}`.replace(/-+/g, "-"),
    summary: `${headline} Past public contract issued by ${entity}.`,
    scope: [headline, description].filter(Boolean).join("\n\n").slice(0, 8000),
    requirements: null,
    province: regionForTender(r).province,
    // The award date doubles as the "closed" date: the board renders it as a
    // closed listing and every open-count, alert and digest skips it.
    deadline: awarded,
    submission_instructions:
      "This contract has already been awarded — it's listed so trades can see what this kind of work " +
      "sells for and who wins it. It did not go through PMRFP.",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: awardNoticeUrl(slugify(ref)),
    source_notes: `CanadaBuys award ${ref} · contract ${contract} · ${entity}. ${OGL_CANADA_ATTRIBUTION}`,
    status: "published",
    is_demo: false,
    published_at: `${awarded}T00:00:00Z`,
  };
}

/** Official CanadaBuys award page (verified live: lowercase reference number). */
export function awardNoticeUrl(refSlug: string): string {
  return `https://canadabuys.canada.ca/en/tender-opportunities/award-notice/${refSlug}`;
}

export async function fetchAwards(today: string): Promise<AwardRow[]> {
  const res = await fetch(awardsUrl(today), {
    cache: "no-store",
    headers: { "User-Agent": "PMRFP-TenderFeed/1.0 (+https://pmrfp.com)" },
  });
  if (!res.ok) throw new Error(`CanadaBuys awards fetch failed: HTTP ${res.status}`);
  return parseCsv(await res.text());
}
