/**
 * "This company may already be on PMRFP": match scoring for a company being
 * created at onboarding against existing listings. Pure and client-safe.
 *
 * Signals (any one strong signal is enough to ask):
 *   name         normalized name equal (Inc/Ltd/Corp/punctuation/accents ignored)   strong
 *   website      same website domain (www. and scheme ignored)                       strong
 *   phone        same 10-digit number (a leading 1 ignored)                           strong
 *   email_domain same email domain, for company domains only (not gmail/hotmail…)    medium
 *   similar_name one name contains the other (≥ 6 letters)                            weak
 * We never auto-merge: a match only offers "Request to join" or "It's a
 * different company".
 */
import { emailDomain, isFreeEmailDomain } from "./email";

export type MatchReason = "name" | "website" | "phone" | "email_domain" | "similar_name";

export const MATCH_WEIGHTS: Record<MatchReason, number> = {
  name: 60,
  website: 70,
  phone: 60,
  email_domain: 40,
  similar_name: 25,
};

/** Show the "may already be on PMRFP" step at or above this score. */
export const MATCH_THRESHOLD = 40;

export interface CompanyFacts {
  name: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CompanyCandidate extends CompanyFacts {
  id: string;
  slug: string;
  city?: string | null;
  province?: string | null;
  organization_type?: string | null;
  profile_status?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface CompanyMatch {
  candidate: CompanyCandidate;
  score: number;
  reasons: MatchReason[];
}

// Legal suffixes and filler words that don't tell two companies apart.
const SUFFIXES = new Set([
  "inc", "incorporated", "ltd", "limited", "ltee", "llc", "llp", "lp", "corp", "corporation", "co", "company",
  "enr", "senc", "sencrl", "the", "group", "groupe", "canada", "services", "service", "and", "et",
]);

/** "Centrale De Nettoyage Inc." → "centrale de nettoyage"; "ABC Plumbing, Ltd" → "abc plumbing". */
export function normalizeCompanyName(name: string | null | undefined): string {
  const words = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // Drop trailing/leading legal words, but never the whole name.
  const kept = words.filter((w) => !SUFFIXES.has(w));
  return (kept.length ? kept : words).join(" ");
}

/** The name with spaces removed too: "a b c plumbing" and "abc plumbing" collide. */
export function compactName(name: string | null | undefined): string {
  return normalizeCompanyName(name).replace(/ /g, "");
}

/** "https://www.Centrale.ca/contact" → "centrale.ca". "" when it isn't a URL. */
export function websiteDomain(url: string | null | undefined): string {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\d?\./, "");
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/** Digits only, last 10 (drops a North American leading 1). "" when fewer than 7 digits. */
export function phoneDigits(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 7) return "";
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.slice(-10);
}

/** A company email domain worth comparing (not gmail.com and friends). */
export function companyEmailDomain(email: string | null | undefined): string {
  const d = emailDomain(email);
  return d && !isFreeEmailDomain(d) ? d : "";
}

export function scoreCompanyMatch(input: CompanyFacts, candidate: CompanyFacts): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  const a = compactName(input.name);
  const b = compactName(candidate.name);
  if (a && a === b) reasons.push("name");
  else if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) reasons.push("similar_name");

  const wa = websiteDomain(input.website);
  if (wa && wa === websiteDomain(candidate.website)) reasons.push("website");

  const pa = phoneDigits(input.phone);
  if (pa && pa === phoneDigits(candidate.phone)) reasons.push("phone");

  const ea = companyEmailDomain(input.email);
  // A company email at the other listing's own website domain counts too.
  if (ea && (ea === companyEmailDomain(candidate.email) || ea === websiteDomain(candidate.website))) reasons.push("email_domain");

  const score = Math.min(100, reasons.reduce((s, r) => s + MATCH_WEIGHTS[r], 0));
  return { score, reasons };
}

/** Candidates at or above the threshold, best first (older listing wins ties). */
export function rankCompanyMatches(input: CompanyFacts, candidates: CompanyCandidate[], limit = 3): CompanyMatch[] {
  const seen = new Set<string>();
  const out: CompanyMatch[] = [];
  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const { score, reasons } = scoreCompanyMatch(input, c);
    if (score >= MATCH_THRESHOLD) out.push({ candidate: c, score, reasons });
  }
  out.sort((x, y) => y.score - x.score || String(x.candidate.created_at ?? "").localeCompare(String(y.candidate.created_at ?? "")));
  return out.slice(0, limit);
}

/** The longest word of the normalized name: a cheap ILIKE prefilter for candidates. */
export function nameSearchToken(name: string): string {
  return normalizeCompanyName(name)
    .split(" ")
    .filter((w) => w.length >= 3)
    .sort((x, y) => y.length - x.length)[0] ?? "";
}

/** "4384677009" → "%438%467%7009%": finds "(438) 467-7009", "438.467.7009", "+1 438 467 7009". */
export function phoneLikePattern(phone: string | null | undefined): string {
  const d = phoneDigits(phone);
  if (d.length !== 10) return d ? `%${d}%` : "";
  return `%${d.slice(0, 3)}%${d.slice(3, 6)}%${d.slice(6)}%`;
}

export interface CompanyPair {
  key: string;
  /** The older listing (the one a merge keeps). */
  a: CompanyCandidate;
  b: CompanyCandidate;
  score: number;
  reasons: MatchReason[];
}

/**
 * Suspected duplicate listings among `orgs` (admin view), best first.
 * Bucketed by name / website / phone / company email domain, then scored
 * pairwise with scoreCompanyMatch.
 */
export function findCompanyDuplicates(orgs: CompanyCandidate[]): CompanyPair[] {
  const buckets = new Map<string, CompanyCandidate[]>();
  const add = (k: string, o: CompanyCandidate) => {
    const list = buckets.get(k);
    if (list) list.push(o);
    else buckets.set(k, [o]);
  };
  for (const o of orgs) {
    const n = compactName(o.name);
    if (n) add(`n:${n}`, o);
    const w = websiteDomain(o.website);
    if (w) add(`w:${w}`, o);
    const p = phoneDigits(o.phone);
    if (p) add(`p:${p}`, o);
    const e = companyEmailDomain(o.email);
    if (e) add(`e:${e}`, o);
  }
  const pairs = new Map<string, CompanyPair>();
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 50) continue; // a giant bucket is a shared placeholder, not a duplicate
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [x, y] = [list[i], list[j]];
        if (x.id === y.id) continue;
        const key = x.id < y.id ? `${x.id}:${y.id}` : `${y.id}:${x.id}`;
        if (pairs.has(key)) continue;
        const { score, reasons } = scoreCompanyMatch(x, y);
        if (score < MATCH_THRESHOLD) continue;
        const [a, b] = String(x.created_at ?? "") <= String(y.created_at ?? "") ? [x, y] : [y, x];
        pairs.set(key, { key, a, b, score, reasons });
      }
    }
  }
  return [...pairs.values()].sort((p, q) => q.score - p.score || String(q.b.created_at ?? "").localeCompare(String(p.b.created_at ?? "")));
}
