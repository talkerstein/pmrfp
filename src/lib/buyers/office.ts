import type { DirectoryBuyer } from "./model";
import { cityByBuyer } from "@/lib/tenders/city-sources";
import type { ManagedPage } from "@/lib/towns/managed";

/**
 * A public buyer's general office details, free for everyone.
 *
 * Why (depth study, 2026-10-22): ConstructConnect/DCN shows the owner's
 * address, phone and website on every public tender; PMRFP showed none of it
 * without Trade Pro. A city's switchboard or procurement inbox is the
 * organization's own public information, so it is free. What stays in Trade Pro
 * is what the NOTICE names: the individual contact (name, direct line, direct
 * email) and the bid checklist.
 *
 * Rules:
 *  - Only what PMRFP holds, from a public source: the buyer directory (its own
 *    website and its role-based procurement inbox as the buyer publishes it), a
 *    city source's published procurement contact, and what a verified buyer
 *    chose to show on its own page. Nothing is looked up or guessed, so a field
 *    we don't hold is null and the page leaves the row out.
 *  - Organization level only. Nothing here reads a tender's own contact fields
 *    (rfp_posts.contact_*), which are the named person on that notice.
 *  - A general office ADDRESS is not held for any buyer today (the directory has
 *    none, and a claimed page has no address field), so it is not a field yet.
 */

export interface BuyerOffice {
  /** The buyer's own website (its domain), https. */
  website: string | null;
  /** Its official bids / purchasing page. */
  bidsPage: string | null;
  /** The role-based procurement inbox it publishes (never a named person). */
  procurementEmail: string | null;
  /** Its procurement or switchboard phone, as published. */
  phone: string | null;
}

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** https://domain for the first well-formed domain the directory lists for the buyer, else null. */
export function officeWebsite(domains: readonly string[] | undefined): string | null {
  const d = (domains ?? []).map((x) => x.trim().toLowerCase()).find((x) => DOMAIN.test(x));
  return d ? `https://${d}` : null;
}

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/**
 * The office details held for a buyer, or null when there are none. `managed`
 * is the verified buyer's own page (its contact shows only when the buyer chose
 * to publish it); the city source is the procurement contact the buyer's own
 * bids page lists.
 */
export function buyerOffice(buyer: DirectoryBuyer, managed?: Pick<ManagedPage, "contactEmail" | "contactPhone" | "bidsUrl"> | null): BuyerOffice | null {
  const city = cityByBuyer(buyer.slug);
  const office: BuyerOffice = {
    website: officeWebsite(buyer.domains),
    bidsPage: clean(managed?.bidsUrl) ?? clean(buyer.tendersUrl),
    procurementEmail: clean(managed?.contactEmail) ?? clean(buyer.email) ?? clean(city?.contact.email),
    phone: clean(managed?.contactPhone) ?? clean(city?.contact.phone),
  };
  return hasOffice(office) ? office : null;
}

export function hasOffice(o: BuyerOffice | null | undefined): o is BuyerOffice {
  return Boolean(o && (o.website || o.bidsPage || o.procurementEmail || o.phone));
}

/**
 * Who sees what of a public tender's contact data. The office is free to
 * everyone; the person named on the notice and the bid checklist are Trade Pro.
 * The tender page and the card both read this one rule.
 */
export function contactAccess(viewer: { pro: boolean }): { office: true; namedContact: boolean; bidChecklist: boolean } {
  return { office: true, namedContact: viewer.pro, bidChecklist: viewer.pro };
}
