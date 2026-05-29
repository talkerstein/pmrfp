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
  categories: string[]; // display names
  regions: string[]; // display names
}

export interface VendorDetail extends VendorListItem {
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
}

export interface RfpListItem {
  slug: string;
  title: string;
  summary: string | null;
  categories: string[];
  regionName: string | null;
  propertyTypeName: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  isDemo: boolean;
}

export interface RfpDetail extends RfpListItem {
  id: string;
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
