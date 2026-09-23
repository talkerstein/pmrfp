/**
 * Who issued a public tender and how to credit them — derived from the slug
 * suffix each importer writes ("-cb-" CanadaBuys, "-tor-" City of Toronto),
 * because the public rfp_public view only exposes source_type, not the
 * source URL or notes. Safe to import from any component.
 */
export const OGL_CANADA_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Canada.";
export const OGL_TORONTO_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Toronto.";

export interface PublicTenderSource {
  key: "canadabuys" | "toronto";
  /** Short badge text for cards. */
  badge: string;
  /** "Issued by …" */
  issuer: string;
  /** Where bids actually go. */
  portal: string;
  attribution: string;
}

export function publicTenderSource(slug: string): PublicTenderSource {
  if (/-tor-[a-z0-9-]+$/.test(slug)) {
    return {
      key: "toronto",
      badge: "Public tender · City of Toronto",
      issuer: "the City of Toronto",
      portal: "the City of Toronto bid portal",
      attribution: OGL_TORONTO_ATTRIBUTION,
    };
  }
  return {
    key: "canadabuys",
    badge: "Public tender · Gov. of Canada",
    issuer: "the Government of Canada",
    portal: "CanadaBuys",
    attribution: OGL_CANADA_ATTRIBUTION,
  };
}
