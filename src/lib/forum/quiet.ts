/**
 * A quiet forum should look intentional, not dead. Pure rules (tested in
 * test/forum-quiet.test.ts) for what the forum shows while it is young:
 *  - lists never advertise zeros ("0 replies", "Unanswered") — counts only
 *    render when there is something to count;
 *  - the "be the first" call to action lives on thread pages only;
 *  - forums with no threads collapse behind one toggle;
 *  - the home leads with pinned staff guides and real tender threads.
 * Nothing here invents activity: every item comes from a real row.
 */

/** A count worth showing, or null when there is nothing to count. */
export function shownCount(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** The status chip a thread gets in a list: solved, open (has replies), or none. */
export function listStatus(th: { type: "question" | "discussion"; hasAccepted: boolean; replyCount: number }): "solved" | "open" | null {
  if (th.hasAccepted) return "solved";
  if (th.type === "question" && th.replyCount > 0) return "open";
  return null;
}

/** Forums with threads vs the quiet ones that collapse behind a toggle. */
export function partitionForums<T extends { threadCount: number }>(list: readonly T[]): { active: T[]; quiet: T[] } {
  return { active: list.filter((c) => c.threadCount > 0), quiet: list.filter((c) => c.threadCount <= 0) };
}

/** Thread page: "Be the first to answer" (questions) or "...to reply" (discussions), only while empty. */
export function firstReplyPrompt(th: { type: "question" | "discussion"; replyCount: number; isLocked: boolean }): "answer" | "reply" | null {
  if (th.replyCount > 0 || th.isLocked) return null;
  return th.type === "question" ? "answer" : "reply";
}

/** Pinned guides for the home "Start here" row: round-robin across forums so one forum can't fill it. */
export function pickStartHere<T extends { categorySlug: string }>(guides: readonly T[], n: number): T[] {
  const byForum = new Map<string, T[]>();
  for (const g of guides) {
    const list = byForum.get(g.categorySlug) ?? [];
    list.push(g);
    byForum.set(g.categorySlug, list);
  }
  const queues = [...byForum.values()];
  const out: T[] = [];
  for (let round = 0; out.length < n && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (out.length >= n) break;
      if (q[round]) out.push(q[round]);
    }
  }
  return out;
}

export interface AutoItem {
  id: string;
  categorySlug: string;
  createdAt: string;
  /** auto_source: tender | rfp | award. */
  kind: string | null;
  /** The listing's closing date (YYYY-MM-DD) when known. */
  deadline: string | null;
}

const DAY = 86_400_000;

/**
 * "Open tenders this week": automatic tender/RFP threads for listings
 * published in the last `days` days whose closing date is today or later.
 * Unknown closing dates are left out (we can't say they're open). Newest first.
 */
export function openTenderStrip<T extends AutoItem>(items: readonly T[], opts: { today: string; now: Date; days?: number; limit?: number }): T[] {
  const since = opts.now.getTime() - (opts.days ?? 7) * DAY;
  return items
    .filter((i) => (i.kind === "tender" || i.kind === "rfp") && i.deadline != null && i.deadline >= opts.today && Date.parse(i.createdAt) >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, opts.limit ?? 8);
}

/**
 * Newest automatic tender/RFP threads per forum (awards left out), at most
 * `per` each; forums ordered by their newest thread, at most `forums`.
 * Threads already shown elsewhere (`skip`) are left out.
 */
export function newestPerForum<T extends AutoItem>(items: readonly T[], opts: { per?: number; forums?: number; skip?: Set<string> } = {}): { forum: string; threads: T[] }[] {
  const per = opts.per ?? 2;
  const groups = new Map<string, T[]>();
  for (const i of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (i.kind !== "tender" && i.kind !== "rfp") continue;
    if (opts.skip?.has(i.id)) continue;
    const list = groups.get(i.categorySlug) ?? [];
    if (list.length < per) list.push(i);
    groups.set(i.categorySlug, list);
  }
  return [...groups.entries()].map(([forum, threads]) => ({ forum, threads })).slice(0, opts.forums ?? 6);
}

/** Today's date (YYYY-MM-DD) where most bidders are: Toronto time. */
export function torontoToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}
