/**
 * Forum categories (spec 2.1). Slugs match the forum_categories rows seeded
 * by the migration; names and blurbs live in the forum i18n namespace under
 * `categories[slug]` so they translate.
 */
export const FORUM_CATEGORY_SLUGS = [
  "electrical",
  "hvac-mechanical",
  "plumbing",
  "roofing-envelope",
  "painting-finishes",
  "concrete-structure",
  "landscaping-snow",
  "cleaning-janitorial",
  "general-contractors",
  "property-managers",
  "suppliers-equipment",
  "jobs-hiring",
  "marketplace-talk",
  "codes-permits",
  "off-topic",
] as const;

export type ForumCategorySlug = (typeof FORUM_CATEGORY_SLUGS)[number];

/** The first eight are trade forums; the rest are community forums. */
export const TRADE_FORUMS: readonly ForumCategorySlug[] = FORUM_CATEGORY_SLUGS.slice(0, 8);
export const COMMUNITY_FORUMS: readonly ForumCategorySlug[] = FORUM_CATEGORY_SLUGS.slice(8);

export function isForumCategory(v: unknown): v is ForumCategorySlug {
  return typeof v === "string" && (FORUM_CATEGORY_SLUGS as readonly string[]).includes(v);
}

/** Directory trade slug (trade_categories.slug) → its forum. */
const TRADE_TO_FORUM: Record<string, ForumCategorySlug> = {
  electrical: "electrical",
  lighting: "electrical",
  "ev-charging": "electrical",
  hvac: "hvac-mechanical",
  "building-automation": "hvac-mechanical",
  "energy-efficiency": "hvac-mechanical",
  "elevator-services": "hvac-mechanical",
  plumbing: "plumbing",
  roofing: "roofing-envelope",
  waterproofing: "roofing-envelope",
  "glass-and-windows": "roofing-envelope",
  masonry: "concrete-structure",
  "concrete-and-asphalt": "concrete-structure",
  "parking-lot-maintenance": "concrete-structure",
  demolition: "concrete-structure",
  painting: "painting-finishes",
  drywall: "painting-finishes",
  flooring: "painting-finishes",
  carpentry: "painting-finishes",
  millwork: "painting-finishes",
  landscaping: "landscaping-snow",
  "snow-removal": "landscaping-snow",
  "cleaning-janitorial": "cleaning-janitorial",
  "general-contracting": "general-contractors",
  restoration: "general-contractors",
  "property-maintenance": "general-contractors",
  "handyman-maintenance": "general-contractors",
};

export function forumForTrade(tradeSlug: string): ForumCategorySlug | null {
  return TRADE_TO_FORUM[tradeSlug] ?? null;
}

/** Forum → the directory trade page it cross-links to (AEO internal linking). */
const FORUM_TO_TRADE: Partial<Record<ForumCategorySlug, string>> = {
  electrical: "electrical",
  "hvac-mechanical": "hvac",
  plumbing: "plumbing",
  "roofing-envelope": "roofing",
  "painting-finishes": "painting",
  "concrete-structure": "concrete-and-asphalt",
  "landscaping-snow": "landscaping",
  "cleaning-janitorial": "cleaning-janitorial",
  "general-contractors": "general-contracting",
};

export function tradeForForum(slug: ForumCategorySlug): string | null {
  return FORUM_TO_TRADE[slug] ?? null;
}
