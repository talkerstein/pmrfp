import { z } from "zod";
import { isOwnPhotoUrl } from "@/lib/projects/photos";
import { projectSlug, slugify } from "@/lib/projects/slug";

/**
 * PMRFP Marketplace: used / surplus construction gear. No payments between
 * users and no commission; buyers message sellers through PMRFP.
 * Pure rules here; reads in ./data, writes in ./actions.
 */

export const CATEGORIES = [
  "heavy-equipment",
  "lifts",
  "scaffolding",
  "trailers",
  "vehicles",
  "power-tools",
  "hand-tools",
  "generators",
  "compressors",
  "surveying",
  "safety",
  "materials",
  "hvac",
  "plumbing",
  "electrical",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "like-new", "used", "for-parts"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const STATUSES = ["draft", "active", "sold", "removed", "expired"] as const;
export type ListingStatus = (typeof STATUSES)[number];

export const CURRENCIES = ["CAD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const COUNTRIES = ["CA", "US"] as const;
export type Country = (typeof COUNTRIES)[number];

/** Free accounts: this many active listings at once. Trade Pro / Featured: unlimited. */
export const FREE_LISTING_LIMIT = 3;
export const MAX_PHOTOS = 10;
export const LISTING_DAYS = 60;
export const FEATURED_DAYS = 14;
export const FEATURED_PRODUCT = "marketplace_featured";
export const FEATURED_PRICE = { CAD: 19, USD: 15 } as const;
/** Category landing pages are indexed only once they have real inventory. */
export const LANDING_MIN_LISTINGS = 3;

export const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
export const isCondition = (v: unknown): v is Condition => typeof v === "string" && (CONDITIONS as readonly string[]).includes(v);

/** Can this seller publish one more active listing? */
export function canAddListing(paid: boolean, activeCount: number): boolean {
  return paid || activeCount < FREE_LISTING_LIMIT;
}

export function listingsLeft(paid: boolean, activeCount: number): number | null {
  return paid ? null : Math.max(0, FREE_LISTING_LIMIT - activeCount);
}

/** Readable slug from the title plus a short random suffix, so two "Scissor lift" ads never collide. */
export function listingSlug(title: string, suffix?: string): string {
  const s = projectSlug(title, suffix);
  return /^[a-z0-9]/.test(s) ? s : `item-${s}`;
}

export { slugify };

export const featuredPrice = (currency: Currency) =>
  currency === "USD" ? { amount: FEATURED_PRICE.USD, currency: "usd" as const } : { amount: FEATURED_PRICE.CAD, currency: "cad" as const };

/**
 * New featured_until after a purchase: 14 days from now, or 14 days added on
 * top of a feature that's still running (buying twice never wastes days).
 */
export function nextFeaturedUntil(current: string | Date | null | undefined, now: Date = new Date()): Date {
  const cur = current ? new Date(current) : null;
  const start = cur && !Number.isNaN(cur.getTime()) && cur > now ? cur : now;
  return new Date(start.getTime() + FEATURED_DAYS * 86_400_000);
}

export function isFeatured(featuredUntil: string | null | undefined, now: Date = new Date()): boolean {
  return Boolean(featuredUntil && new Date(featuredUntil) > now);
}

/** Visible to the public: active and not past its expiry. */
export function isLive(l: { status: string; expiresAt: string }, now: Date = new Date()): boolean {
  return l.status === "active" && new Date(l.expiresAt) > now;
}

/** Status the owner sees: an active listing past its date reads as expired. */
export function effectiveStatus(l: { status: ListingStatus; expiresAt: string }, now: Date = new Date()): ListingStatus {
  return l.status === "active" && new Date(l.expiresAt) <= now ? "expired" : l.status;
}

export function renewedExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LISTING_DAYS * 86_400_000);
}

/** Featured first (latest feature end first), then newest. */
export function sortListings<T extends { featuredUntil: string | null; createdAt: string }>(items: T[], now: Date = new Date()): T[] {
  return [...items].sort((a, b) => {
    const fa = isFeatured(a.featuredUntil, now);
    const fb = isFeatured(b.featuredUntil, now);
    if (fa !== fb) return fa ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface ListingFilters {
  q?: string;
  category?: string;
  condition?: string;
  region?: string;
  city?: string;
  country?: string;
  min?: string;
  max?: string;
}

/** Filter in memory (the board is small; one cached read, filters applied here). */
export function filterListings<
  T extends {
    title: string;
    description: string;
    category: string;
    condition: string;
    regionSlug: string | null;
    city: string | null;
    country: string;
    priceCents: number | null;
  },
>(items: T[], f: ListingFilters): T[] {
  const q = f.q?.trim().toLowerCase();
  const min = f.min && Number.isFinite(Number(f.min)) ? Math.round(Number(f.min) * 100) : null;
  const max = f.max && Number.isFinite(Number(f.max)) ? Math.round(Number(f.max) * 100) : null;
  const city = f.city?.trim().toLowerCase();
  return items.filter((l) => {
    if (q && !`${l.title} ${l.description}`.toLowerCase().includes(q)) return false;
    if (f.category && l.category !== f.category) return false;
    if (f.condition && l.condition !== f.condition) return false;
    if (f.region && l.regionSlug !== f.region) return false;
    if (city && (l.city ?? "").toLowerCase() !== city) return false;
    if (f.country && l.country !== f.country) return false;
    if ((min != null || max != null) && l.priceCents == null) return false;
    if (min != null && l.priceCents! < min) return false;
    if (max != null && l.priceCents! > max) return false;
    return true;
  });
}

/** "$4,500 CAD", or null when the price is on request / missing. */
export function formatPrice(priceCents: number | null, currency: Currency, lang: string = "en"): string | null {
  if (priceCents == null) return null;
  const n = new Intl.NumberFormat(lang === "fr" ? "fr-CA" : lang === "es" ? "es-US" : "en-CA", {
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  }).format(priceCents / 100);
  return lang === "fr" ? `${n} $ ${currency}` : `$${n} ${currency}`;
}

/** Page title: "Used Scissor Lift for Sale — Mississauga | PMRFP Marketplace". */
export function listingPageTitle(p: { title: string; city: string | null; forSale: string; brand: string }): string {
  return `${p.title} ${p.forSale}${p.city ? ` — ${p.city}` : ""} | ${p.brand}`;
}

// ── Photos ───────────────────────────────────────────────────────────

export interface ListingPhoto {
  url: string;
  path: string;
  width: number;
  height: number;
}

export const listingPhotoSchema = z.object({
  url: z.string().max(500),
  path: z.string().max(200),
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
});

/**
 * Stored photos we're willing to render: our bucket, the owner's folder,
 * {uuid}/{uuid}.jpg and nothing else. Same rule as case-study photos.
 */
export function sanitizeListingPhotos(raw: unknown, supabaseUrl: string, ownerId?: string): ListingPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: ListingPhoto[] = [];
  for (const item of raw) {
    const p = listingPhotoSchema.safeParse(item);
    if (!p.success) continue;
    if (!isOwnPhotoUrl(p.data.url, supabaseUrl, ownerId)) continue;
    if (!p.data.url.endsWith(`/${p.data.path}`)) continue;
    out.push(p.data);
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────────────

/** Error codes the forms translate (marketplaceClient.errors). */
export const ERROR_CODES = [
  "title",
  "category",
  "condition",
  "description",
  "price",
  "region",
  "form",
  "signIn",
  "limit",
  "unavailable",
  "notFound",
  "save",
  "rateLimited",
  "message",
  "email",
  "name",
  "send",
  "reason",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const listingSchema = z
  .object({
    title: z.string().trim().min(5, "title").max(120, "title"),
    category: z.enum(CATEGORIES, "category"),
    condition: z.enum(CONDITIONS, "condition"),
    description: z.string().trim().min(20, "description").max(5000, "description"),
    priceOnRequest: z.boolean(),
    price: z.preprocess(emptyToUndef, z.coerce.number("price").min(0, "price").max(1_000_000, "price").optional()),
    currency: z.enum(CURRENCIES).catch("CAD"),
    city: z.string().trim().max(80).optional().default(""),
    regionSlug: z.string().trim().max(80).optional().default(""),
    country: z.enum(COUNTRIES).catch("CA"),
    photos: z.array(listingPhotoSchema).max(MAX_PHOTOS).default([]),
    publish: z.boolean().default(true),
  })
  .refine((d) => d.priceOnRequest || d.price != null, { message: "price", path: ["price"] });

export type ListingInput = z.infer<typeof listingSchema>;

/** First error code from a failed parse. */
export function firstErrorCode(issues: { message: string }[]): ErrorCode {
  const m = issues[0]?.message;
  return (ERROR_CODES as readonly string[]).includes(m ?? "") ? (m as ErrorCode) : "form";
}

export const contactSchema = z.object({
  slug: z.string().trim().min(3).max(100),
  name: z.string().trim().min(2, "name").max(120, "name"),
  email: z.string().trim().email("email").max(254, "email"),
  message: z.string().trim().min(10, "message").max(3000, "message"),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional().default(""),
});

export const reportSchema = z.object({
  slug: z.string().trim().min(3).max(100),
  reason: z.string().trim().min(5, "reason").max(1000, "reason"),
  email: z.preprocess(emptyToUndef, z.string().trim().email("email").max(254).optional()),
  website: z.string().max(0).optional().default(""),
});

// ── SEO ──────────────────────────────────────────────────────────────

const SCHEMA_CONDITION: Record<Condition, string> = {
  new: "https://schema.org/NewCondition",
  "like-new": "https://schema.org/UsedCondition",
  used: "https://schema.org/UsedCondition",
  "for-parts": "https://schema.org/DamagedCondition",
};

/** schema.org Product + Offer. No seller contact details. */
export function productJsonLd(p: {
  title: string;
  description: string;
  url: string;
  condition: Condition;
  priceCents: number | null;
  currency: Currency;
  status: ListingStatus;
  photos: string[];
  category: string;
  city: string | null;
  country: Country;
  sellerName: string | null;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description.slice(0, 500),
    url: p.url,
    category: p.category,
    ...(p.photos.length ? { image: p.photos } : {}),
    offers: {
      "@type": "Offer",
      url: p.url,
      itemCondition: SCHEMA_CONDITION[p.condition],
      availability: p.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      ...(p.priceCents != null ? { price: (p.priceCents / 100).toFixed(2), priceCurrency: p.currency } : {}),
      ...(p.city ? { availableAtOrFrom: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: p.city, addressCountry: p.country } } } : {}),
      ...(p.sellerName ? { seller: { "@type": "Organization", name: p.sellerName } } : {}),
    },
  };
}

/** A category (or category×region) landing is worth indexing only with enough listings. */
export function landingIndexable(count: number): boolean {
  return count >= LANDING_MIN_LISTINGS;
}
