/**
 * OPEN DATA: the permit lead (table permit_leads) and the one filter every
 * permit importer applies.
 *
 * A permit lead answers "who is building what, where, lately": the
 * contractor (a BUSINESS, never a person), the city, the permit's declared
 * value and its work type. It deliberately holds NO street address, no
 * applicant / owner and no free-text description (those can carry a
 * homeowner's name or address, and every open-data licence excludes personal
 * information). One row is ~330 bytes with its indexes.
 *
 * Filter (all three must hold):
 *   - issued in the last PERMIT_WINDOW_MONTHS (24) months;
 *   - declared value >= PERMIT_MIN_VALUE_CAD ($100,000);
 *   - the contractor name passes businessOnly() (src/lib/open-data/business-name.mjs).
 */
import { businessKey, businessOnly } from "./business-name.mjs";

export const PERMIT_MIN_VALUE_CAD = 100_000;
export const PERMIT_WINDOW_MONTHS = 24;
/** Open-data polite User-Agent (named, with a contact address). */
export const OPEN_DATA_UA = "PMRFP-data (info@pmrfp.com)";

export interface PermitLead {
  source: string;
  source_key: string;
  city: string;
  province: string;
  issued_on: string;
  value_cad: number;
  contractor: string;
  contractor_key: string;
  work_type: string | null;
  as_of: string;
}

/** The oldest issue date that still counts, YYYY-MM-DD. */
export function permitWindowStart(today: string, months = PERMIT_WINDOW_MONTHS): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-15", "20261015", "2026-10-15T00:00:00", 1760486400000 (epoch ms), "Oct 15, 2026" -> "2026-10-15"; else null. */
export function permitDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  const t = Date.parse(`${s} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** "$1,234,500", 1234500, "1234500.00" -> 1234500; blanks and junk -> null. */
export function permitValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 && v < 1e11 ? Math.round(v) : null;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e11 ? Math.round(n) : null;
}

const tidy = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Work type from the city's STRUCTURED fields only (never free text), "New · Duplex", max 80 chars. */
export function workType(...parts: unknown[]): string | null {
  const t = [...new Set(parts.map(tidy).filter((p) => p && !/^(\*|n\/?a|see description|null)/i.test(p)))].join(" · ");
  return t ? t.slice(0, 80) : null;
}

export type PermitSkip = "no-id" | "no-date" | "too-old" | "future-date" | "below-min-value" | "no-value" | "not-a-business";

export interface RawPermit {
  source: string;
  id: unknown;
  city: string;
  province: string;
  issued: unknown;
  value: unknown;
  contractor: unknown;
  workType?: string | null;
}

/** The lead to store, or why the row is dropped. */
export function toPermitLead(p: RawPermit, today: string, minValue = PERMIT_MIN_VALUE_CAD): PermitLead | PermitSkip {
  const id = tidy(p.id);
  if (!id || id.length > 120) return "no-id";
  const issued = permitDate(p.issued);
  if (!issued) return "no-date";
  if (issued > today) return "future-date";
  if (issued < permitWindowStart(today)) return "too-old";
  const value = permitValue(p.value);
  if (value === null) return "no-value";
  if (value < minValue) return "below-min-value";
  const contractor = businessOnly(p.contractor);
  if (!contractor) return "not-a-business";
  return {
    source: p.source,
    source_key: id,
    city: p.city,
    province: p.province,
    issued_on: issued,
    value_cad: value,
    contractor,
    contractor_key: businessKey(contractor),
    work_type: p.workType ?? null,
    as_of: today,
  };
}

export interface PermitBatch {
  read: number;
  leads: PermitLead[];
  skipped: Record<string, number>;
}

/** Fold raw permits into a batch with skip counts and one lead per (source, id). */
export function foldPermits(raws: Iterable<RawPermit>, today: string, minValue = PERMIT_MIN_VALUE_CAD): PermitBatch {
  const out: PermitBatch = { read: 0, leads: [], skipped: {} };
  const seen = new Map<string, PermitLead>();
  for (const raw of raws) {
    out.read++;
    const r = toPermitLead(raw, today, minValue);
    if (typeof r === "string") {
      out.skipped[r] = (out.skipped[r] ?? 0) + 1;
      continue;
    }
    seen.set(`${r.source}|${r.source_key}`, r);
  }
  out.leads = [...seen.values()];
  return out;
}
