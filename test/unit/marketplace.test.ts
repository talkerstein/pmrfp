import { describe, expect, it } from "vitest";
import {
  FEATURED_DAYS,
  FREE_LISTING_LIMIT,
  canAddListing,
  contactSchema,
  effectiveStatus,
  featuredPrice,
  filterListings,
  firstErrorCode,
  formatPrice,
  isFeatured,
  landingIndexable,
  listingPageTitle,
  listingSchema,
  listingSlug,
  listingsLeft,
  nextFeaturedUntil,
  productJsonLd,
  sanitizeListingPhotos,
  sortListings,
} from "@/lib/marketplace/rules";

const SB = "https://abc.supabase.co";
const USER = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const DAY = 86_400_000;

const base = {
  title: "Genie GS-1930 scissor lift",
  category: "lifts",
  condition: "used",
  description: "Runs well, 1,200 hours, new batteries last spring.",
  priceOnRequest: false,
  price: "4500",
  currency: "CAD",
  city: "Mississauga",
  regionSlug: "peel",
  country: "CA",
  photos: [],
  publish: true,
};

describe("listing validation", () => {
  it("accepts a complete listing and coerces the price", () => {
    const r = listingSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.price).toBe(4500);
  });

  it("needs a price unless price on request", () => {
    const r = listingSchema.safeParse({ ...base, price: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstErrorCode(r.error.issues)).toBe("price");
    expect(listingSchema.safeParse({ ...base, price: "", priceOnRequest: true }).success).toBe(true);
  });

  it("rejects bad category, condition, short title and short description with codes", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ category: "weapons" }, "category"],
      [{ condition: "mint" }, "condition"],
      [{ title: "Lift" }, "title"],
      [{ description: "Good" }, "description"],
      [{ price: "-5" }, "price"],
    ];
    for (const [patch, code] of cases) {
      const r = listingSchema.safeParse({ ...base, ...patch });
      expect(r.success).toBe(false);
      if (!r.success) expect(firstErrorCode(r.error.issues)).toBe(code);
    }
  });

  it("falls back to CAD / CA for unknown currency or country", () => {
    const r = listingSchema.safeParse({ ...base, currency: "EUR", country: "MX" });
    expect(r.success && r.data.currency === "CAD" && r.data.country === "CA").toBe(true);
  });

  it("contact form: honeypot must be empty, email must be valid", () => {
    const ok = { slug: "lift-abcde", name: "Sam", email: "sam@example.com", message: "Is this still available?" };
    expect(contactSchema.safeParse(ok).success).toBe(true);
    expect(contactSchema.safeParse({ ...ok, website: "spam.com" }).success).toBe(false);
    const bad = contactSchema.safeParse({ ...ok, email: "nope" });
    expect(!bad.success && firstErrorCode(bad.error.issues)).toBe("email");
  });
});

describe("entitlement limit", () => {
  it("free accounts get FREE_LISTING_LIMIT active listings", () => {
    expect(FREE_LISTING_LIMIT).toBe(3);
    expect(canAddListing(false, 0)).toBe(true);
    expect(canAddListing(false, 2)).toBe(true);
    expect(canAddListing(false, 3)).toBe(false);
    expect(listingsLeft(false, 2)).toBe(1);
    expect(listingsLeft(false, 5)).toBe(0);
  });

  it("paid (Trade Pro / Featured) is unlimited", () => {
    expect(canAddListing(true, 50)).toBe(true);
    expect(listingsLeft(true, 50)).toBeNull();
  });
});

describe("slug", () => {
  it("reads as the title plus a suffix", () => {
    expect(listingSlug("Used Scissor Lift — 19ft!", "abcde")).toBe("used-scissor-lift-19ft-abcde");
  });

  it("strips accents and matches the DB check", () => {
    const s = listingSlug("Échafaudage à vendre", "xy234");
    expect(s).toBe("echafaudage-a-vendre-xy234");
    expect(s).toMatch(/^[a-z0-9][a-z0-9-]{2,90}$/);
  });

  it("never produces an invalid slug for symbol-only titles", () => {
    expect(listingSlug("!!!", "abcde")).toMatch(/^[a-z0-9][a-z0-9-]{2,90}$/);
  });

  it("random suffixes differ", () => {
    expect(listingSlug("Generator")).not.toBe(listingSlug("Generator"));
  });
});

describe("featured logic", () => {
  const now = new Date("2026-10-06T12:00:00Z");

  it("starts 14 days from now when not featured", () => {
    expect(nextFeaturedUntil(null, now).getTime()).toBe(now.getTime() + FEATURED_DAYS * DAY);
    expect(nextFeaturedUntil("2026-09-01T00:00:00Z", now).getTime()).toBe(now.getTime() + FEATURED_DAYS * DAY);
  });

  it("stacks on top of a running feature", () => {
    const running = new Date(now.getTime() + 3 * DAY);
    expect(nextFeaturedUntil(running.toISOString(), now).getTime()).toBe(running.getTime() + FEATURED_DAYS * DAY);
  });

  it("isFeatured respects the end date", () => {
    expect(isFeatured(new Date(now.getTime() + DAY).toISOString(), now)).toBe(true);
    expect(isFeatured(new Date(now.getTime() - DAY).toISOString(), now)).toBe(false);
    expect(isFeatured(null, now)).toBe(false);
  });

  it("sorts featured first, then newest", () => {
    const items = [
      { id: "old", featuredUntil: null, createdAt: "2026-10-01" },
      { id: "new", featuredUntil: null, createdAt: "2026-10-05" },
      { id: "feat", featuredUntil: "2026-10-20T00:00:00Z", createdAt: "2026-09-01" },
      { id: "lapsed", featuredUntil: "2026-10-01T00:00:00Z", createdAt: "2026-10-04" },
    ];
    expect(sortListings(items, now).map((i) => i.id)).toEqual(["feat", "new", "lapsed", "old"]);
  });

  it("prices: $19 CAD / $15 USD", () => {
    expect(featuredPrice("CAD")).toEqual({ amount: 19, currency: "cad" });
    expect(featuredPrice("USD")).toEqual({ amount: 15, currency: "usd" });
  });
});

describe("expiry, filters, display", () => {
  const now = new Date("2026-10-06T12:00:00Z");

  it("an active listing past expires_at reads as expired", () => {
    expect(effectiveStatus({ status: "active", expiresAt: "2026-10-05T00:00:00Z" }, now)).toBe("expired");
    expect(effectiveStatus({ status: "active", expiresAt: "2026-11-05T00:00:00Z" }, now)).toBe("active");
    expect(effectiveStatus({ status: "sold", expiresAt: "2026-10-05T00:00:00Z" }, now)).toBe("sold");
  });

  it("filters by text, category, price and city", () => {
    const mk = (o: Partial<{ title: string; category: string; priceCents: number | null; city: string | null }>) => ({
      title: "Lift",
      description: "",
      category: "lifts",
      condition: "used",
      regionSlug: "peel",
      city: "Mississauga",
      country: "CA",
      priceCents: 100_000,
      ...o,
    });
    const items = [mk({ title: "Scissor lift" }), mk({ title: "Frame scaffolding", category: "scaffolding", priceCents: 50_000 }), mk({ title: "Generator", priceCents: null, city: "Calgary" })];
    expect(filterListings(items, { q: "scaff" })).toHaveLength(1);
    expect(filterListings(items, { category: "lifts" })).toHaveLength(2);
    expect(filterListings(items, { max: "600" })).toHaveLength(1);
    expect(filterListings(items, { city: "calgary" })).toHaveLength(1);
  });

  it("formats prices and SEO titles", () => {
    expect(formatPrice(450000, "CAD")).toBe("$4,500 CAD");
    expect(formatPrice(null, "USD")).toBeNull();
    expect(listingPageTitle({ title: "Used Scissor Lift", city: "Mississauga", forSale: "for Sale", brand: "PMRFP Marketplace" })).toBe(
      "Used Scissor Lift for Sale — Mississauga | PMRFP Marketplace",
    );
  });

  it("landing pages index only with 3+ listings", () => {
    expect(landingIndexable(2)).toBe(false);
    expect(landingIndexable(3)).toBe(true);
  });

  it("Product JSON-LD carries an Offer with condition and price", () => {
    const ld = productJsonLd({
      title: "Lift",
      description: "Desc",
      url: "https://pmrfp.com/marketplace/lift-abcde",
      condition: "used",
      priceCents: 450000,
      currency: "CAD",
      status: "active",
      photos: [],
      category: "Lifts",
      city: "Mississauga",
      country: "CA",
      sellerName: null,
    }) as { offers: Record<string, unknown> };
    expect(ld.offers.price).toBe("4500.00");
    expect(ld.offers.priceCurrency).toBe("CAD");
    expect(ld.offers.itemCondition).toBe("https://schema.org/UsedCondition");
  });
});

describe("photo sanitizing", () => {
  const url = `${SB}/storage/v1/object/public/project-photos/${USER}/${PHOTO}.jpg`;
  const good = { url, path: `${USER}/${PHOTO}.jpg`, width: 800, height: 600 };

  it("keeps our own photos in the owner's folder", () => {
    expect(sanitizeListingPhotos([good], SB, USER)).toHaveLength(1);
  });

  it("drops foreign hosts, other users' folders and junk", () => {
    expect(sanitizeListingPhotos([{ ...good, url: "https://evil.example/x.jpg" }], SB, USER)).toHaveLength(0);
    expect(sanitizeListingPhotos([good], SB, "33333333-3333-4333-8333-333333333333")).toHaveLength(0);
    expect(sanitizeListingPhotos("nope", SB, USER)).toHaveLength(0);
  });
});
