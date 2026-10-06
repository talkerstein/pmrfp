/**
 * Alerts for tenders a member saved (favourited): a reminder when one is
 * 3 days from closing, and a heads-up when its status changes (closed,
 * awarded, expired, archived). Pure, so it's testable without a database.
 *
 * Dedup uses the existing `notifications` log, no new table: each alert we
 * send is logged with a `type` key below and `link_url = /rfps/<slug>`, and
 * anything already logged for that user + tender + type is skipped.
 */

export const CLOSING_SOON_DAYS = 3;
export const CLOSING_TYPE = "saved_closing";
/** Statuses that mean "something happened to this tender". */
export const ENDED_STATUSES = ["closed", "awarded", "expired", "archived"] as const;

export interface SavedRow {
  user_id: string;
  rfp_id: string;
}

export interface SavedRfp {
  id: string;
  slug: string;
  title: string;
  status: string;
  deadline: string | null;
}

export type SavedAlertKind = "closing" | "status";

export interface SavedAlertItem {
  kind: SavedAlertKind;
  rfp: SavedRfp;
  /** notifications.type used to log (and dedupe) this alert. */
  type: string;
}

export interface SavedAlertDigest {
  userId: string;
  email: string;
  items: SavedAlertItem[];
}

export function statusType(status: string): string {
  return `saved_status:${status}`;
}

export function rfpLink(slug: string): string {
  return `/rfps/${slug}`;
}

/** YYYY-MM-DD `days` after `today` (UTC). */
export function addDays(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** What (if anything) to tell a member about one saved tender today. */
export function alertFor(rfp: SavedRfp, today: string): SavedAlertItem | null {
  if ((ENDED_STATUSES as readonly string[]).includes(rfp.status)) {
    return { kind: "status", rfp, type: statusType(rfp.status) };
  }
  if (rfp.status !== "published" || !rfp.deadline) return null;
  const deadline = rfp.deadline.slice(0, 10);
  // Window rather than an exact day, so one missed cron run doesn't lose the
  // reminder; the notifications log keeps it to one email.
  if (deadline >= today && deadline <= addDays(today, CLOSING_SOON_DAYS)) {
    return { kind: "closing", rfp, type: CLOSING_TYPE };
  }
  return null;
}

export function buildSavedAlerts(input: {
  saved: SavedRow[];
  rfps: Map<string, SavedRfp>;
  today: string;
  emailByUser: Map<string, string>;
  optedOut: Set<string>;
  /** `${userId}|${type}|${link_url}` keys already in the notifications log. */
  alreadySent: Set<string>;
}): SavedAlertDigest[] {
  const byUser = new Map<string, SavedAlertItem[]>();
  for (const s of input.saved) {
    if (input.optedOut.has(s.user_id)) continue;
    const rfp = input.rfps.get(s.rfp_id);
    if (!rfp) continue;
    const item = alertFor(rfp, input.today);
    if (!item) continue;
    if (input.alreadySent.has(`${s.user_id}|${item.type}|${rfpLink(rfp.slug)}`)) continue;
    const list = byUser.get(s.user_id) ?? [];
    list.push(item);
    byUser.set(s.user_id, list);
  }
  const out: SavedAlertDigest[] = [];
  for (const [userId, items] of byUser) {
    const email = input.emailByUser.get(userId);
    if (email) out.push({ userId, email, items });
  }
  return out;
}

export function savedAlertSubject(d: SavedAlertDigest): string {
  if (d.items.length === 1) {
    const i = d.items[0];
    return i.kind === "closing"
      ? `Closing soon: ${i.rfp.title}`
      : `Update on a saved tender: ${i.rfp.title}`;
  }
  return `${d.items.length} updates on your saved tenders`;
}
