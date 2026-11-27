/**
 * Vendor Insurance & WSIB Certificate Tracker: the pure rules (no I/O).
 *
 * Country-first: a Canadian PM tracks WSIB/WCB clearance and CGL; a U.S. PM
 * tracks COIs and workers' comp. The country is the PM company's, never
 * mixed. Status, reminder stages, field cleaning and the CSV import live
 * here so they're tested without a database.
 */

export type CertCountry = "CA" | "US";

export const CERT_TYPES = ["general_liability", "wsib_clearance", "auto", "workers_comp", "other"] as const;
export type CertType = (typeof CERT_TYPES)[number];

/** The certificate types a PM in each country can pick (WSIB is Canadian, workers' comp is U.S.). */
export const CERT_TYPES_BY_COUNTRY: Record<CertCountry, readonly CertType[]> = {
  CA: ["general_liability", "wsib_clearance", "auto", "other"],
  US: ["general_liability", "workers_comp", "auto", "other"],
};

/** A type that isn't used in this country maps to its counterpart (WSIB ↔ workers' comp). */
export function certTypeFor(type: CertType, country: CertCountry): CertType {
  if (country === "US" && type === "wsib_clearance") return "workers_comp";
  if (country === "CA" && type === "workers_comp") return "wsib_clearance";
  return type;
}

export type CertStatus = "valid" | "expiring" | "expired" | "missing";

/** Expiring = within this many days (inclusive). */
export const EXPIRING_DAYS = 30;

/** "YYYY-MM-DD" for `d` in UTC (the cron and the page agree on the day). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `today` to `expiresOn` (negative once it's past). Both "YYYY-MM-DD". */
export function daysUntil(expiresOn: string, today: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+expiresOn.slice(0, 4), +expiresOn.slice(5, 7) - 1, +expiresOn.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * The chip: no expiry date on file = missing; past = expired; within 30
 * days = expiring; otherwise valid. Expiring on the day itself still counts
 * as cover for that day (expired starts the day after).
 */
export function certStatus(expiresOn: string | null | undefined, today: string): CertStatus {
  if (!expiresOn || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return "missing";
  const days = daysUntil(expiresOn, today);
  if (days < 0) return "expired";
  if (days <= EXPIRING_DAYS) return "expiring";
  return "valid";
}

export type ReminderStage = "30" | "14" | "0";

/** Which digest stage a certificate is at today, or null (more than 30 days out, or no date). Past expiry = "0". */
export function reminderStage(expiresOn: string | null | undefined, today: string): ReminderStage | null {
  if (!expiresOn) return null;
  const days = daysUntil(expiresOn, today);
  if (days <= 0) return "0";
  if (days <= 14) return "14";
  if (days <= 30) return "30";
  return null;
}

/**
 * Should today's digest include this certificate? Once per stage per
 * expiry date: a renewed certificate (new expires_on) starts over. A
 * certificate first seen already at "14" only gets "14", never a late "30".
 * Expired more than 30 days ago is old news: no email.
 */
export function needsReminder(
  row: { expires_on: string | null; reminder_stage: string | null; reminder_for: string | null },
  today: string,
): ReminderStage | null {
  const stage = reminderStage(row.expires_on, today);
  if (!stage || !row.expires_on) return null;
  if (daysUntil(row.expires_on, today) < -30) return null;
  if (row.reminder_for !== row.expires_on) return stage;
  const order: ReminderStage[] = ["30", "14", "0"];
  const sent = order.indexOf(row.reminder_stage as ReminderStage);
  return order.indexOf(stage) > sent ? stage : null;
}

/** The vendor's own renewal reminder: at 14 and at 0 days, once each, when the PM switched it on. */
export function vendorReminderStage(
  row: { expires_on: string | null; remind_vendor: boolean; contact_email: string | null; vendor_reminded_stage: string | null; reminder_for: string | null },
  today: string,
): "14" | "0" | null {
  if (!row.remind_vendor || !row.contact_email) return null;
  const stage = reminderStage(row.expires_on, today);
  if (stage !== "14" && stage !== "0") return null;
  if (row.expires_on && daysUntil(row.expires_on, today) < -30) return null;
  // A renewed certificate starts over: the stamp only counts for the same expiry.
  const already = row.reminder_for === row.expires_on ? row.vendor_reminded_stage : null;
  if (already === stage || (already === "0" && stage === "14")) return null;
  return stage;
}

// ── Fields ───────────────────────────────────────────────────────────

const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;

/** A typed email → lower-case key, or null. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s.length >= 6 && s.length <= 254 && EMAIL.test(s) ? s : null;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** "$2,000,000", "2000000", "2 000 000 $", "2M" → 2000000; junk → null. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase().replace(/(cad|usd|\$|\s|,)/g, "");
  if (!s) return null;
  let mult = 1;
  if (s.endsWith("m")) {
    mult = 1_000_000;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    mult = 1_000;
    s = s.slice(0, -1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s) * mult;
  return n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : null;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "Mar", "March", "Sept." → 3 / 3 / 9; anything else → 0. */
function monthOf(word: string): number {
  const k = word.toLowerCase().replace(/\.$/, "");
  return k.length >= 3 ? MONTH_NAMES.findIndex((n) => n.startsWith(k)) + 1 : 0;
}

/** "2027-03-31", "2027/3/31", "Mar 31 2027", "31 Mar 2027" → "2027-03-31"; ambiguous 03/04/2027 → null. */
export function parseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let y: number, m: number, d: number;
  let hit = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (hit) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = s.match(/^([a-z]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/i)) && monthOf(hit[1])) {
    [y, m, d] = [+hit[3], monthOf(hit[1]), +hit[2]];
  } else if ((hit = s.match(/^(\d{1,2})\s+([a-z]+\.?),?\s+(\d{4})$/i)) && monthOf(hit[2])) {
    [y, m, d] = [+hit[3], monthOf(hit[2]), +hit[1]];
  } else return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // Feb 30 and friends
  return isoDay(date);
}

/** Free text in a type column ("CGL", "WSIB", "COI", "workers comp") → a type for this country. */
export function parseCertType(v: unknown, country: CertCountry): CertType {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  let t: CertType = "general_liability";
  if (!s) t = "general_liability";
  else if ((CERT_TYPES as readonly string[]).includes(s)) t = s as CertType;
  else if (/wsib|wcb|cnesst|worksafe|clearance/.test(s)) t = "wsib_clearance";
  else if (/workers|comp/.test(s)) t = "workers_comp";
  else if (/auto|vehicle|fleet/.test(s)) t = "auto";
  else if (/liab|cgl|coi|general|insurance/.test(s)) t = "general_liability";
  else t = "other";
  return certTypeFor(t, country);
}

export interface VendorInput {
  vendor_name: string;
  contact_email: string | null;
  trade: string | null;
  cert_type: CertType;
  insurer: string | null;
  policy_number: string | null;
  coverage_amount: number | null;
  expires_on: string | null;
  notes: string | null;
  remind_vendor: boolean;
}

export type VendorFieldError = "name" | "email" | "date" | "amount";

/** A PM's typed row → clean columns, or which field is wrong. */
export function cleanVendorInput(raw: Record<string, unknown>, country: CertCountry): { ok: true; value: VendorInput } | { ok: false; field: VendorFieldError } {
  const name = text(raw.vendor_name, 160);
  if (!name) return { ok: false, field: "name" };
  const emailRaw = typeof raw.contact_email === "string" ? raw.contact_email.trim() : "";
  const email = emailRaw ? cleanEmail(emailRaw) : null;
  if (emailRaw && !email) return { ok: false, field: "email" };
  const dateRaw = typeof raw.expires_on === "string" ? raw.expires_on.trim() : "";
  const expires = dateRaw ? parseDate(dateRaw) : null;
  if (dateRaw && !expires) return { ok: false, field: "date" };
  const amountRaw = typeof raw.coverage_amount === "string" ? raw.coverage_amount.trim() : raw.coverage_amount;
  const amount = amountRaw === "" || amountRaw == null ? null : parseAmount(amountRaw);
  if (amountRaw !== "" && amountRaw != null && amount === null) return { ok: false, field: "amount" };
  const type = (CERT_TYPES as readonly string[]).includes(String(raw.cert_type)) ? (raw.cert_type as CertType) : parseCertType(raw.cert_type, country);
  return {
    ok: true,
    value: {
      vendor_name: name,
      contact_email: email,
      trade: text(raw.trade, 80),
      cert_type: certTypeFor(type, country),
      insurer: text(raw.insurer, 120),
      policy_number: text(raw.policy_number, 80),
      coverage_amount: amount,
      expires_on: expires,
      notes: text(raw.notes, 500),
      remind_vendor: raw.remind_vendor === true || raw.remind_vendor === "on" || raw.remind_vendor === "true",
    },
  };
}

// ── Files ────────────────────────────────────────────────────────────

export const CERT_BUCKET = "vendor-certificates";
export const MAX_CERT_BYTES = 10 * 1024 * 1024;
export const CERT_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Sniff the first bytes: browsers' file.type is only a hint. */
export function sniffCertMime(head: Uint8Array): string | null {
  const b = head;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"; // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Storage path: <pm org>/<certificate>/<random>.<ext> (never the vendor's file name). */
export function certPath(orgId: string, certId: string, nonce: string, mime: string): string {
  return `${orgId}/${certId}/${nonce}.${CERT_MIME[mime] ?? "bin"}`;
}

/** A display name for the stored file: the original name, trimmed and stripped of paths. */
export function cleanFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop()!.replace(/[^\w.\- ()]+/g, "_").trim();
  return base ? base.slice(-200) : null;
}

// ── Requests ─────────────────────────────────────────────────────────

/** A request link works this long. */
export const REQUEST_TTL_DAYS = 30;
/** One vendor can't be emailed more than once a day. */
export const REQUEST_COOLDOWN_HOURS = 24;
/** A PM company sends at most this many requests a day. */
export const DAILY_REQUEST_LIMIT = 50;
/** CSV import cap per run. */
export const MAX_IMPORT_ROWS = 200;

export function canRequestAgain(lastSentAt: string | null | undefined, now: Date): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= REQUEST_COOLDOWN_HOURS * 3_600_000;
}

// ── CSV import ───────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, commas, semicolons or tabs. */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^﻿/, "");
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i];
    if (quoted) {
      if (c === '"' && textIn[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && textIn[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const HEADER_KEYS: [keyof VendorInput, RegExp][] = [
  ["contact_email", /e-?mail|courriel|correo/],
  ["policy_number", /policy|police|p[oó]liza|number|no\.?$|#/],
  ["coverage_amount", /coverage|amount|limit|montant|monto|cobertura/],
  ["expires_on", /expir|expiry|date|[ée]ch[ée]ance|vence|vencimiento/],
  ["cert_type", /type|kind|tipo/],
  ["insurer", /insurer|carrier|assureur|aseguradora|insurance co/],
  ["trade", /trade|service|m[ée]tier|oficio|category/],
  ["vendor_name", /vendor|company|name|supplier|contractor|fournisseur|entreprise|proveedor|nombre/],
];

/** Header row → which column holds which field (or null when the first row isn't a header). */
export function mapHeader(row: string[]): (keyof VendorInput | null)[] | null {
  const mapped = row.map((h) => {
    const s = h.trim().toLowerCase();
    if (!s) return null;
    return HEADER_KEYS.find(([, re]) => re.test(s))?.[0] ?? null;
  });
  return mapped.includes("vendor_name") ? mapped : null;
}

/** Default column order when there's no header row. */
const DEFAULT_ORDER: (keyof VendorInput)[] = ["vendor_name", "contact_email", "trade", "cert_type", "insurer", "policy_number", "coverage_amount", "expires_on"];

export interface ImportResult {
  rows: VendorInput[];
  /** 1-based line numbers that couldn't be read (no name, bad email or date). */
  skipped: number[];
  /** More than MAX_IMPORT_ROWS: the rest were left out. */
  truncated: boolean;
}

/** A pasted or uploaded vendor list → clean rows for this country. */
export function importVendors(csv: string, country: CertCountry): ImportResult {
  const all = parseCsv(csv);
  if (all.length === 0) return { rows: [], skipped: [], truncated: false };
  const header = mapHeader(all[0]);
  const body = header ? all.slice(1) : all;
  const cols = header ?? DEFAULT_ORDER;
  const rows: VendorInput[] = [];
  const skipped: number[] = [];
  const offset = header ? 2 : 1;
  for (let i = 0; i < body.length; i++) {
    if (rows.length >= MAX_IMPORT_ROWS) return { rows, skipped, truncated: true };
    const raw: Record<string, unknown> = {};
    cols.forEach((key, j) => {
      if (key && body[i][j] !== undefined && raw[key] === undefined) raw[key] = body[i][j];
    });
    const res = cleanVendorInput(raw, country);
    if (res.ok) rows.push(res.value);
    else skipped.push(i + offset);
  }
  return { rows, skipped, truncated: false };
}

// ── Try-it box (landing page) ────────────────────────────────────────────

/** Where the try-it box leaves a pasted list, in this browser only, for the tracker's import panel. */
export const VENDOR_LIST_DRAFT_KEY = "pmrfp:vendor-list-draft";

export interface CheckedVendor {
  name: string;
  trade: string | null;
  expiresOn: string | null;
  status: CertStatus;
  days: number | null;
}

const STATUS_ORDER: Record<CertStatus, number> = { expired: 0, expiring: 1, missing: 2, valid: 3 };

/** A pasted list → each vendor's status, worst first. Same rules as the tracker; nothing is stored. */
export function checkVendorList(csv: string, country: CertCountry, today: string) {
  const { rows, skipped, truncated } = importVendors(csv, country);
  const vendors: CheckedVendor[] = rows
    .map((r) => ({
      name: r.vendor_name,
      trade: r.trade,
      expiresOn: r.expires_on,
      status: certStatus(r.expires_on, today),
      days: r.expires_on ? daysUntil(r.expires_on, today) : null,
    }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return { vendors, attention: vendors.filter((v) => v.status !== "valid").length, skipped, truncated };
}

/** Days from today for the sample rows, so the sample always shows all four statuses. */
const SAMPLE_OFFSETS = [240, 12, -20, null];

/** The try-it box's starting list: labelled sample vendors with dates relative to `today`. */
export function sampleVendorList(header: string, rows: readonly { name: string; trade: string }[], today: string): string {
  const lines = rows.map((r, i) => {
    const off = SAMPLE_OFFSETS[i % SAMPLE_OFFSETS.length];
    const date = off == null ? "" : isoDay(new Date(Date.parse(`${today}T00:00:00Z`) + off * 86_400_000));
    return `${r.name},${r.trade},${date}`;
  });
  return [header, ...lines].join("\n");
}
