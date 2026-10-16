/**
 * Admin upload of CanadaBuys open-data files (/admin/canadabuys).
 *
 * canadabuys.canada.ca's robots.txt bars every bot, so by default no PMRFP
 * job downloads from it (see ./canadabuys-access). Instead an admin downloads
 * the files in a browser and selects them on the upload page. The browser
 * parses them, keeps only the rows the import can use (the same classifiers
 * the cron uses) and only the columns it reads, and posts that as gzipped
 * JSON to /api/admin/canadabuys/upload, which re-runs the classifiers and the
 * normal sync (insert, refresh, archive) for that one feed.
 *
 * Pure and browser-safe: no Node APIs here.
 */
import { parseCsv } from "./csv";
import { CANADABUYS_OPEN_URL, OPEN_TENDER_COLUMNS, classifyTender, type TenderRow } from "./canadabuys";
import { AWARD_COLUMNS, awardFilesFor, classifyAward, type AwardRow } from "./awards";
import { CLOSED_COLUMNS, closedFilesFor, prefilterClosed, type ClosedRow } from "./canadabuys-closed";

export type UploadKind = "open" | "awards" | "closed";
export const UPLOAD_KINDS: readonly UploadKind[] = ["open", "awards", "closed"];
export const isUploadKind = (k: unknown): k is UploadKind => k === "open" || k === "awards" || k === "closed";

/** Request body limit after gzip (Vercel functions accept 4.5 MB). */
export const UPLOAD_LIMIT_BYTES = 4_400_000;

export interface UploadPayload {
  kind: UploadKind;
  /** File names as selected (checked against the files the feed needs). */
  files: string[];
  /** open → tender rows; awards → award rows; closed → tender rows. */
  rows: Record<string, string>[];
  /** closed only: award rows that can link to one of the tenders. */
  awards?: Record<string, string>[];
}

/** "2025-2026-awardNotice-avisAttribution (1).csv" → "2025-2026-awardnotice-avisattribution". */
export function fileStem(nameOrUrl: string): string {
  const base = nameOrUrl.split(/[\\/]/).pop() ?? "";
  return base
    .replace(/\.csv$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim()
    .toLowerCase();
}

/** The official file URLs each feed needs today (the admin downloads these). */
export function filesFor(kind: UploadKind, today: string): string[] {
  if (kind === "open") return [CANADABUYS_OPEN_URL];
  if (kind === "awards") return awardFilesFor(today);
  const { tenders, awards } = closedFilesFor(today);
  return [...tenders, ...awards];
}

/** Needed files (URLs) not among the selected names. A partial upload would archive real rows, so all are required. */
export function missingFiles(kind: UploadKind, names: string[], today: string): string[] {
  const have = new Set(names.map(fileStem));
  return filesFor(kind, today).filter((u) => !have.has(fileStem(u)));
}

const isAwardFile = (name: string) => /awardnotice/i.test(name);

function pick(row: Record<string, string>, columns: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) if (row[c] !== undefined && row[c] !== "") out[c] = row[c];
  return out;
}

/**
 * Turns the selected files' text into the request payload: only rows the
 * import can use, only the columns it reads. Throws a readable message when
 * a needed file is missing.
 */
export function buildPayload(kind: UploadKind, files: { name: string; text: string }[], today: string): UploadPayload {
  const names = files.map((f) => f.name);
  const missing = missingFiles(kind, names, today);
  if (missing.length) throw new Error(`Missing file(s): ${missing.map((u) => u.split("/").pop()).join(", ")}`);
  const relevant = new Set(filesFor(kind, today).map(fileStem));
  const used = files.filter((f) => relevant.has(fileStem(f.name)));

  if (kind === "open") {
    const rows = used.flatMap((f) => parseCsv(f.text) as TenderRow[]).filter((r) => classifyTender(r, today).length > 0);
    return { kind, files: used.map((f) => f.name), rows: rows.map((r) => pick(r, OPEN_TENDER_COLUMNS)) };
  }
  if (kind === "awards") {
    const rows = used.flatMap((f) => parseCsv(f.text) as AwardRow[]).filter((r) => classifyAward(r, today).length > 0);
    return { kind, files: used.map((f) => f.name), rows: rows.map((r) => pick(r, AWARD_COLUMNS)) };
  }
  const tenders = used.filter((f) => !isAwardFile(f.name)).flatMap((f) => parseCsv(f.text) as ClosedRow[]);
  const awards = used.filter((f) => isAwardFile(f.name)).flatMap((f) => parseCsv(f.text) as ClosedRow[]);
  const kept = prefilterClosed(tenders, awards, today);
  return {
    kind,
    files: used.map((f) => f.name),
    rows: kept.tenders.map((r) => pick(r, CLOSED_COLUMNS)),
    awards: kept.awards.map((r) => pick(r, CLOSED_COLUMNS)),
  };
}

/** Server-side shape check of a decoded payload. Returns an error message, or null when usable. */
export function payloadError(p: unknown, today: string): string | null {
  if (!p || typeof p !== "object") return "Body is not a JSON object";
  const o = p as Partial<UploadPayload>;
  if (!isUploadKind(o.kind)) return "Unknown kind";
  if (!Array.isArray(o.files) || !o.files.every((f) => typeof f === "string")) return "files must be a list of names";
  const missing = missingFiles(o.kind, o.files, today);
  if (missing.length) return `Missing file(s): ${missing.map((u) => u.split("/").pop()).join(", ")}`;
  const rowsOk = (rows: unknown) =>
    Array.isArray(rows) && rows.every((r) => r && typeof r === "object" && Object.values(r).every((v) => typeof v === "string"));
  if (!rowsOk(o.rows)) return "rows must be a list of string records";
  if (o.kind === "closed" && !rowsOk(o.awards ?? [])) return "awards must be a list of string records";
  return null;
}
