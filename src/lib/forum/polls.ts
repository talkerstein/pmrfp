/**
 * Thread polls (pure part): one question, 2 to 6 options, one vote per
 * verified member, results only after you vote. Mirrored in the database
 * (20261017000002_forum_rework.sql): option positions 0..5, primary key
 * (poll_id, user_id) on votes, and forum_poll_results() that only answers a
 * member who has voted. Tested in test/forum-polls.test.ts.
 */
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_QUESTION = 200;
export const MAX_OPTION = 80;

export interface PollDraft {
  question: string;
  options: string[];
}

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * Form input → a poll, null (no poll asked for), or "invalid". Blank option
 * rows are ignored; duplicates (ignoring case) make it invalid, as do fewer
 * than 2 or more than 6 options.
 */
export function parsePoll(input: { question?: unknown; options?: readonly unknown[] }): PollDraft | null | "invalid" {
  const question = clean(input.question);
  const options = (input.options ?? []).map(clean).filter(Boolean);
  if (!question && options.length === 0) return null;
  if (question.length < 3 || question.length > MAX_QUESTION) return "invalid";
  if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) return "invalid";
  if (options.some((o) => o.length > MAX_OPTION)) return "invalid";
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return "invalid";
  return { question, options };
}

export function isPollOpen(closesAt: string | null | undefined, now = new Date()): boolean {
  return !closesAt || new Date(closesAt).getTime() > now.getTime();
}

export type VoteCheck = { ok: true } | { ok: false; reason: "unverified" | "closed" | "already" | "option" | "notfound" };

/** May this member cast this vote? (The database's primary key enforces "once" as well.) */
export function checkVote(i: {
  canPost: boolean;
  pollExists: boolean;
  threadApproved: boolean;
  closesAt: string | null;
  optionInPoll: boolean;
  alreadyVoted: boolean;
  now?: Date;
}): VoteCheck {
  if (!i.canPost) return { ok: false, reason: "unverified" };
  if (!i.pollExists || !i.threadApproved) return { ok: false, reason: "notfound" };
  if (!isPollOpen(i.closesAt, i.now)) return { ok: false, reason: "closed" };
  if (!i.optionInPoll) return { ok: false, reason: "option" };
  if (i.alreadyVoted) return { ok: false, reason: "already" };
  return { ok: true };
}

/** Results are shown to members who voted, to admins, and to everyone once a poll has closed. */
export function canSeeResults(i: { voted: boolean; isAdmin?: boolean; closesAt?: string | null; now?: Date }): boolean {
  return i.voted || Boolean(i.isAdmin) || !isPollOpen(i.closesAt ?? null, i.now);
}

export interface PollOption {
  id: string;
  label: string;
  position: number;
}

export interface TalliedOption extends PollOption {
  votes: number;
  /** Whole percent of all votes (0 when nobody voted). */
  pct: number;
}

/** Counts per option → ordered rows with percentages that add up to 100 (largest remainder). */
export function tally(options: readonly PollOption[], counts: ReadonlyMap<string, number>): { rows: TalliedOption[]; total: number } {
  const ordered = [...options].sort((a, b) => a.position - b.position);
  const total = ordered.reduce((s, o) => s + Math.max(0, counts.get(o.id) ?? 0), 0);
  if (total === 0) return { rows: ordered.map((o) => ({ ...o, votes: 0, pct: 0 })), total: 0 };
  const raw = ordered.map((o) => ((counts.get(o.id) ?? 0) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return { rows: ordered.map((o, i) => ({ ...o, votes: counts.get(o.id) ?? 0, pct: floors[i] })), total };
}
