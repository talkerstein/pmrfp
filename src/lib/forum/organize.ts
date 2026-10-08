/**
 * Forum organization helpers (pure, no I/O): list tabs, the query each tab
 * applies, title search escaping and "x ago" labels. Kept pure so the filter
 * logic is unit-tested without a database.
 */
import type { ThreadSummary } from "./data";

export const THREAD_SORTS = ["latest", "unanswered", "top", "solved"] as const;
export type ThreadSort = (typeof THREAD_SORTS)[number];

/** `?sort=` → a known tab; anything else is the default (latest). */
export function parseSort(v: unknown): ThreadSort {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && (THREAD_SORTS as readonly string[]).includes(s) ? (s as ThreadSort) : "latest";
}

/** Query-string suffix for a tab; the default tab keeps the clean base URL. */
export function sortQuery(sort: ThreadSort): string {
  return sort === "latest" ? "" : `?sort=${sort}`;
}

/** The subset of the PostgREST builder the tabs use. */
export interface FilterableQuery<Q> {
  eq(col: string, v: unknown): Q;
  is(col: string, v: null): Q;
  not(col: string, op: string, v: unknown): Q;
  gt(col: string, v: unknown): Q;
  order(col: string, opts: { ascending: boolean }): Q;
}

/**
 * Apply a tab to a forum_threads query.
 * - latest: newest activity first
 * - unanswered: questions with no accepted answer
 * - top: rated threads, highest total rating first (no stored average column)
 * - solved: threads with an accepted answer
 */
export function applyThreadSort<Q extends FilterableQuery<Q>>(q: Q, sort: ThreadSort): Q {
  switch (sort) {
    case "unanswered":
      return q.eq("type", "question").is("accepted_post_id", null).order("last_post_at", { ascending: false });
    case "solved":
      return q.not("accepted_post_id", "is", null).order("last_post_at", { ascending: false });
    case "top":
      return q.gt("rating_count", 0).order("rating_sum", { ascending: false }).order("rating_count", { ascending: false }).order("last_post_at", { ascending: false });
    default:
      return q.order("last_post_at", { ascending: false });
  }
}

/** In-memory twin of applyThreadSort (used by local preview samples). */
export function filterThreads(list: ThreadSummary[], sort: ThreadSort): ThreadSummary[] {
  const byLast = (a: ThreadSummary, b: ThreadSummary) => b.lastPostAt.localeCompare(a.lastPostAt);
  switch (sort) {
    case "unanswered":
      return list.filter((t) => t.type === "question" && !t.hasAccepted).sort(byLast);
    case "solved":
      return list.filter((t) => t.hasAccepted).sort(byLast);
    case "top":
      return list
        .filter((t) => t.ratingCount > 0)
        .sort((a, b) => (b.ratingAvg ?? 0) * b.ratingCount - (a.ratingAvg ?? 0) * a.ratingCount || b.ratingCount - a.ratingCount || byLast(a, b));
    default:
      return [...list].sort(byLast);
  }
}

/** Normalize a search box value: trimmed, collapsed, 2..80 chars, else null. */
export function cleanSearch(v: unknown): string | null {
  const s = (Array.isArray(v) ? v[0] : v);
  if (typeof s !== "string") return null;
  const q = s.replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : null;
}

/**
 * ILIKE pattern for a title search. Escapes the LIKE wildcards and strips
 * characters that PostgREST treats as filter syntax, so a query can't widen
 * the match or break the request.
 */
export function ilikePattern(q: string): string {
  const safe = q.replace(/[,()*"\\]/g, " ").replace(/[%_]/g, (m) => `\\${m}`).replace(/\s+/g, " ").trim();
  return `%${safe}%`;
}

/** "3 hours ago" style label, localized. */
export function timeAgo(iso: string, lang: string, now: Date = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.345],
    ["month", 12],
    ["year", Infinity],
  ];
  let v = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return rtf.format(Math.round(v), "year");
}
