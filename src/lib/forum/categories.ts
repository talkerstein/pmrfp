/**
 * Forum categories (spec 2.1). Slugs match the forum_categories rows seeded
 * by the migration; names and blurbs live in the forum i18n namespace under
 * `categories[slug]` so they translate.
 */
/**
 * Channels, gamer.co.il style: the forum is a community first, Q&A second.
 * Existing slugs are kept (off-topic is "Off the Clock", jobs-hiring is
 * "Hiring & Crews") so no URL breaks.
 */
export const FORUM_CHANNELS = {
  "shop-talk": ["job-site-stories", "client-talk", "business-pricing", "jobs-hiring", "tools-gear", "marketplace-talk", "codes-permits", "off-topic"],
  trades: ["electrical", "hvac-mechanical", "plumbing", "roofing-envelope", "painting-finishes", "concrete-structure", "landscaping-snow", "cleaning-janitorial"],
  property: ["property-managers", "condo-boards", "general-contractors", "suppliers-equipment"],
  regional: ["quebec", "ontario", "alberta", "british-columbia", "united-states"],
} as const;

export type ForumChannel = keyof typeof FORUM_CHANNELS;
export const CHANNEL_ORDER: readonly ForumChannel[] = ["shop-talk", "trades", "property", "regional"];

export const FORUM_CATEGORY_SLUGS = CHANNEL_ORDER.flatMap((c) => FORUM_CHANNELS[c]) as readonly (typeof FORUM_CHANNELS)[ForumChannel][number][];

export type ForumCategorySlug = (typeof FORUM_CHANNELS)[ForumChannel][number];

export const TRADE_FORUMS: readonly ForumCategorySlug[] = FORUM_CHANNELS.trades;

export function channelOf(slug: ForumCategorySlug): ForumChannel {
  return CHANNEL_ORDER.find((c) => (FORUM_CHANNELS[c] as readonly string[]).includes(slug))!;
}

/** Trade forums default to Question; everything else to Discussion. */
export function defaultThreadType(slug: string): "question" | "discussion" {
  return (FORUM_CHANNELS.trades as readonly string[]).includes(slug) || slug === "codes-permits" ? "question" : "discussion";
}

/** Forums whose threads are never indexed (banter: low SEO value). */
export const NOINDEX_FORUMS: readonly ForumCategorySlug[] = ["off-topic"];

/** French-first forums: their threads are in French and keep their own canonical. */
export const FRENCH_FORUMS: readonly ForumCategorySlug[] = ["quebec"];
export function isFrenchForum(slug: string): boolean {
  return (FRENCH_FORUMS as readonly string[]).includes(slug);
}

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
