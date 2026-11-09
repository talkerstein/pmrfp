import { z } from "zod";
import { COMMON_TRADE_SLUGS } from "@/lib/trades/order";

/**
 * Report → Quotes: pure rules. A realtor or property manager uploads an
 * inspection / condition report, the AI lists the repair items, the user
 * reviews them, and each trade group becomes a draft RFP or quote requests.
 * Database, storage and email live in ./server; the model call in ./ai.
 */

export const REPORT_BUCKET = "report-quotes";
/** PDF only, 15 MB max (the bucket and the table enforce the same). */
export const MAX_REPORT_BYTES = 15 * 1024 * 1024;
/** Uploads per organization in any rolling 24 hours (the AI read costs money). */
export const DAILY_UPLOAD_LIMIT = 10;
/** Stored PDFs are deleted this long after upload (report_deleted_after). */
export const RETENTION_DAYS = 90;
/** Items one report can hold (a long building condition assessment fits). */
export const MAX_ITEMS = 150;
/** Trades one quote request goes to at once. */
export const MAX_QUOTE_RECIPIENTS = 10;
/** The same trade group isn't re-sent to the same company within this many days. */
export const RESEND_GUARD_DAYS = 7;

export const URGENCIES = ["safety", "soon", "monitor"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const REPORT_TYPES = ["home_inspection", "pre_listing", "move_out", "annual", "condition_assessment", "reserve_fund", "other"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportCountry = "CA" | "US";

export interface TradeOption {
  slug: string;
  name: string;
}

// ── Items ────────────────────────────────────────────────────────────

const TRADE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** One repair item as the review editor sends it (and as the table stores it). */
export const itemSchema = z.object({
  trade_slug: z.string().regex(TRADE_SLUG).nullable(),
  item: z.string().trim().min(1).max(500),
  location: z.string().trim().max(160).default(""),
  urgency: z.enum(URGENCIES),
  source_page: z.number().int().min(1).max(2000).nullable().default(null),
});
export type ReportItem = z.infer<typeof itemSchema>;

export const itemsSchema = z.array(itemSchema).max(MAX_ITEMS);

/** What the review editor saves: the items plus the property details. */
export const reviewSchema = z.object({
  items: itemsSchema,
  title: z.string().trim().min(1).max(160),
  reportType: z.enum(REPORT_TYPES),
  buildingName: z.string().trim().max(160).default(""),
  streetAddress: z.string().trim().max(200).default(""),
  city: z.string().trim().max(120).default(""),
  region: z.string().trim().max(60).default(""),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/**
 * What the model returns. Loose on purpose (plain strings, page 0 = not
 * stated): Gemini's JSON-schema subset has no nullable integers, and a
 * near-miss value ("High", "electrician") is fixed by normalizeModelItems
 * instead of failing the whole report.
 */
export const modelOutputSchema = z.object({
  items: z
    .array(
      z.object({
        trade_slug: z.string(),
        item: z.string(),
        location: z.string(),
        urgency: z.string(),
        source_page: z.number().int().min(0),
      }),
    )
    .max(300),
  /** Names of people the report mentions (tenants, occupants, owners, clients). Used only to strip them; never stored. */
  names_to_redact: z.array(z.string()).max(60).default([]),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

// ── People's names: never sent to trades ─────────────────────────────

const ROLE_WORDS = [
  "tenant", "tenants", "occupant", "occupants", "resident", "residents", "owner", "owners", "homeowner", "homeowners",
  "landlord", "client", "clients", "seller", "sellers", "buyer", "buyers", "purchaser", "purchasers", "vendor",
  "locataire", "locataires", "propriétaire", "propriétaires", "acheteur", "vendeur",
  "inquilino", "inquilinos", "ocupante", "ocupantes", "residente", "propietario", "propietaria", "comprador", "vendedor",
];
/** Role words in either case, without making the name part case-insensitive. */
const ROLE = ROLE_WORDS.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|");
const NAME_WORD = "(?:\\p{Lu}\\.|\\p{Lu}[\\p{Ll}'’-]+)";
const NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}`;
/** "tenant Jane Smith", "Occupant: J. Smith", "owner (Mark Lee)" → keeps the role word, drops the name. */
const ROLE_NAME = new RegExp(`\\b(${ROLE})\\b(\\s*[:(–-]?\\s*)(${NAME})\\)?`, "gu");
/** "Mrs. Lee", "Mr Smith", "Mme Tremblay", "Sra. García" → dropped. */
const HONORIFIC_NAME = new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Mx|Mme|Mlle|Sra|Srta)\\.?\\s+${NAME}`, "gu");
/** Capitalized words after a role word that are places, not people ("tenant Unit 4", "owner Kitchen"). */
const NOT_NAMES = new Set(["unit", "suite", "apt", "apartment", "bedroom", "bathroom", "kitchen", "basement", "garage", "attic", "hallway", "lobby", "floor", "level", "room", "side", "area", "space", "parking", "storage", "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "is", "has", "reports", "reported", "noted", "says", "unité", "logement", "chambre", "cuisine", "sous-sol", "unidad", "apartamento", "cocina", "sótano"]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tidy(s: string): string {
  return s.replace(/\(\s*\)/g, "").replace(/\s+([,.;:)])/g, "$1").replace(/([(])\s+/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s,;:–-]+/, "").trim();
}

/**
 * Remove people's names from text that goes to trades: names the model
 * listed, a name right after a role word (tenant, occupant, owner…), and a
 * name after an honorific (Mrs., Mme…). Data minimisation: a trade needs the
 * repair and the area, never who lives there.
 */
export function stripNames(text: string, names: readonly string[] = []): string {
  let out = text;
  const listed = [...new Set(names.map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of listed) {
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escapeRe(n)}(?![\\p{L}])`, "giu"), "$1");
  }
  out = out.replace(ROLE_NAME, (m, role: string, _sep: string, name: string) => (NOT_NAMES.has(name.split(/\s+/)[0].toLowerCase()) ? m : role));
  out = out.replace(HONORIFIC_NAME, "");
  return out === text ? text : tidy(out);
}

const URGENCY_WORDS: Record<string, Urgency> = {
  safety: "safety", "safety-hazard": "safety", hazard: "safety", urgent: "safety", immediate: "safety", high: "safety", critical: "safety", major: "safety",
  soon: "soon", repair: "soon", "repair-soon": "soon", medium: "soon", moderate: "soon", recommended: "soon", defect: "soon",
  monitor: "monitor", low: "monitor", minor: "monitor", maintenance: "monitor", "fyi": "monitor", observation: "monitor", "end-of-life": "monitor",
};

/** "High", "Safety hazard", "monitor" → an urgency; anything unknown is "soon" (the safe middle). */
export function normalizeUrgency(raw: string | null | undefined): Urgency {
  const key = kebab(raw ?? "");
  return URGENCY_WORDS[key] ?? URGENCY_WORDS[key.split("-")[0]] ?? "soon";
}

/**
 * Words an inspection report (or a model) uses for a trade, mapped to the
 * trade_categories slugs. Only used when the value isn't already a slug or
 * a category name; a target slug missing from the live taxonomy is ignored.
 */
const TRADE_ALIASES: Record<string, string> = {
  electrician: "electrical", electric: "electrical", wiring: "electrical", "electrical-contractor": "electrical",
  plumber: "plumbing", plumbing: "plumbing", drains: "plumbing", drain: "plumbing", sewer: "plumbing", "water-heater": "plumbing",
  heating: "hvac", furnace: "hvac", cooling: "hvac", "air-conditioning": "hvac", "hvac-contractor": "hvac", "heating-and-cooling": "hvac", "hvac-services": "hvac", boiler: "hvac", ventilation: "hvac",
  roofer: "roofing", roof: "roofing", gutters: "roofing", eavestroughs: "roofing", eavestrough: "roofing",
  "general-contractor": "general-contracting", contractor: "general-contracting", renovation: "general-contracting", renovations: "general-contracting",
  handyman: "handyman-maintenance", maintenance: "handyman-maintenance", "general-repairs": "handyman-maintenance",
  painter: "painting", paint: "painting",
  floors: "flooring", "flooring-contractor": "flooring",
  windows: "glass-and-windows", glazing: "glass-and-windows", "windows-and-doors": "glass-and-windows", glass: "glass-and-windows",
  mason: "masonry", brick: "masonry", chimney: "masonry", "chimney-masonry": "masonry",
  concrete: "concrete-and-asphalt", asphalt: "concrete-and-asphalt", paving: "concrete-and-asphalt", driveway: "concrete-and-asphalt",
  "foundation-waterproofing": "waterproofing", foundation: "waterproofing", basement: "waterproofing",
  pests: "pest-control", exterminator: "pest-control", "pest-management": "pest-control",
  mold: "mold-remediation", mould: "mold-remediation", "mould-remediation": "mold-remediation",
  asbestos: "environmental-hazardous-materials", "hazardous-materials": "environmental-hazardous-materials", vermiculite: "environmental-hazardous-materials", "lead-paint": "environmental-hazardous-materials",
  "fire-protection": "fire-safety", "fire-alarm": "fire-safety", "smoke-alarms": "fire-safety", sprinklers: "fire-safety",
  elevator: "elevator-services", elevators: "elevator-services",
  "garage-door": "garage-doors",
  carpenter: "carpentry", decks: "carpentry", deck: "carpentry", framing: "carpentry", stairs: "carpentry",
  fence: "fencing",
  landscaper: "landscaping", grading: "landscaping", "tree-service": "landscaping", trees: "landscaping",
  "drywall-and-plaster": "drywall", plaster: "drywall",
  appliances: "appliance-repair", appliance: "appliance-repair",
  insulation: "energy-efficiency",
  "security-system": "security-systems", alarm: "security-systems",
  locks: "locksmith",
  "parking-lot": "parking-lot-maintenance",
  "snow-plowing": "snow-removal",
};

function kebab(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Map what the model (or an old row) says to a live trade slug: the slug
 * itself, a category name ("HVAC", "Glass and Windows"), or a known alias
 * ("electrician"). Null when nothing matches: the item goes to the
 * "Other / unassigned" group for the user to reassign.
 */
export function mapTradeSlug(raw: string | null | undefined, trades: readonly TradeOption[]): string | null {
  const key = kebab(raw ?? "");
  if (!key) return null;
  const slugs = new Set(trades.map((t) => t.slug));
  if (slugs.has(key)) return key;
  const byName = trades.find((t) => kebab(t.name) === key);
  if (byName) return byName.slug;
  const alias = TRADE_ALIASES[key];
  return alias && slugs.has(alias) ? alias : null;
}

/**
 * Model output → clean items: trimmed, capped, urgencies normalized, trades
 * mapped (unmapped → null), people's names stripped, empty and duplicate
 * items dropped. The source page is kept whenever the model gave one.
 */
export function normalizeModelItems(out: ModelOutput, trades: readonly TradeOption[]): ReportItem[] {
  const seen = new Set<string>();
  const items: ReportItem[] = [];
  const names = out.names_to_redact ?? [];
  for (const raw of out.items) {
    const candidate = {
      trade_slug: mapTradeSlug(raw.trade_slug, trades),
      item: stripNames((raw.item ?? "").replace(/\s+/g, " ").trim(), names).slice(0, 500),
      location: stripNames((raw.location ?? "").replace(/\s+/g, " ").trim(), names).slice(0, 160),
      urgency: normalizeUrgency(raw.urgency),
      source_page: raw.source_page >= 1 && raw.source_page <= 2000 ? raw.source_page : null,
    };
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const dupe = `${parsed.data.trade_slug ?? ""}|${parsed.data.item.toLowerCase()}|${parsed.data.location.toLowerCase()}`;
    if (seen.has(dupe)) continue;
    seen.add(dupe);
    items.push(parsed.data);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/** Items saved from the editor: same checks, and a trade the taxonomy doesn't know becomes unassigned. */
export function cleanEditorItems(items: readonly ReportItem[], trades: readonly TradeOption[]): ReportItem[] {
  const slugs = new Set(trades.map((t) => t.slug));
  return items.slice(0, MAX_ITEMS).map((i) => ({ ...i, trade_slug: i.trade_slug && slugs.has(i.trade_slug) ? i.trade_slug : null }));
}

// ── Groups ───────────────────────────────────────────────────────────

const URGENCY_RANK: Record<Urgency, number> = { safety: 0, soon: 1, monitor: 2 };
const COMMON_RANK = new Map<string, number>(COMMON_TRADE_SLUGS.map((s, i) => [s, i]));

export interface TradeGroup<T extends Pick<ReportItem, "trade_slug" | "urgency"> = ReportItem> {
  /** Null = "Other / unassigned". */
  tradeSlug: string | null;
  items: T[];
  counts: Record<Urgency, number>;
}

/**
 * Items grouped by trade. Groups with safety items come first, then the
 * most "soon" items, then the trades PMs hire most; "Other / unassigned" is
 * always last. Inside a group: safety, soon, monitor, then original order.
 */
export function groupItems<T extends Pick<ReportItem, "trade_slug" | "urgency">>(items: readonly T[]): TradeGroup<T>[] {
  const bySlug = new Map<string | null, { item: T; i: number }[]>();
  items.forEach((item, i) => {
    const key = item.trade_slug ?? null;
    const list = bySlug.get(key) ?? [];
    list.push({ item, i });
    bySlug.set(key, list);
  });
  const groups: TradeGroup<T>[] = [...bySlug.entries()].map(([tradeSlug, list]) => {
    const sorted = [...list].sort((a, b) => URGENCY_RANK[a.item.urgency] - URGENCY_RANK[b.item.urgency] || a.i - b.i).map((x) => x.item);
    const counts: Record<Urgency, number> = { safety: 0, soon: 0, monitor: 0 };
    for (const it of sorted) counts[it.urgency]++;
    return { tradeSlug, items: sorted, counts };
  });
  return groups.sort((a, b) => {
    if (a.tradeSlug === null) return 1;
    if (b.tradeSlug === null) return -1;
    return (
      b.counts.safety - a.counts.safety ||
      b.counts.soon - a.counts.soon ||
      (COMMON_RANK.get(a.tradeSlug) ?? 99) - (COMMON_RANK.get(b.tradeSlug) ?? 99) ||
      a.tradeSlug.localeCompare(b.tradeSlug)
    );
  });
}

// ── Caps, files, retention ───────────────────────────────────────────

/** Uploads left for an organization that has made `usedInLast24h` already. */
export function uploadsLeft(usedInLast24h: number): number {
  return Math.max(0, DAILY_UPLOAD_LIMIT - Math.max(0, usedInLast24h));
}

export function canUpload(usedInLast24h: number): boolean {
  return uploadsLeft(usedInLast24h) > 0;
}

/** Start of the rolling 24-hour window the daily cap counts in. */
export function capWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

/** When an uploaded file must be gone (the table's default does the same). */
export function deleteAfter(uploadedAt: Date = new Date()): Date {
  return new Date(uploadedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function isPastRetention(reportDeletedAfter: string | Date, now: Date = new Date()): boolean {
  return new Date(reportDeletedAfter).getTime() <= now.getTime();
}

/** A read still "running" this long after it started has died (the request timed out). */
export const STALE_RUN_MS = 5 * 60 * 1000;

/** True when a read is stuck on "running": the review screen then offers manual entry and a retry. */
export function isStaleRun(status: string, since: string | Date, now: Date = new Date()): boolean {
  return status === "running" && now.getTime() - new Date(since).getTime() > STALE_RUN_MS;
}

/** A real PDF: "%PDF-" within the first 1024 bytes (the spec allows leading junk). Not the file name. */
export function isPdf(head: Uint8Array): boolean {
  let text = "";
  for (const byte of head.subarray(0, 1024)) text += String.fromCharCode(byte);
  return text.includes("%PDF-");
}

export type PdfCheck = { ok: true } | { ok: false; error: "empty" | "tooBig" | "type" };

export function checkPdf(size: number, head: Uint8Array): PdfCheck {
  if (!size) return { ok: false, error: "empty" };
  if (size > MAX_REPORT_BYTES) return { ok: false, error: "tooBig" };
  return isPdf(head) ? { ok: true } : { ok: false, error: "type" };
}

/** A display-safe file name (no path, no control characters), or null. */
export function cleanFileName(name: string | null | undefined): string | null {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return clean || null;
}

/** Report title from the file name: "2026-10 Inspection - 12 Elm.pdf" → "2026-10 Inspection - 12 Elm". */
export function titleFromFileName(name: string | null | undefined, fallback: string): string {
  const base = cleanFileName(name)?.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return (base || fallback).slice(0, 160);
}

/** Storage key: <organization>/<report>/<random>.pdf. */
export function reportPath(organizationId: string, reportId: string, nonce: string): string {
  return `${organizationId}/${reportId}/${nonce.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
}

// ── What trades see ──────────────────────────────────────────────────

export interface PlaceInput {
  buildingName?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
}

/** "Toronto, Ontario" — the city / area every trade sees. Never the street address. */
export function areaLine(p: PlaceInput): string {
  return [p.city, p.region].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
}

/** The address line, only when the user chose to include it. */
export function addressLine(p: PlaceInput, include: boolean): string {
  if (!include) return "";
  return [p.buildingName, p.streetAddress].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
}

export interface ItemLineStrings {
  urgency: Record<Urgency, string>;
  /** "p. {n}" */
  page: string;
}

/** "- [Safety] Double-tapped breaker in panel (Basement, p. 12)". People's names are stripped again here, whoever typed them. */
export function itemLine(i: Pick<ReportItem, "item" | "location" | "urgency" | "source_page">, s: ItemLineStrings): string {
  const where = [stripNames(i.location?.trim() ?? ""), i.source_page ? s.page.replace("{n}", String(i.source_page)) : ""].filter(Boolean).join(", ");
  return `- [${s.urgency[i.urgency]}] ${stripNames(i.item)}${where ? ` (${where})` : ""}`;
}

export interface RfpPrefillStrings extends ItemLineStrings {
  /** "{trade}: {n} items from an inspection report" (+ " — {city}") */
  title: string;
  titleCity: string;
  /** "{n} {trade} items flagged in a recent {report}: {safety} safety, {soon} soon, {monitor} to monitor. Please quote each item separately." */
  summary: string;
  aboutHeading: string;
  needHeading: string;
  need: string;
  itemsHeading: string;
  notesHeading: string;
  notes: string[];
  reportType: string;
}

export interface RfpPrefill {
  title: string;
  summary: string;
  scope: string;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * The draft RFP for one trade group: items as bullets, the city / area, and
 * the building and street only when the user ticked "include address".
 */
export function buildRfpPrefill(
  group: TradeGroup<Pick<ReportItem, "trade_slug" | "item" | "location" | "urgency" | "source_page">>,
  tradeName: string,
  place: PlaceInput,
  includeAddress: boolean,
  s: RfpPrefillStrings,
): RfpPrefill {
  const n = group.items.length;
  const area = areaLine(place);
  const vars = { trade: tradeName, n, report: s.reportType, safety: group.counts.safety, soon: group.counts.soon, monitor: group.counts.monitor, city: place.city?.trim() || area };
  const title = (fill(s.title, vars) + (vars.city ? fill(s.titleCity, vars) : "")).slice(0, 140);
  const about = [addressLine(place, includeAddress), area].filter(Boolean).map((l) => `- ${l}`);
  const scope = [
    ...(about.length ? [s.aboutHeading, ...about, ""] : []),
    s.needHeading,
    fill(s.need, vars),
    "",
    s.itemsHeading,
    ...group.items.map((i) => itemLine(i, s)),
    "",
    s.notesHeading,
    ...s.notes.map((x) => `- ${x}`),
  ].join("\n");
  return { title, summary: fill(s.summary, vars), scope };
}

export interface QuoteMessageStrings extends ItemLineStrings {
  /** "Hello, I'd like a quote for these {trade} items from a recent {report}:" */
  intro: string;
  /** "Property: {area}" */
  area: string;
  /** "Address: {address}" */
  address: string;
  /** "Please quote each item separately and confirm conditions on site." */
  ask: string;
}

/** The quote request body a realtor sends (and can edit before sending). Never the street address unless included. */
export function buildQuoteMessage(
  items: readonly Pick<ReportItem, "item" | "location" | "urgency" | "source_page">[],
  tradeName: string,
  place: PlaceInput,
  includeAddress: boolean,
  s: QuoteMessageStrings & { reportType: string },
  signature: string,
): string {
  const area = areaLine(place);
  const address = addressLine(place, includeAddress);
  return [
    fill(s.intro, { trade: tradeName, report: s.reportType }),
    "",
    ...items.map((i) => itemLine(i, s)),
    "",
    ...(area ? [fill(s.area, { area })] : []),
    ...(address ? [fill(s.address, { address })] : []),
    s.ask,
    ...(signature.trim() ? ["", signature.trim()] : []),
  ].join("\n");
}

/** A share-link line appended server-side when the report is attached. */
export function attachLine(template: string, url: string, until: string): string {
  return fill(template, { url, date: until });
}

/** Companies not already sent this trade group in the last RESEND_GUARD_DAYS. */
export function notRecentlySent(
  candidates: readonly string[],
  sends: readonly { trade_slug: string; recipient_organization_ids: string[]; initiated_at: string }[],
  tradeSlug: string,
  now: Date = new Date(),
): { send: string[]; skipped: string[] } {
  const since = now.getTime() - RESEND_GUARD_DAYS * 24 * 60 * 60 * 1000;
  const recent = new Set(
    sends.filter((s) => s.trade_slug === tradeSlug && new Date(s.initiated_at).getTime() >= since).flatMap((s) => s.recipient_organization_ids),
  );
  const unique = [...new Set(candidates)];
  return { send: unique.filter((id) => !recent.has(id)), skipped: unique.filter((id) => recent.has(id)) };
}
