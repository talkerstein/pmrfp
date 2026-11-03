/**
 * Contract Renewal Calendar: the pure rules (no I/O).
 *
 * A PM's service contracts (snow removal, landscaping, HVAC maintenance,
 * janitorial, elevator, fire/life safety, pest control, waste) with their
 * term, renewal window and status; the reminder stages the daily cron
 * sends; the seasonal starter rows; the CSV import; and the mapping from a
 * contract (and the RFP it came from) to a pre-filled re-tender RFP. Dates
 * are "YYYY-MM-DD" in UTC, like the vendor insurance tracker, whose date,
 * amount, email and CSV readers this reuses.
 */
import { cleanEmail, daysUntil, isoDay, parseAmount, parseCsv, parseDate } from "@/lib/vendor-certs/rules";

export { daysUntil, isoDay };

export type ContractCountry = "CA" | "US";
export type ContractCurrency = "CAD" | "USD";

/** Canada is CAD, the U.S. is USD: never mixed. */
export function currencyFor(country: ContractCountry): ContractCurrency {
  return country === "US" ? "USD" : "CAD";
}

export type ContractStatus = "active" | "window" | "ending" | "expired" | "no_dates";

/** Ending soon = within this many days of the end date (inclusive). */
export const ENDING_SOON_DAYS = 14;
export const DEFAULT_NOTICE_DAYS = 60;
export const MAX_NOTICE_DAYS = 365;
/** A contract that ended longer ago than this gets no "ended" email (old news, or just imported). */
export const LATE_REMINDER_DAYS = 7;

// ── Dates ────────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parts(day: string): [number, number, number] {
  return [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)];
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return isoDay(new Date(Date.UTC(y, m - 1, d + n)));
}

/**
 * `n` months later. A month-end date stays a month-end (Apr 30 → May 31,
 * Feb 29 → Feb 28); any other day is clamped to the target month's length.
 */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = lastDayOfMonth(ty, tm);
  const td = d === lastDayOfMonth(y, m) ? last : Math.min(d, last);
  return `${ty}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/** The term's length in whole months (start to end, inclusive). 12 when a date is missing. */
export function termMonths(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end || !DAY.test(start) || !DAY.test(end)) return 12;
  const days = daysUntil(end, start) + 1;
  return Math.min(60, Math.max(1, Math.round(days / 30.4375)));
}

/**
 * How far apart two terms start. A monthly contract repeats monthly; a
 * seasonal one (2 to 11 months: snow from Nov to Apr, landscaping from Apr
 * to Nov) comes back the same season next year; a year or longer repeats
 * by its own length.
 */
export function termCycleMonths(start: string | null | undefined, end: string | null | undefined): number {
  const months = termMonths(start, end);
  if (months <= 1) return 1;
  return months < 12 ? 12 : months;
}

/** The next term, same length, same season. No end date, no next term. */
export function nextTerm(c: { start_date: string | null; end_date: string | null }): { start: string; end: string } | null {
  if (!c.end_date || !DAY.test(c.end_date)) return null;
  const cycle = termCycleMonths(c.start_date, c.end_date);
  const start = c.start_date && DAY.test(c.start_date) ? addMonths(c.start_date, cycle) : addDays(c.end_date, 1);
  return { start, end: addMonths(c.end_date, cycle) };
}

/**
 * The term running today. An auto-renewing contract whose end date has
 * passed rolled over, so its term moves forward a cycle at a time; any
 * other contract keeps the dates the PM typed.
 */
export function currentTerm(c: { start_date: string | null; end_date: string | null; auto_renews: boolean }, today: string): { start: string | null; end: string | null } {
  const start = c.start_date && DAY.test(c.start_date) ? c.start_date : null;
  if (!c.end_date || !DAY.test(c.end_date)) return { start, end: null };
  if (!c.auto_renews || c.end_date >= today) return { start, end: c.end_date };
  const cycle = termCycleMonths(start, c.end_date);
  let s = start;
  let end = c.end_date;
  for (let i = 0; i < 600 && end < today; i++) {
    end = addMonths(end, cycle);
    if (s) s = addMonths(s, cycle);
  }
  return { start: s, end };
}

/** The end of the term running today (see currentTerm). */
export function currentTermEnd(c: { start_date: string | null; end_date: string | null; auto_renews: boolean }, today: string): string | null {
  return currentTerm(c, today).end;
}

// ── Status ───────────────────────────────────────────────────────────

export interface StatusInput {
  start_date: string | null;
  end_date: string | null;
  auto_renews: boolean;
  notice_days: number;
}

/**
 * The chip: no end date = dates needed; past the end = expired (an
 * auto-renewing contract never is, it rolled over); within 14 days =
 * ending soon; within the PM's notice days = renewal window; else active.
 * The end date itself still counts as covered (expired starts the day after).
 */
export function contractStatus(c: StatusInput, today: string): { status: ContractStatus; end: string | null; days: number | null } {
  const end = currentTermEnd(c, today);
  if (!end) return { status: "no_dates", end: null, days: null };
  const days = daysUntil(end, today);
  if (days < 0) return { status: "expired", end, days };
  if (days <= ENDING_SOON_DAYS) return { status: "ending", end, days };
  if (days <= c.notice_days) return { status: "window", end, days };
  return { status: "active", end, days };
}

/** The day the renewal window opens (end date minus notice days). */
export function windowOpens(end: string, noticeDays: number): string {
  return addDays(end, -noticeDays);
}

// ── Reminders ────────────────────────────────────────────────────────

export type RenewalStage = "window" | "14" | "0";
const STAGE_ORDER: RenewalStage[] = ["window", "14", "0"];

/** Which digest stage a contract is at, `days` before its end, or null (not in its window yet). */
export function renewalStage(days: number, noticeDays: number): RenewalStage | null {
  if (days <= 0) return "0";
  if (days <= ENDING_SOON_DAYS) return "14";
  if (days <= noticeDays) return "window";
  return null;
}

export interface ReminderInput extends StatusInput {
  retender_rfp_id: string | null;
  reminder_stage: string | null;
  reminder_for: string | null;
}

/**
 * Should today's digest include this contract? Once per stage per end
 * date: a renewed contract (a new end date, or an auto-renewal rolling it
 * forward) starts over. A contract first seen at 14 days only gets "14",
 * never a late "window". Already re-tendered on PMRFP: the PM acted, no
 * email. Ended more than a week ago: no email.
 */
export function needsRenewalReminder(row: ReminderInput, today: string): { stage: RenewalStage; end: string; days: number } | null {
  if (row.retender_rfp_id) return null;
  const end = currentTermEnd(row, today);
  if (!end) return null;
  const days = daysUntil(end, today);
  if (days < -LATE_REMINDER_DAYS) return null;
  const stage = renewalStage(days, row.notice_days);
  if (!stage) return null;
  if (row.reminder_for !== end) return { stage, end, days };
  return STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(row.reminder_stage as RenewalStage) ? { stage, end, days } : null;
}

// ── Fields ───────────────────────────────────────────────────────────

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function longText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s ? s.slice(0, max) : null;
}

const TRUE = /^(true|on|yes|y|1|oui|o|s[ií]|x)$/i;

function bool(v: unknown): boolean {
  return v === true || (typeof v === "string" && TRUE.test(v.trim()));
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export interface ContractInput {
  building_name: string | null;
  building_address: string | null;
  trade_slug: string | null;
  service_detail: string | null;
  vendor_name: string | null;
  vendor_email: string | null;
  start_date: string | null;
  end_date: string | null;
  annual_value: number | null;
  notice_days: number;
  auto_renews: boolean;
  notes: string | null;
}

export type ContractFieldError = "service" | "email" | "date" | "order" | "amount" | "notice";

/**
 * A PM's typed row → clean columns, or which field is wrong. `trades` is
 * the set of known trade slugs (an unknown one is dropped); a contract
 * needs a trade or the PM's own description of the service.
 */
export function cleanContractInput(
  raw: Record<string, unknown>,
  trades: ReadonlySet<string> | null,
): { ok: true; value: ContractInput } | { ok: false; field: ContractFieldError } {
  const slugRaw = typeof raw.trade_slug === "string" ? raw.trade_slug.trim().toLowerCase() : "";
  const trade = slugRaw && SLUG.test(slugRaw) && (!trades || trades.has(slugRaw)) ? slugRaw : null;
  const detail = text(raw.service_detail, 160);
  if (!trade && !detail) return { ok: false, field: "service" };

  const emailRaw = typeof raw.vendor_email === "string" ? raw.vendor_email.trim() : "";
  const email = emailRaw ? cleanEmail(emailRaw) : null;
  if (emailRaw && !email) return { ok: false, field: "email" };

  const day = (v: unknown): string | null | false => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    return parseDate(s) ?? false;
  };
  const start = day(raw.start_date);
  const end = day(raw.end_date);
  if (start === false || end === false) return { ok: false, field: "date" };
  if (start && end && end < start) return { ok: false, field: "order" };

  const amountRaw = typeof raw.annual_value === "string" ? raw.annual_value.trim() : raw.annual_value;
  const amount = amountRaw === "" || amountRaw == null ? null : parseAmount(amountRaw);
  if (amountRaw !== "" && amountRaw != null && amount === null) return { ok: false, field: "amount" };

  const noticeRaw = typeof raw.notice_days === "string" ? raw.notice_days.trim() : raw.notice_days;
  let notice = DEFAULT_NOTICE_DAYS;
  if (noticeRaw !== "" && noticeRaw != null) {
    const n = typeof noticeRaw === "number" ? noticeRaw : /^\d{1,3}$/.test(String(noticeRaw)) ? Number(noticeRaw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > MAX_NOTICE_DAYS) return { ok: false, field: "notice" };
    notice = n;
  }

  return {
    ok: true,
    value: {
      building_name: text(raw.building_name, 160),
      building_address: text(raw.building_address, 240),
      trade_slug: trade,
      service_detail: detail,
      vendor_name: text(raw.vendor_name, 160),
      vendor_email: email,
      start_date: start,
      end_date: end,
      annual_value: amount,
      notice_days: notice,
      auto_renews: bool(raw.auto_renews),
      notes: longText(raw.notes, 2000),
    },
  };
}

// ── Trades ───────────────────────────────────────────────────────────

export interface TradeOption {
  slug: string;
  name: string;
}

/** Words in a spreadsheet's service column → the PMRFP trade category (en/fr/es). Order matters. */
const TRADE_HINTS: [string, RegExp][] = [
  ["snow-removal", /snow|d[ée]neig|nieve|plow|plough|\bsalt/],
  ["landscaping", /landscap|lawn|grounds|garden|paysag|pelouse|jardin|c[ée]sped/],
  ["elevator-services", /elevator|\blifts?\b|escalator|ascenseur|ascensor/],
  ["fire-safety", /fire|sprinkler|life safety|extinguish|incendie|gicleur|incendio/],
  ["hvac", /hvac|heating|cooling|boiler|chiller|furnace|mechanical|cvac|chauffage|climatisation|calefacci|aire acondicionado/],
  ["pest-control", /pest|extermin|rodent|parasit|plaga|fumig/],
  ["waste-removal", /waste|garbage|recycl|trash|refuse|d[ée]chet|ordures|basura|residuo/],
  ["glass-and-windows", /window (clean|wash)|lavage de vitres|vitres|limpieza de ventanas/],
  ["security-personnel", /security guard|\bguards?\b|gardiennage|vigilan/],
  ["parking-lot-maintenance", /parking lot|sweep|line paint|stationnement|estacionamiento/],
  ["cleaning-janitorial", /janitor|clean|custodial|entretien m[ée]nager|nettoyage|limpieza|conserjer/],
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Free text in a service column → a trade slug from `trades`, and whether
 * the text said more than the trade's name (then it's kept as the detail).
 */
export function guessTrade(v: unknown, trades: readonly TradeOption[]): { slug: string | null; detail: string | null } {
  const raw = text(v, 160);
  if (!raw) return { slug: null, detail: null };
  const s = norm(raw);
  const exact = trades.find((t) => norm(t.name) === s || t.slug === s);
  if (exact) return { slug: exact.slug, detail: null };
  const known = new Set(trades.map((t) => t.slug));
  const hint = TRADE_HINTS.find(([slug, re]) => known.has(slug) && re.test(s));
  return { slug: hint?.[0] ?? null, detail: raw };
}

// ── Seasonal starters ────────────────────────────────────────────────

/**
 * One-click starter rows for a PM with no contracts yet: the service
 * contracts most buildings re-tender every year. Trade and notice days
 * only; the PM sets the building, vendor, dates and value. No prices.
 */
export const STARTERS = [
  { key: "snow_removal", trade: "snow-removal", noticeDays: 90 },
  { key: "landscaping", trade: "landscaping", noticeDays: 90 },
  { key: "hvac_maintenance", trade: "hvac", noticeDays: 60 },
  { key: "janitorial", trade: "cleaning-janitorial", noticeDays: 60 },
  { key: "elevator", trade: "elevator-services", noticeDays: 90 },
  { key: "fire_safety", trade: "fire-safety", noticeDays: 60 },
  { key: "pest_control", trade: "pest-control", noticeDays: 60 },
  { key: "waste", trade: "waste-removal", noticeDays: 60 },
] as const;

export type StarterKey = (typeof STARTERS)[number]["key"];

export function isStarterKey(v: unknown): v is StarterKey {
  return STARTERS.some((s) => s.key === v);
}

/** The starters a company can still add: trade exists here, not added yet. */
export function availableStarters(trades: readonly TradeOption[], used: Iterable<string | null>): (typeof STARTERS)[number][] {
  const known = new Set(trades.map((t) => t.slug));
  const taken = new Set(used);
  return STARTERS.filter((s) => known.has(s.trade) && !taken.has(s.key));
}

// ── Files ────────────────────────────────────────────────────────────

export const CONTRACT_BUCKET = "service-contracts";

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Storage path: <pm org>/<contract>/<random>.<ext> (never the PM's file name). */
export function contractPath(orgId: string, contractId: string, nonce: string, mime: string): string {
  return `${orgId}/${contractId}/${nonce}.${EXT[mime] ?? "bin"}`;
}

// ── CSV import ───────────────────────────────────────────────────────

/** CSV import cap per run. */
export const MAX_IMPORT_ROWS = 200;

type ImportKey = keyof ContractInput | "service";

const HEADER_KEYS: [ImportKey, RegExp][] = [
  ["vendor_email", /e-?mail|courriel|correo/],
  ["building_address", /address|adresse|direcci[oó]n/],
  ["notice_days", /notice|pr[ée]avis|aviso/],
  ["auto_renews", /auto|tacit|reconduc/],
  ["start_date", /start|begin|commence|d[ée]but|inicio/],
  ["end_date", /\bends?\b|expir|renewal|\bfin\b|[ée]ch[ée]ance|vencim|t[ée]rmino|finaliza/],
  ["annual_value", /value|amount|price|cost|annual|valeur|montant|prix|co[uû]t|valor|monto|precio/],
  ["building_name", /building|property|site|immeuble|propri[ée]t[ée]|b[aâ]timent|edificio|inmueble|propiedad/],
  ["vendor_name", /vendor|contractor|supplier|company|fournisseur|entrepreneur|prestataire|proveedor|contratista|empresa/],
  ["service", /service|trade|m[ée]tier|oficio|servicio|categor|contract|contrat|contrato|type|tipo/],
  ["notes", /note|scope|comment|port[ée]e|remarque|alcance|nota/],
];

/** Header row → which column holds which field (or null when the first row isn't a header). */
export function mapContractHeader(row: string[]): (ImportKey | null)[] | null {
  const mapped = row.map((h) => {
    const s = h.trim().toLowerCase();
    if (!s) return null;
    return HEADER_KEYS.find(([, re]) => re.test(s))?.[0] ?? null;
  });
  return mapped.includes("service") ? mapped : null;
}

/** Default column order when there's no header row. */
const DEFAULT_ORDER: ImportKey[] = ["building_name", "service", "vendor_name", "vendor_email", "start_date", "end_date", "annual_value", "notice_days", "auto_renews", "notes"];

export interface ContractImport {
  rows: ContractInput[];
  /** 1-based line numbers that couldn't be read (no service, or a bad email, date or amount). */
  skipped: number[];
  /** More than MAX_IMPORT_ROWS: the rest were left out. */
  truncated: boolean;
}

/** A pasted or uploaded contract list → clean rows. The service column is matched to a PMRFP trade. */
export function importContracts(csv: string, trades: readonly TradeOption[]): ContractImport {
  const all = parseCsv(csv);
  if (all.length === 0) return { rows: [], skipped: [], truncated: false };
  const header = mapContractHeader(all[0]);
  const body = header ? all.slice(1) : all;
  const cols = header ?? DEFAULT_ORDER;
  const known = new Set(trades.map((t) => t.slug));
  const rows: ContractInput[] = [];
  const skipped: number[] = [];
  const offset = header ? 2 : 1;
  for (let i = 0; i < body.length; i++) {
    if (rows.length >= MAX_IMPORT_ROWS) return { rows, skipped, truncated: true };
    const raw: Record<string, unknown> = {};
    cols.forEach((key, j) => {
      if (key && body[i][j] !== undefined && raw[key] === undefined) raw[key] = body[i][j];
    });
    const guess = guessTrade(raw.service, trades);
    const res = cleanContractInput({ ...raw, trade_slug: guess.slug ?? "", service_detail: guess.detail ?? "" }, known);
    if (res.ok) rows.push(res.value);
    else skipped.push(i + offset);
  }
  return { rows, skipped, truncated: false };
}

// ── Re-tender on PMRFP ───────────────────────────────────────────────

/** Days between the bid deadline and the new term's start (evaluate, award, onboard). */
export const AWARD_BUFFER_DAYS = 21;
/** The shortest bid window we pre-fill (trades need time to price it). */
export const MIN_BID_DAYS = 10;
/** The longest: re-tendering early still gets a deadline in the next two months. */
export const MAX_BID_DAYS = 60;

export interface RetenderDates {
  /** The RFP's bid deadline. */
  deadline: string;
  /** The new term, or null when it can't start before the award (start as soon as possible). */
  newStart: string | null;
  newEnd: string | null;
}

/**
 * The re-tender's dates from the contract's current end: the new term is
 * the next one (same length, same season); bids close three weeks before it
 * starts, but never sooner than 10 days or later than 60 days from today.
 * An expired or almost-over contract starts "as soon as possible".
 */
export function retenderDates(c: { start_date: string | null; end_date: string | null }, today: string): RetenderDates {
  const minDeadline = addDays(today, MIN_BID_DAYS);
  const maxDeadline = addDays(today, MAX_BID_DAYS);
  const next = nextTerm(c);
  if (!next) return { deadline: addDays(today, AWARD_BUFFER_DAYS), newStart: null, newEnd: null };
  const ideal = addDays(next.start, -AWARD_BUFFER_DAYS);
  const deadline = ideal < minDeadline ? minDeadline : ideal > maxDeadline ? maxDeadline : ideal;
  if (next.start <= deadline) return { deadline, newStart: null, newEnd: null };
  return { deadline, newStart: next.start, newEnd: next.end };
}

export interface RetenderContract {
  id: string;
  building_name: string | null;
  building_address: string | null;
  trade_slug: string | null;
  service_detail: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_renews: boolean;
  annual_value: number | null;
  notes: string | null;
}

/** The RFP the contract came from, as the PM posted it. */
export interface RetenderSource {
  summary: string | null;
  scope: string | null;
  requirements: string | null;
  submission_instructions: string | null;
  city: string | null;
  province: string | null;
  budget_min: number | null;
  budget_max: number | null;
  region_slug: string | null;
  property_type_slug: string | null;
  categories: string[];
}

/** The page language's sentences for the pre-filled RFP (contracts.prefill). */
export interface PrefillCopy {
  title: string;
  titleNoBuilding: string;
  summary: string;
  summaryNoBuilding: string;
  summaryAsap: string;
  service: string;
  building: string;
  address: string;
  term: string;
  termAsap: string;
  currentNotes: string;
  notice: string;
  noticeNoBuilding: string;
}

/** What the RFP form takes (components/forms/rfp-post-form RfpPostDefaults, the fields this sets). */
export interface RetenderPrefill {
  title: string;
  summary: string;
  scope: string;
  requirements?: string;
  categories: string[];
  propertyType?: string;
  regionSlug?: string;
  city?: string;
  province?: string;
  budgetMin?: number;
  budgetMax?: number;
  deadline: string;
  submissionInstructions?: string;
  contractId: string;
  retenderNotice: string;
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

/**
 * A contract (and the RFP it came from, if any) → the RFP form's defaults.
 * With a source RFP its summary, scope, requirements, instructions, trades,
 * property type, place and budget are cloned, with the new term on top;
 * without one the scope is built from the contract and its notes, and the
 * current annual value goes in the (private by default) budget. `tradeName`
 * is the trade's name in the page language; `day` formats a date for it.
 */
export function buildRetenderPrefill(input: {
  contract: RetenderContract;
  source: RetenderSource | null;
  tradeName: string | null;
  today: string;
  copy: PrefillCopy;
  day: (iso: string) => string;
}): RetenderPrefill {
  const { contract: c, source, copy, day } = input;
  // An auto-renewed contract re-tenders from its current term, not the typed one.
  const term = currentTerm(c, input.today);
  const dates = retenderDates({ start_date: term.start, end_date: term.end }, input.today);
  const service = input.tradeName ?? c.service_detail ?? "";
  const serviceLong = input.tradeName && c.service_detail ? `${input.tradeName} (${c.service_detail})` : service;
  const building = c.building_name ?? "";
  const vars = {
    service,
    building,
    start: dates.newStart ? day(dates.newStart) : "",
    end: dates.newEnd ? day(dates.newEnd) : "",
  };

  const termLine = dates.newStart && dates.newEnd ? fill(copy.term, vars) : copy.termAsap;
  const lines = [
    fill(copy.service, { service: serviceLong }),
    building ? fill(copy.building, vars) : null,
    c.building_address ? fill(copy.address, { address: c.building_address }) : null,
    termLine,
  ].filter((x): x is string => !!x);

  const summary = dates.newStart
    ? fill(building ? copy.summary : copy.summaryNoBuilding, vars)
    : fill(copy.summaryAsap, vars);
  const generatedScope = c.notes ? `${lines.join("\n")}\n\n${copy.currentNotes}\n${c.notes}` : lines.join("\n");
  const value = c.annual_value != null && c.annual_value > 0 ? Math.round(c.annual_value) : undefined;
  const sourceBudget = source && (source.budget_min != null || source.budget_max != null);

  const out: RetenderPrefill = {
    title: fill(building ? copy.title : copy.titleNoBuilding, vars).slice(0, 200),
    summary: source?.summary?.trim() || summary,
    scope: source?.scope?.trim() ? `${lines.join("\n")}\n\n${source.scope.trim()}` : generatedScope,
    categories: source?.categories.length ? [...new Set(source.categories)] : c.trade_slug ? [c.trade_slug] : [],
    deadline: dates.deadline,
    contractId: c.id,
    retenderNotice: fill(building ? copy.notice : copy.noticeNoBuilding, vars),
  };
  if (source?.requirements?.trim()) out.requirements = source.requirements.trim();
  if (source?.submission_instructions?.trim()) out.submissionInstructions = source.submission_instructions.trim();
  if (source?.property_type_slug) out.propertyType = source.property_type_slug;
  if (source?.region_slug) out.regionSlug = source.region_slug;
  if (source?.city) out.city = source.city;
  if (source?.province) out.province = source.province;
  if (sourceBudget) {
    if (source.budget_min != null) out.budgetMin = Number(source.budget_min);
    if (source.budget_max != null) out.budgetMax = Number(source.budget_max);
  } else if (value) out.budgetMax = value;
  return out;
}

// ── Timeline (next 12 months) ────────────────────────────────────────

/** The timeline's span: the first of this month to the first of the month a year on, and its 12 month starts. */
export function timelineRange(today: string): { from: string; to: string; months: string[] } {
  const from = `${today.slice(0, 7)}-01`;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(from, i));
  return { from, to: addMonths(from, 12), months };
}

/** Where a day sits on the timeline, 0 (from) to 1 (to), clamped. */
export function timelinePosition(day: string, from: string, to: string): number {
  const span = daysUntil(to, from);
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, daysUntil(day, from) / span));
}
