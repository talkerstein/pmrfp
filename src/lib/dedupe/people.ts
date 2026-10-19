/**
 * Same-person detection for /admin/duplicates. Pure.
 *
 * Names collide (two real "John Smith"s), so this never blocks a sign-up:
 * it only lists pairs for an admin to look at. Strongest first:
 *   email     same normalized email (gmail dots / +tags, case)     sign-up already blocks new ones
 *   phone     same full name + same phone                          within 90 days
 *   city      same full name + same company city                   within 90 days
 *   name      same full name only                                  within 90 days (weak)
 */
import { normalizeEmail } from "./email";
import { phoneDigits } from "./company";
import { pairKey } from "./review";

export type AccountReason = "email" | "phone" | "city" | "name";

export const ACCOUNT_REASON_RANK: Record<AccountReason, number> = { email: 4, phone: 3, city: 2, name: 1 };

/** Accounts created within this many days of each other are compared by name. */
export const SAME_PERSON_WINDOW_DAYS = 90;

export interface AccountFacts {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  status?: string | null;
  /** Cities of the companies they belong to (lowercase not required). */
  cities?: string[];
  /** Phones of the companies they belong to. */
  orgPhones?: string[];
}

export interface AccountPair {
  key: string;
  a: AccountFacts;
  b: AccountFacts;
  reasons: AccountReason[];
  /** The strongest reason (drives sort order and the label). */
  strength: AccountReason;
}

/** "  Thomas   MIAH " → "thomas miah" (accents dropped). "" for blank. */
export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function phonesOf(u: AccountFacts): Set<string> {
  return new Set([u.phone, ...(u.orgPhones ?? [])].map(phoneDigits).filter(Boolean));
}

function citiesOf(u: AccountFacts): Set<string> {
  return new Set((u.cities ?? []).map(normalizePersonName).filter(Boolean));
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** Why two accounts look like the same person, or [] when they don't. */
export function accountPairReasons(a: AccountFacts, b: AccountFacts, windowDays = SAME_PERSON_WINDOW_DAYS): AccountReason[] {
  const reasons: AccountReason[] = [];
  if (a.email && b.email && normalizeEmail(a.email) === normalizeEmail(b.email)) reasons.push("email");
  const na = normalizePersonName(a.full_name);
  // A one-word name ("Mike") is too common to mean anything.
  if (na && na.includes(" ") && na === normalizePersonName(b.full_name)) {
    const apart = Math.abs(Date.parse(a.created_at) - Date.parse(b.created_at)) / 86_400_000;
    if (apart <= windowDays) {
      if (overlaps(phonesOf(a), phonesOf(b))) reasons.push("phone");
      if (overlaps(citiesOf(a), citiesOf(b))) reasons.push("city");
      reasons.push("name");
    }
  }
  return reasons;
}

function strongest(reasons: AccountReason[]): AccountReason {
  return reasons.reduce((best, r) => (ACCOUNT_REASON_RANK[r] > ACCOUNT_REASON_RANK[best] ? r : best), reasons[0]);
}

/**
 * Every suspected pair among `users`, strongest signal first, then the most
 * recent sign-up first. Buckets by email key and by name, so it stays cheap
 * for a few thousand accounts.
 */
export function findAccountDuplicates(users: AccountFacts[], windowDays = SAME_PERSON_WINDOW_DAYS): AccountPair[] {
  const buckets = new Map<string, AccountFacts[]>();
  const add = (k: string, u: AccountFacts) => {
    if (!k) return;
    const list = buckets.get(k);
    if (list) list.push(u);
    else buckets.set(k, [u]);
  };
  for (const u of users) {
    if (u.email) add(`e:${normalizeEmail(u.email)}`, u);
    const n = normalizePersonName(u.full_name);
    if (n.includes(" ")) add(`n:${n}`, u);
  }
  const pairs = new Map<string, AccountPair>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [x, y] = [list[i], list[j]];
        if (x.id === y.id) continue;
        const key = pairKey(x.id, y.id);
        if (pairs.has(key)) continue;
        const reasons = accountPairReasons(x, y, windowDays);
        if (!reasons.length) continue;
        // Older account first: it's the one to keep.
        const [a, b] = x.created_at <= y.created_at ? [x, y] : [y, x];
        pairs.set(key, { key, a, b, reasons, strength: strongest(reasons) });
      }
    }
  }
  return [...pairs.values()].sort(
    (p, q) => ACCOUNT_REASON_RANK[q.strength] - ACCOUNT_REASON_RANK[p.strength] || q.b.created_at.localeCompare(p.b.created_at),
  );
}

