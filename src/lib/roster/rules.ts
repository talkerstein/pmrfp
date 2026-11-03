/**
 * After-Hours Vendor Roster: the pure rules (no I/O).
 *
 * One roster per building: the emergency trades as rows (primary and backup
 * vendor, a 24/7 flag, notes), the on-call contact, the shut-offs and the
 * emergency numbers. Gap detection, field cleaning, share-link rules, the
 * vCard export, the on-call RFP draft and directory ranking live here so
 * they're tested without a database. Country-first: the building is in the
 * PM company's country, never mixed.
 */
import { CA_PROVINCES, US_STATES, US_STATE_NAMES } from "@/lib/geo";
import { cleanEmail, type CertStatus } from "@/lib/vendor-certs/rules";

export type RosterCountry = "CA" | "US";

// ── Categories ───────────────────────────────────────────────────────

/** The standard rows, in the order a PM scans them at 2am. */
export const STANDARD_CATEGORIES = [
  "plumbing",
  "electrical",
  "hvac",
  "locksmith",
  "restoration",
  "glass",
  "elevator",
  "fire_safety",
  "roofing",
  "snow",
  "pest",
  "towing",
] as const;
export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];
export type RosterCategory = StandardCategory | "custom";

export function isStandardCategory(v: unknown): v is StandardCategory {
  return typeof v === "string" && (STANDARD_CATEGORIES as readonly string[]).includes(v);
}

/**
 * The PMRFP directory trade (trade_categories.slug) behind each row, for
 * "Find a 24/7 ...". Towing isn't a PMRFP trade, so it has none: no search,
 * no RFP, only the invite.
 */
export const CATEGORY_TRADE: Record<StandardCategory, string | null> = {
  plumbing: "plumbing",
  electrical: "electrical",
  hvac: "hvac",
  locksmith: "locksmith",
  restoration: "restoration",
  glass: "glass-and-windows",
  elevator: "elevator-services",
  fire_safety: "fire-safety",
  roofing: "roofing",
  snow: "snow-removal",
  pest: "pest-control",
  towing: null,
};

/**
 * U.S. states where snow and ice starts as a needed row. Everywhere else in
 * the U.S. it starts as "not needed" (the PM can switch it on); in Canada
 * it's always needed.
 */
const SNOW_STATES = new Set(
  [
    "Alaska", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
    "Kentucky", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Missouri", "Montana", "Nebraska", "New Hampshire",
    "New Jersey", "New York", "North Dakota", "Ohio", "Pennsylvania", "Rhode Island", "South Dakota", "Utah", "Vermont", "Virginia",
    "West Virginia", "Wisconsin", "Wyoming",
  ].map((s) => s.toLowerCase()),
);

/** A standard row the building probably doesn't need until the PM says otherwise. */
export function defaultNotNeeded(category: RosterCategory, country: RosterCountry, province: string | null | undefined): boolean {
  if (category !== "snow" || country === "CA") return false;
  const p = (province ?? "").trim();
  if (!p) return false;
  const name = US_STATES[p.toUpperCase()] ?? p;
  return !SNOW_STATES.has(name.toLowerCase());
}

/** The provinces or states a building in this country can be in (the PM's own country only). */
export function provincesFor(country: RosterCountry): readonly string[] {
  return country === "US" ? US_STATE_NAMES : CA_PROVINCES;
}

// ── Rows and gaps ────────────────────────────────────────────────────

/** A stored row (emergency_roster_entries). */
export interface EntryRow {
  id: string;
  roster_id: string;
  category: RosterCategory;
  custom_label: string | null;
  trade_slug: string | null;
  not_needed: boolean;
  primary_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  primary_org_id: string | null;
  backup_name: string | null;
  backup_phone: string | null;
  backup_email: string | null;
  backup_org_id: string | null;
  available_24_7: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface VendorSlot {
  name: string | null;
  phone: string | null;
  email: string | null;
  orgId: string | null;
}

export type Slot = "primary" | "backup";
export type Gap = "no_vendor" | "no_phone" | "no_backup" | "not_24_7";
export const GAPS: readonly Gap[] = ["no_vendor", "no_phone", "no_backup", "not_24_7"];

/** What the dashboard, the card, the print view and the share page show for one row. */
export interface RosterRow {
  /** The category for a standard row, the entry id for a custom row. */
  key: string;
  entryId: string | null;
  category: RosterCategory;
  customLabel: string | null;
  /** The directory trade for "Find a 24/7 ..." (null: no search). */
  tradeSlug: string | null;
  notNeeded: boolean;
  primary: VendorSlot | null;
  backup: VendorSlot | null;
  available247: boolean;
  notes: string | null;
  gaps: Gap[];
}

function slot(name: string | null, phone: string | null, email: string | null, orgId: string | null): VendorSlot | null {
  return name?.trim() || phone?.trim() || email?.trim() || orgId ? { name: name?.trim() || null, phone: phone?.trim() || null, email: email?.trim() || null, orgId } : null;
}

/** Someone you could call: a name or a phone number. */
export function hasVendor(s: VendorSlot | null | undefined): boolean {
  return Boolean(s && (s.name || s.phone));
}

/**
 * The chips on a row. A building that doesn't need the trade has none.
 * No vendor at all is one chip (the others would only repeat it); with a
 * primary on file: no phone to call, no backup, not answering 24/7.
 */
export function entryGaps(r: { notNeeded: boolean; primary: VendorSlot | null; backup: VendorSlot | null; available247: boolean }): Gap[] {
  if (r.notNeeded) return [];
  if (!hasVendor(r.primary)) return ["no_vendor"];
  const gaps: Gap[] = [];
  if (!r.primary?.phone) gaps.push("no_phone");
  if (!hasVendor(r.backup)) gaps.push("no_backup");
  if (!r.available247) gaps.push("not_24_7");
  return gaps;
}

function rowFrom(e: EntryRow | null, category: RosterCategory, notNeededDefault: boolean): RosterRow {
  const primary = e ? slot(e.primary_name, e.primary_phone, e.primary_email, e.primary_org_id) : null;
  const backup = e ? slot(e.backup_name, e.backup_phone, e.backup_email, e.backup_org_id) : null;
  const notNeeded = e ? e.not_needed : notNeededDefault;
  const available247 = e?.available_24_7 ?? false;
  return {
    key: category === "custom" && e ? e.id : category,
    entryId: e?.id ?? null,
    category,
    customLabel: e?.custom_label ?? null,
    tradeSlug: category === "custom" ? (e?.trade_slug ?? null) : CATEGORY_TRADE[category],
    notNeeded,
    primary,
    backup,
    available247,
    notes: e?.notes ?? null,
    gaps: entryGaps({ notNeeded, primary, backup, available247 }),
  };
}

/**
 * Every standard category (stored or not, in the standard order), then the
 * PM's custom rows. A standard row nobody saved yet is virtual: empty, and
 * "not needed" only where defaultNotNeeded says so.
 */
export function rosterRows(entries: readonly EntryRow[], ctx: { country: RosterCountry; province: string | null }): RosterRow[] {
  const byCategory = new Map(entries.filter((e) => e.category !== "custom").map((e) => [e.category, e]));
  const standard = STANDARD_CATEGORIES.map((c) => rowFrom(byCategory.get(c) ?? null, c, defaultNotNeeded(c, ctx.country, ctx.province)));
  const custom = entries
    .filter((e) => e.category === "custom")
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((e) => rowFrom(e, "custom", false));
  return [...standard, ...custom];
}

export interface RosterSummary {
  /** Rows the building needs. */
  needed: number;
  /** Needed rows with no gap. */
  ready: number;
  gaps: Record<Gap, number>;
}

export function rosterSummary(rows: readonly RosterRow[]): RosterSummary {
  const gaps: Record<Gap, number> = { no_vendor: 0, no_phone: 0, no_backup: 0, not_24_7: 0 };
  let needed = 0;
  let ready = 0;
  for (const r of rows) {
    if (r.notNeeded) continue;
    needed++;
    if (!r.gaps.length) ready++;
    for (const g of r.gaps) gaps[g]++;
  }
  return { needed, ready, gaps };
}

export type BuildingGap = "no_on_call" | "no_water_shutoff";

/** The building-level holes: nobody on call, nobody knows where the water main is. */
export function buildingGaps(r: { on_call_name: string | null; on_call_phone: string | null; shutoff_water: string | null }): BuildingGap[] {
  const out: BuildingGap[] = [];
  if (!r.on_call_phone?.trim()) out.push("no_on_call");
  if (!r.shutoff_water?.trim()) out.push("no_water_shutoff");
  return out;
}

// ── Fields ───────────────────────────────────────────────────────────

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** Multi-line notes: keep the line breaks, trim the rest. */
function lines(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s ? s.slice(0, max) : null;
}

/**
 * A typed phone number, or null when blank. Anything with at least three
 * digits (911 counts) made of digits, letters (ext., vanity numbers) and the
 * usual punctuation; `false` when it can't be a number.
 */
export function cleanPhone(v: unknown): string | null | false {
  if (v == null) return null;
  if (typeof v !== "string") return false;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 40) return false;
  if (!/^[\p{L}\d+()\-.\s#*,/]+$/u.test(s)) return false;
  return (s.match(/\d/g)?.length ?? 0) >= 3 ? s : false;
}

const KEYPAD: Record<string, string> = { a: "2", b: "2", c: "2", d: "3", e: "3", f: "3", g: "4", h: "4", i: "4", j: "5", k: "5", l: "5", m: "6", n: "6", o: "6", p: "7", q: "7", r: "7", s: "7", t: "8", u: "8", v: "8", w: "9", x: "9", y: "9", z: "9" };

/**
 * The tap-to-call link: "416-555-0100 ext. 22" → "tel:4165550100,22" (the
 * comma pauses, then dials the extension), "1-800-FLOWERS" → its digits,
 * "911" → "tel:911". Null when there's nothing to dial.
 */
export function telHref(phone: string | null | undefined): string | null {
  const s = (phone ?? "").trim();
  if (!s) return null;
  const ext = s.match(/(?:\bext\.?|\bx|\bposte|#)\s*(\d{1,6})\s*$/i);
  const main = ext ? s.slice(0, ext.index) : s;
  const plus = main.trim().startsWith("+") ? "+" : "";
  const digits = main
    .toLowerCase()
    .replace(/[a-z]/g, (c) => KEYPAD[c] ?? "")
    .replace(/\D/g, "");
  if (digits.length < 3) return null;
  return `tel:${plus}${digits}${ext ? `,${ext[1]}` : ""}`;
}

export interface RosterInput {
  building_name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  on_call_name: string | null;
  on_call_phone: string | null;
  on_call_notes: string | null;
  shutoff_water: string | null;
  shutoff_gas: string | null;
  shutoff_electric: string | null;
  shutoff_notes: string | null;
  emergency_line: string;
  non_emergency_line: string | null;
  other_numbers: string | null;
}

export type RosterFieldError = "building" | "province" | "phone";

/**
 * The building form → clean columns. `partial` (the add-building form) only
 * carries name and address; the rest keeps its defaults. The province must
 * be one of the PM company's own country.
 */
export function cleanRosterInput(raw: Record<string, unknown>, country: RosterCountry): { ok: true; value: RosterInput } | { ok: false; field: RosterFieldError } {
  const building = text(raw.building_name, 160);
  if (!building) return { ok: false, field: "building" };
  const provRaw = text(raw.province, 60);
  const province = provRaw ? (provincesFor(country).find((p) => p.toLowerCase() === provRaw.toLowerCase()) ?? null) : null;
  if (provRaw && !province) return { ok: false, field: "province" };
  const phones: Record<"on_call_phone" | "emergency_line" | "non_emergency_line", string | null> = { on_call_phone: null, emergency_line: null, non_emergency_line: null };
  for (const k of Object.keys(phones) as (keyof typeof phones)[]) {
    const p = cleanPhone(raw[k]);
    if (p === false) return { ok: false, field: "phone" };
    phones[k] = p;
  }
  return {
    ok: true,
    value: {
      building_name: building,
      address: text(raw.address, 240),
      city: text(raw.city, 80),
      province,
      on_call_name: text(raw.on_call_name, 120),
      on_call_phone: phones.on_call_phone,
      on_call_notes: lines(raw.on_call_notes, 300),
      shutoff_water: lines(raw.shutoff_water, 300),
      shutoff_gas: lines(raw.shutoff_gas, 300),
      shutoff_electric: lines(raw.shutoff_electric, 300),
      shutoff_notes: lines(raw.shutoff_notes, 600),
      emergency_line: phones.emergency_line ?? "911",
      non_emergency_line: phones.non_emergency_line,
      other_numbers: lines(raw.other_numbers, 600),
    },
  };
}

export interface EntryInput {
  custom_label: string | null;
  trade_slug: string | null;
  primary_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  backup_name: string | null;
  backup_phone: string | null;
  backup_email: string | null;
  available_24_7: boolean;
  notes: string | null;
}

export type EntryFieldError = "label" | "phone" | "email" | "trade";

const on = (v: unknown) => v === true || v === "on" || v === "true";

/** A row's form → clean columns (the PMRFP company links are set by the server, never from the form). */
export function cleanEntryInput(raw: Record<string, unknown>, opts: { custom: boolean }): { ok: true; value: EntryInput } | { ok: false; field: EntryFieldError } {
  const label = text(raw.custom_label, 80);
  if (opts.custom && !label) return { ok: false, field: "label" };
  const tradeRaw = text(raw.trade_slug, 60);
  if (tradeRaw && !/^[a-z0-9-]{1,60}$/.test(tradeRaw)) return { ok: false, field: "trade" };
  const value: EntryInput = {
    custom_label: opts.custom ? label : null,
    trade_slug: opts.custom ? tradeRaw : null,
    primary_name: text(raw.primary_name, 160),
    primary_phone: null,
    primary_email: null,
    backup_name: text(raw.backup_name, 160),
    backup_phone: null,
    backup_email: null,
    available_24_7: on(raw.available_24_7),
    notes: lines(raw.notes, 500),
  };
  for (const s of ["primary", "backup"] as const) {
    const phone = cleanPhone(raw[`${s}_phone`]);
    if (phone === false) return { ok: false, field: "phone" };
    value[`${s}_phone`] = phone;
    const emailRaw = typeof raw[`${s}_email`] === "string" ? (raw[`${s}_email`] as string).trim() : "";
    const email = emailRaw ? cleanEmail(emailRaw) : null;
    if (emailRaw && !email) return { ok: false, field: "email" };
    value[`${s}_email`] = email;
  }
  return { ok: true, value };
}

/** Same company? Case, punctuation and "Inc."/"Ltd."/"LLC" don't count. */
export function sameCompanyName(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company|ltee|lp)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

// ── Share links ──────────────────────────────────────────────────────

/** Same shape as every other PMRFP link token (lib/projects/tokens): 32 URL-safe characters, 192 random bits. */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
/** Open links per building (one per superintendent is plenty). */
export const MAX_ACTIVE_LINKS = 10;

export function isShareToken(v: unknown): v is string {
  return typeof v === "string" && SHARE_TOKEN_RE.test(v);
}

/** A link opens the card until it's revoked. */
export function linkIsLive(link: { revoked_at: string | null } | null | undefined): boolean {
  return Boolean(link && !link.revoked_at);
}

export function canAddLink(liveLinks: number): boolean {
  return liveLinks < MAX_ACTIVE_LINKS;
}

/** The public, read-only card. */
export function sharePath(token: string): string {
  return `/on-call/${token}`;
}

// ── Contacts export (vCard 3.0) ──────────────────────────────────────

export interface VcardContact {
  fn: string;
  org?: string | null;
  tel?: string | null;
  email?: string | null;
  note?: string | null;
}

/** RFC 6350 text escaping: backslash, comma, semicolon, newline. */
export function vcardEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** One .vcf holding every contact (phones import them all at once). */
export function buildVcards(contacts: readonly VcardContact[]): string {
  return contacts
    .filter((c) => c.tel || c.email)
    .map((c) =>
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${vcardEscape(c.fn)}`,
        `N:${vcardEscape(c.fn)};;;;`,
        c.org ? `ORG:${vcardEscape(c.org)}` : null,
        c.tel ? `TEL;TYPE=WORK,VOICE:${vcardEscape(c.tel)}` : null,
        c.email ? `EMAIL;TYPE=INTERNET:${vcardEscape(c.email)}` : null,
        c.note ? `NOTE:${vcardEscape(c.note)}` : null,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n"),
    )
    .join("\r\n")
    .concat("\r\n");
}

/**
 * The building's contacts for the phone: the on-call person, then each
 * needed row's primary and backup. Names lead with the building and the
 * trade, so they sort together in the address book.
 */
export function rosterContacts(
  roster: { building_name: string; on_call_name: string | null; on_call_phone: string | null },
  rows: readonly RosterRow[],
  labels: { category: (r: RosterRow) => string; primary: string; backup: string; onCall: string; available247: string },
): VcardContact[] {
  const out: VcardContact[] = [];
  if (roster.on_call_phone) out.push({ fn: `${roster.building_name} · ${labels.onCall}`, org: roster.on_call_name, tel: roster.on_call_phone });
  for (const r of rows) {
    if (r.notNeeded) continue;
    for (const [s, label] of [
      [r.primary, labels.primary],
      [r.backup, labels.backup],
    ] as const) {
      if (!s || !hasVendor(s)) continue;
      const note = [label, r.available247 ? labels.available247 : null, r.notes].filter(Boolean).join(" · ");
      out.push({ fn: `${roster.building_name} · ${labels.category(r)}${s.name ? ` · ${s.name}` : ""}`, org: s.name, tel: s.phone, email: s.email, note });
    }
  }
  return out;
}

/** When the roster last changed: the building or any of its rows. */
export function lastUpdated(roster: { updated_at: string }, entries: readonly { updated_at?: string; created_at: string }[]): string {
  return entries.reduce((max, e) => {
    const t = e.updated_at ?? e.created_at;
    return t > max ? t : max;
  }, roster.updated_at);
}

/** A file name for the download: "maple-court-emergency-contacts.vcf". */
export function vcardFileName(building: string): string {
  const slug = building
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "building"}-emergency-contacts.vcf`;
}

// ── "Post an RFP for an on-call contract" ────────────────────────────

export interface OnCallDraftCopy {
  title: string;
  summary: string;
  scope: string;
  requirements: string;
  submission: string;
}

/** What the RFP post form reads back with ?draft=1 (components/rfp-writer/wizard StoredDraft). */
export interface OnCallDraft {
  rfp: { title: string; summary: string; scope: string; requirements: string; submissionInstructions: string; evaluationCriteria: string[]; questionsForBidders: string[] };
  tradeSlug: string;
  city?: string;
  province?: string;
  deadline: string;
  savedAt: string;
}

/** Bids close three weeks out by default (the PM can change it on the form). */
export const ONCALL_RFP_DAYS = 21;

/** The on-call contract RFP, pre-filled for this trade and building ({trade}, {building}, {place}). */
export function onCallRfpDraft(copy: OnCallDraftCopy, x: { trade: string; tradeSlug: string; building: string; city: string | null; province: string | null; now: Date }): OnCallDraft {
  const place = [x.city, x.province].filter(Boolean).join(", ") || x.building;
  const fill = (s: string) => s.replace(/\{trade\}/g, x.trade).replace(/\{building\}/g, x.building).replace(/\{place\}/g, place);
  return {
    rfp: {
      title: fill(copy.title).slice(0, 200),
      summary: fill(copy.summary),
      scope: fill(copy.scope),
      requirements: fill(copy.requirements),
      submissionInstructions: fill(copy.submission),
      evaluationCriteria: [],
      questionsForBidders: [],
    },
    tradeSlug: x.tradeSlug,
    ...(x.city ? { city: x.city } : {}),
    ...(x.province ? { province: x.province } : {}),
    deadline: new Date(x.now.getTime() + ONCALL_RFP_DAYS * 86_400_000).toISOString().slice(0, 10),
    savedAt: x.now.toISOString(),
  };
}

// ── Insurance (the PM's own Vendor Insurance Tracker) ────────────────

const SEVERITY: Record<CertStatus, number> = { valid: 0, expiring: 1, missing: 2, expired: 3 };

export interface CertLite {
  vendor_name: string;
  contact_email: string | null;
  vendor_organization_id: string | null;
  status: CertStatus;
}

/**
 * The tracker's chip for a roster vendor: its certificates matched by the
 * linked PMRFP company, then the email, then the company name; the worst
 * status wins (one lapsed certificate is a problem). Null: not tracked.
 */
export function insuranceFor(s: VendorSlot | null | undefined, certs: readonly CertLite[]): CertStatus | null {
  if (!s || !hasVendor(s)) return null;
  const email = cleanEmail(s.email);
  const mine = certs.filter(
    (c) => (s.orgId && c.vendor_organization_id === s.orgId) || (email && cleanEmail(c.contact_email) === email) || sameCompanyName(c.vendor_name, s.name),
  );
  if (!mine.length) return null;
  return mine.reduce<CertStatus>((worst, c) => (SEVERITY[c.status] > SEVERITY[worst] ? c.status : worst), "valid");
}

// ── Invites ("Invite your current vendor to PMRFP") ──────────────────

/** A PM company sends at most this many invites a day. */
export const INVITE_DAILY_LIMIT = 25;
/** An address invited by any PM company isn't invited again for this long. */
export const INVITE_RECENT_DAYS = 30;

export type InviteRefusal = "no_email" | "on_pmrfp" | "unsubscribed" | "already" | "recent" | "limit";

/**
 * Who may get the one referral email. Never an address without a PMRFP
 * company check, on the do-not-contact list, already invited by this PM
 * company (ever: CASL's referral exemption covers one message), invited by
 * anyone in the last 30 days, or past today's limit.
 */
export function inviteRefusal(x: {
  email: string | null;
  onPmrfp: boolean;
  suppressed: boolean;
  alreadyByOrg: boolean;
  lastInvitedAt: string | null;
  sentToday: number;
  now: Date;
}): InviteRefusal | null {
  if (!cleanEmail(x.email)) return "no_email";
  if (x.onPmrfp) return "on_pmrfp";
  if (x.suppressed) return "unsubscribed";
  if (x.alreadyByOrg) return "already";
  if (x.lastInvitedAt && x.now.getTime() - new Date(x.lastInvitedAt).getTime() < INVITE_RECENT_DAYS * 86_400_000) return "recent";
  if (x.sentToday >= INVITE_DAILY_LIMIT) return "limit";
  return null;
}

// ── Directory matches ("Find a 24/7 plumber near ...") ───────────────

export interface DirectoryCandidate {
  orgId: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  /** Service-region names ("Ontario", "Greater Toronto Area", "Texas"). */
  regions: readonly string[];
  /** The company's profile says it takes emergency calls (organizations.emergency_service). */
  emergency: boolean;
  verified: boolean;
}

export const MAX_MATCHES = 8;

/**
 * Directory companies that serve the building's province or state (their
 * own, or one of their service regions; the city counts too), emergency
 * service first, then the same city, then the directory's own order. The
 * caller already kept to the building's country.
 */
export function rankMatches<T extends DirectoryCandidate>(cands: readonly T[], where: { province: string | null; city: string | null }, limit = MAX_MATCHES): T[] {
  const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const prov = low(where.province);
  const city = low(where.city);
  const inArea = (c: T) => !prov || low(c.province) === prov || c.regions.some((r) => low(r) === prov || (city && low(r) === city));
  return cands
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => inArea(c))
    .sort((a, b) => Number(b.c.emergency) - Number(a.c.emergency) || Number(Boolean(city) && low(b.c.city) === city) - Number(Boolean(city) && low(a.c.city) === city) || a.i - b.i)
    .slice(0, limit)
    .map(({ c }) => c);
}
