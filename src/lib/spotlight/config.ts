/**
 * Project Spotlight: one reviewed, clearly labelled article about one
 * finished project, for a one-time fee. Prices are fixed per currency (not
 * converted live) because Checkout charges exactly this in the buyer's market.
 */
export const SPOTLIGHT = {
  priceCad: 159,
  priceUsd: 119,
  minWords: 400,
  maxWords: 800,
  maxPhotos: 4,
  minPhotos: 1,
  /** Photos arrive as email attachments, so keep one submission well under the 4.5 MB request limit. */
  maxPhotoBytes: 1_000_000,
  maxTotalBytes: 3_800_000,
} as const;

export type SpotlightMarket = "CA" | "US";

export const spotlightPrice = (market: SpotlightMarket) =>
  market === "US" ? { amount: SPOTLIGHT.priceUsd, currency: "usd" as const } : { amount: SPOTLIGHT.priceCad, currency: "cad" as const };

/** Where the owner is told about every sale and submission. */
export const SPOTLIGHT_PRODUCT = "spotlight";
