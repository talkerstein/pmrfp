/**
 * A buyer page as something a clerk can claim: its key, the name its
 * managing organization gets, and its domains for email verification.
 * Pure, so the claim action, the onboarding preview, the admin screen and
 * the tests share it.
 */
import { coreKey, pageKind, type BuyerPage } from "@/lib/buyers/model";
import { buyerKey } from "./managed";
import { townName } from "./data";
import { registrableOf, type DomainHolder } from "./domains";
import type { TownLang } from "./names";

export interface ClaimableBuyer {
  /** "ontario/town-of-cobourg" */
  key: string;
  provinceSlug: string;
  slug: string;
  path: string;
  /** What the page and its organization are called ("Town of Cobourg"). */
  name: string;
  provinceCode: string;
  province: string;
  holder: DomainHolder;
}

/** "Town of Cobourg", "Ville de Gatineau": a directory name that is only a place ("Cobourg") gets the town's formal name. */
export function buyerDisplayName(p: Pick<BuyerPage, "buyer" | "town" | "kind" | "fromBoard">, lang: TownLang): string {
  if (p.town && (pageKind(p) === "town" || !/\b(city|town|township|village|municipality|municipal|county|district|region|regional|ville|cité|municipalité|canton|paroisse)\b/i.test(p.buyer.name))) {
    return townName(p.town, lang);
  }
  return p.buyer.name;
}

/** The same buyer across duplicate directory rows ("City of Calgary" and "City of Calgary (open data)"). */
export const buyerIdentity = (p: Pick<BuyerPage, "buyer">) => `${p.buyer.provinceCode}|${coreKey(p.buyer.name)}`;

/** The page's domain holder: its website domain, every domain on file, plus admin-trusted ones. */
export function domainHolderOf(p: Pick<BuyerPage, "buyer">, trusted: readonly string[] = []): DomainHolder {
  const website = registrableOf(p.buyer.tendersUrl);
  const domains = [...new Set([...(p.buyer.domains ?? []), ...trusted])];
  return { identity: buyerIdentity(p), website: website && domains.includes(website) ? website : null, domains, trusted };
}

export function claimableFrom(p: BuyerPage, trusted: readonly string[] = []): ClaimableBuyer {
  return {
    key: buyerKey(p.provinceSlug, p.buyer.slug),
    provinceSlug: p.provinceSlug,
    slug: p.buyer.slug,
    path: p.path,
    name: buyerDisplayName(p, "en"),
    provinceCode: p.buyer.provinceCode,
    province: p.province,
    holder: domainHolderOf(p, trusted),
  };
}

/** Admin-trusted domains (buyer_domains rows) by buyer key. */
export function trustedByKey(rows: readonly { buyer_key: string; domain: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.buyer_key, [...(out.get(r.buyer_key) ?? []), r.domain]);
  return out;
}

/** Every page's domain holder, for the ownership index (lib/towns/domains domainOwners). */
export function holdersOf(pages: readonly BuyerPage[], trusted: ReadonlyMap<string, readonly string[]>): DomainHolder[] {
  return pages.map((p) => domainHolderOf(p, trusted.get(buyerKey(p.provinceSlug, p.buyer.slug)) ?? []));
}

/**
 * Buyer pages whose name matches a search ("cobourg", "ville de gatineau"),
 * best first: exact place, then name start, then anywhere; bigger places
 * first. For the claim step at onboarding.
 */
export function searchBuyerPages(pages: readonly BuyerPage[], q: string, limit = 20): BuyerPage[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const needle = norm(q);
  if (needle.length < 2) return [];
  const scored: { p: BuyerPage; score: number }[] = [];
  for (const p of pages) {
    const names = [p.buyer.name, ...(p.town ? [townName(p.town, "en"), townName(p.town, "fr"), p.town.name] : [])].map(norm);
    let score = 0;
    for (const n of names) {
      if (n === needle || n.endsWith(` of ${needle}`) || n.endsWith(` de ${needle}`) || n.endsWith(` d ${needle}`)) score = Math.max(score, 3);
      else if (n.startsWith(needle) || n.includes(` ${needle}`)) score = Math.max(score, 2);
      else if (n.includes(needle)) score = Math.max(score, 1);
    }
    if (score) scored.push({ p, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (b.p.town?.population ?? 0) - (a.p.town?.population ?? 0) || a.p.buyer.name.localeCompare(b.p.buyer.name))
    .slice(0, limit)
    .map((x) => x.p);
}
