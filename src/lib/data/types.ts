/** Display-shaped types returned by the data-access layer to the UI. */

export interface VendorListItem {
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  shortDescription: string | null;
  logoUrl: string | null;
  verified: boolean;
  featured: boolean;
  /** Top paid tier — always also featured; sorts above featured. */
  platinum?: boolean;
  /** Trust signals surfaced on cards. Optional on the base type so other
   *  constructors need not set them; the directory data layer always does. */
  yearsInBusiness?: number | null;
  insuranceStatus?: string | null;
  wsibStatus?: string | null;
  categories: string[]; // display names
  regions: string[]; // display names
}

export interface VendorDetail extends VendorListItem {
  id: string;
  fullDescription: string | null;
  yearsInBusiness: number | null;
  employeeCountRange: string | null;
  insuranceStatus: string | null;
  wsibStatus: string | null;
  emergencyService: boolean;
  propertyTypes: string[];
  contactVisibility: "show_contact" | "request_intro" | "hide_contact";
  // Only populated when contactVisibility === "show_contact"
  website: string | null;
  email: string | null;
  phone: string | null;
  /** Public portfolio photo URLs (listed by storage prefix). */
  portfolioPhotos: string[];
  /** Google rating pulled via the official Places API (display-only — never
   * schema markup; rich-result rules require first-party reviews). */
  googleRating: number | null;
  googleReviewCount: number | null;
}

export interface RfpListItem {
  slug: string;
  title: string;
  /** Buyer's solicitation number, split off the front of public-tender titles. */
  reference?: string | null;
  summary: string | null;
  categories: string[];
  regionName: string | null;
  propertyTypeName: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  isDemo: boolean;
  /** Public photo URLs (from rfp-photos bucket via rfp_documents w/ visibility='public'). */
  photoUrls: string[];
  /** Lifecycle status visible to the public — derived from rfp_posts.status. */
  status: "open" | "awarded" | "closed";
  /** 'public_source' = a public tender aggregated from open government data
   *  (labelled as such everywhere it renders); null for demo data. */
  sourceType: string | null;
  /** GC sub-trade packages only; null until migration 20260924000002 runs. */
  gcProjectName?: string | null;
  /** The public award notice a GC package belongs to. */
  awardedRfpId?: string | null;
}

// Override the optional/narrow status on the full detail with the real one.
export interface RfpDetail extends Omit<RfpListItem, "status"> {
  id: string;
  status: "open" | "awarded" | "closed";
  scope: string | null;
  requirements: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetPublic: boolean;
  desiredStartDate: string | null;
  siteVisitDate: string | null;
  submissionInstructions: string | null;
  contactVisibility: "public_contact" | "pmrfp_mediated" | "anonymous_until_interest_approved";
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Official notice link for public tenders (members only — full row is RLS-gated). */
  sourceUrl: string | null;
  sourceNotes: string | null;
}

export interface ResourceItem {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
}

export interface ResourceDetail extends ResourceItem {
  body: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
}

export interface VendorFilters {
  category?: string;
  region?: string;
  propertyType?: string;
  verified?: boolean;
  q?: string;
  sort?: "featured" | "recent" | "alpha";
  /** Which listing type to return. Defaults to trade companies. */
  orgType?: "trade_company" | "supplier";
}

export interface RfpFilters {
  category?: string;
  region?: string;
  propertyType?: string;
  q?: string;
  sort?: "closing" | "newest";
}
