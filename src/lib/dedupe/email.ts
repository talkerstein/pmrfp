/**
 * Email normalization for duplicate checks. Pure and client-safe.
 *
 * We store the address as typed and compare the normalized form:
 * trim + lowercase everywhere; for Gmail (gmail.com / googlemail.com) also
 * drop dots and "+tags" in the local part, because Gmail delivers
 * T.Miah+pmrfp@googlemail.com to tmiah@gmail.com. Mirrors the SQL function
 * public.normalize_email() (migration 20261019000001_dedupe_signups.sql).
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Free / personal mailbox providers: their domain says nothing about a company. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.ca", "outlook.com", "live.com", "live.ca", "msn.com",
  "yahoo.com", "yahoo.ca", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "gmx.net", "mail.com", "zoho.com", "videotron.ca", "sympatico.ca", "bell.net", "rogers.com", "shaw.ca",
  "telus.net", "cogeco.ca", "yandex.com", "qq.com", "hey.com", "fastmail.com",
]);

/** Trimmed + lowercased. */
export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isGmailDomain(domain: string): boolean {
  return GMAIL_DOMAINS.has(domain.toLowerCase());
}

/** The comparison key: two addresses with the same key reach the same inbox. */
export function normalizeEmail(email: string): string {
  const e = cleanEmail(email);
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!isGmailDomain(domain)) return e;
  return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
}

export function sameMailbox(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

/** Lowercased domain, or "" when there isn't one. */
export function emailDomain(email: string | null | undefined): string {
  const e = cleanEmail(email ?? "");
  const at = e.lastIndexOf("@");
  return at > 0 ? e.slice(at + 1) : "";
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Escape LIKE wildcards (and the escape char) so user input matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * ILIKE patterns that find every stored address with the same normalized
 * key, without a database function (works before the migration runs).
 * The patterns over-match; filter the rows with sameMailbox().
 *
 *   tmiah8363@gmail.com → "t%m%i%a%h%8%3%6%3%@gmail.com", "…@googlemail.com"
 *   other@firm.ca       → "other@firm.ca" (ILIKE = case-insensitive equality)
 */
export function emailLookupPatterns(email: string): string[] {
  const key = normalizeEmail(email);
  const at = key.lastIndexOf("@");
  if (at <= 0) return [escapeLike(key)];
  const domain = key.slice(at + 1);
  if (domain !== "gmail.com") return [escapeLike(key)];
  const local = key.slice(0, at);
  // Dots may sit between any two characters; "+tag" after the last one.
  const spread = [...local].map(escapeLike).join("%");
  return [...GMAIL_DOMAINS].map((d) => `${spread}%@${d}`);
}
