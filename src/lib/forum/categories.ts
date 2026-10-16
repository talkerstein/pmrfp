/**
 * Forum rooms. Slugs match the forum_categories rows (seeded by
 * 20261006000002_forum.sql, reworked by 20261016000010_forum_rooms.sql);
 * names and blurbs live in the forum i18n namespace under
 * `categories[slug]` so they translate.
 *
 * The structure follows what trades actually talk about on the big trade
 * forums (briefs/forum/2026-10-16-trade-forum-study.md): finding work,
 * pricing, getting paid, running the business, showing the work, a break
 * room, then the trade rooms and regional rooms. Rooms that were renamed or
 * merged keep working: their old slugs redirect (ROOM_REDIRECTS).
 */
export const FORUM_CHANNELS = {
  // "The business": the rooms people use most on every trade forum.
  "shop-talk": ["finding-work", "pricing-estimating", "getting-paid", "running-the-business", "show-your-work", "break-room"],
  trades: [
    "electrical", "hvac-mechanical", "plumbing", "roofing-envelope", "painting-finishes", "concrete-structure",
    "landscaping-snow", "cleaning-janitorial", "general-contractors", "codes-permits", "tools-gear",
  ],
  property: ["property-managers", "condo-boards", "suppliers-equipment"],
  regional: [
    "ontario", "quebec", "alberta", "british-columbia", "prairies", "atlantic",
    "united-states", "us-northeast", "us-midwest", "us-south", "us-west",
  ],
} as const;

export type ForumChannel = keyof typeof FORUM_CHANNELS;
export const CHANNEL_ORDER: readonly ForumChannel[] = ["shop-talk", "trades", "property", "regional"];

export const FORUM_CATEGORY_SLUGS = CHANNEL_ORDER.flatMap((c) => FORUM_CHANNELS[c]) as readonly (typeof FORUM_CHANNELS)[ForumChannel][number][];

export type ForumCategorySlug = (typeof FORUM_CHANNELS)[ForumChannel][number];

/** The eight trade rooms (directory trades map onto these). */
export const TRADE_FORUMS = [
  "electrical", "hvac-mechanical", "plumbing", "roofing-envelope", "painting-finishes", "concrete-structure", "landscaping-snow", "cleaning-janitorial",
] as const satisfies readonly ForumCategorySlug[];

export function channelOf(slug: ForumCategorySlug): ForumChannel {
  return CHANNEL_ORDER.find((c) => (FORUM_CHANNELS[c] as readonly string[]).includes(slug))!;
}

/** Trade rooms (and codes) default to Question; everything else to Discussion. */
export function defaultThreadType(slug: string): "question" | "discussion" {
  return (TRADE_FORUMS as readonly string[]).includes(slug) || slug === "codes-permits" || slug === "running-the-business" ? "question" : "discussion";
}

/** Rooms whose threads are never indexed (banter: low SEO value). */
export const NOINDEX_FORUMS: readonly ForumCategorySlug[] = ["break-room"];

/** French-first rooms: their threads are in French and keep their own canonical. */
export const FRENCH_FORUMS: readonly ForumCategorySlug[] = ["quebec"];
export function isFrenchForum(slug: string): boolean {
  return (FRENCH_FORUMS as readonly string[]).includes(slug);
}

export function isForumCategory(v: unknown): v is ForumCategorySlug {
  return typeof v === "string" && (FORUM_CATEGORY_SLUGS as readonly string[]).includes(v);
}

// ── Renamed and merged rooms ────────────────────────────────────────
/**
 * Old room slug → the room that replaced it. Renames keep the same
 * forum_categories row (same id, same threads); jobs-hiring was merged
 * (its threads moved into running-the-business). Every old URL
 * (/forum/<old>, /forum/<old>/new, /forum/<old>/page/N and thread URLs)
 * permanently redirects. Mirrored in the migration; test/forum-rooms.test.ts
 * keeps them in sync.
 */
export const ROOM_REDIRECTS = {
  "marketplace-talk": "finding-work",
  "business-pricing": "pricing-estimating",
  "client-talk": "getting-paid",
  "job-site-stories": "show-your-work",
  "jobs-hiring": "running-the-business",
  "off-topic": "break-room",
} as const satisfies Record<string, ForumCategorySlug>;

export type LegacyRoomSlug = keyof typeof ROOM_REDIRECTS;

/** The room an old slug now lives at, or null for a current (or unknown) slug. */
export function redirectRoom(slug: string): ForumCategorySlug | null {
  return (ROOM_REDIRECTS as Record<string, ForumCategorySlug>)[slug] ?? null;
}

/** A current room slug for any slug a database row or URL may carry (old or new), else null. */
export function canonicalRoom(slug: string | null | undefined): ForumCategorySlug | null {
  if (!slug) return null;
  if (isForumCategory(slug)) return slug;
  return redirectRoom(slug);
}

/** Every slug a room's database row may still carry (itself, plus old names until the migration runs). */
export function roomSlugCandidates(slug: ForumCategorySlug): string[] {
  return [slug, ...Object.entries(ROOM_REDIRECTS).filter(([, to]) => to === slug).map(([from]) => from)];
}

// ── Regional rooms (country-first, province/state-first) ────────────
export type RoomCountry = "CA" | "US";

/** Province/state (full name, as canonicalProvince returns it) → its regional room. */
const PROVINCE_ROOM: Record<string, ForumCategorySlug> = {
  Ontario: "ontario",
  Quebec: "quebec",
  Alberta: "alberta",
  "British Columbia": "british-columbia",
  Saskatchewan: "prairies",
  Manitoba: "prairies",
  "New Brunswick": "atlantic",
  "Nova Scotia": "atlantic",
  "Prince Edward Island": "atlantic",
  "Newfoundland and Labrador": "atlantic",
};

/** U.S. Census regions. */
const US_REGION: Record<string, ForumCategorySlug> = {};
const census: [ForumCategorySlug, string[]][] = [
  ["us-northeast", ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"]],
  ["us-midwest", ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"]],
  [
    "us-south",
    [
      "Delaware", "Florida", "Georgia", "Maryland", "North Carolina", "South Carolina", "Virginia", "District of Columbia", "West Virginia",
      "Alabama", "Kentucky", "Mississippi", "Tennessee", "Arkansas", "Louisiana", "Oklahoma", "Texas", "Puerto Rico",
    ],
  ],
  ["us-west", ["Arizona", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Utah", "Wyoming", "Alaska", "California", "Hawaii", "Oregon", "Washington"]],
];
for (const [room, states] of census) for (const s of states) US_REGION[s] = room;

/**
 * The regional room for a province/state name ("Ontario", "Texas"), or null
 * (territories, unknown places). Pass names, not codes: callers run
 * canonicalProvince() first.
 */
export function roomForProvince(province: string | null | undefined): ForumCategorySlug | null {
  if (!province) return null;
  return PROVINCE_ROOM[province] ?? US_REGION[province] ?? null;
}

/** Every province/state a regional room covers (empty for non-regional rooms; united-states covers none: it's national). */
export function provincesForRoom(slug: ForumCategorySlug): string[] {
  return [...Object.entries(PROVINCE_ROOM), ...Object.entries(US_REGION)].filter(([, r]) => r === slug).map(([p]) => p);
}

/** The country of a regional room, or null for rooms that serve both countries. */
export function roomCountry(slug: string): RoomCountry | null {
  if (slug === "united-states" || slug.startsWith("us-")) return "US";
  if ((["ontario", "quebec", "alberta", "british-columbia", "prairies", "atlantic"] as string[]).includes(slug)) return "CA";
  return null;
}

/** The regional channel in the visitor's order: their own region's room, then their country's, then the other country's. */
export function regionalOrder(slugs: readonly ForumCategorySlug[], visitor: { country: RoomCountry; province: string | null }): ForumCategorySlug[] {
  const home = roomForProvince(visitor.province);
  const rank = (s: ForumCategorySlug) => (s === home ? 0 : roomCountry(s) === visitor.country ? 1 : 2);
  return [...slugs].sort((a, b) => rank(a) - rank(b));
}

// ── Directory trades ↔ trade rooms ──────────────────────────────────
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

/** Every directory trade a forum covers ("electrical" → electrical, lighting, ev-charging). Empty for non-trade forums. */
export function tradesForForum(slug: ForumCategorySlug): string[] {
  return Object.entries(TRADE_TO_FORUM).filter(([, f]) => f === slug).map(([t]) => t);
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
