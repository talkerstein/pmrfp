/**
 * "Major projects near you" — a section in the Trade Pro daily match digest
 * (api/cron/rfp-alerts), behind MAJOR_PROJECT_ALERTS=1. A project shows up
 * when it is NEW to PMRFP or its STATUS CHANGED in the digest window, it is
 * in one of the member's provinces, and it needs one of the member's trades.
 * Canada only: a company that doesn't work in Canada never gets one.
 * It only rides along with a digest that is going out anyway — never its own
 * email. Pure, so it's testable without a database or a mail server.
 */
import type { MajorProjectStatus } from "./model";

export const MAJOR_PROJECT_ALERT_MAX = 3;

export function majorProjectAlertsEnabled(env: string | undefined = process.env.MAJOR_PROJECT_ALERTS): boolean {
  return env === "1" || env === "true";
}

export interface ProjectAlertRow {
  slug: string;
  name: string;
  province: string | null;
  city: string | null;
  status: MajorProjectStatus;
  previousStatus: MajorProjectStatus | null;
  estValueCad: number | null;
  tradesNeeded: string[];
  /** ISO timestamps. */
  firstSeenAt: string;
  statusChangedAt: string | null;
  stale: boolean;
}

export interface ProjectAlert {
  slug: string;
  name: string;
  city: string | null;
  province: string;
  kind: "new" | "status";
  status: MajorProjectStatus;
  previousStatus: MajorProjectStatus | null;
  estValueCad: number | null;
  tradesNeeded: string[];
}

/** Projects that changed in the window (new, or a status change), newest news first. */
export function projectEvents(rows: readonly ProjectAlertRow[], since: string): ProjectAlert[] {
  const out: (ProjectAlert & { at: string })[] = [];
  for (const r of rows) {
    if (r.stale || !r.province) continue;
    // Finished or dead projects aren't news a trade can act on.
    if (r.status === "completed" || r.status === "cancelled") continue;
    const changed = r.statusChangedAt && r.statusChangedAt >= since && r.previousStatus && r.previousStatus !== r.status;
    const isNew = r.firstSeenAt >= since;
    if (!changed && !isNew) continue;
    out.push({
      slug: r.slug,
      name: r.name,
      city: r.city,
      province: r.province,
      kind: changed ? "status" : "new",
      status: r.status,
      previousStatus: changed ? r.previousStatus : null,
      estValueCad: r.estValueCad,
      tradesNeeded: r.tradesNeeded,
      at: (changed ? r.statusChangedAt : r.firstSeenAt) ?? "",
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || (b.estValueCad ?? 0) - (a.estValueCad ?? 0)).map(({ at: _at, ...a }) => a);
}

/**
 * Up to `max` project alerts for one member: Canada must be one of their
 * countries, the project in one of their provinces, and one of the
 * project's trades one of theirs. Biggest first. `alreadySent` holds
 * `${slug}|${status}` the member already got.
 */
export function projectAlertsFor(
  events: readonly ProjectAlert[],
  member: { tradeSlugs: ReadonlySet<string>; provinces: ReadonlySet<string>; countries: ReadonlySet<"CA" | "US">; alreadySent?: ReadonlySet<string> },
  max = MAJOR_PROJECT_ALERT_MAX,
): ProjectAlert[] {
  if (!member.countries.has("CA")) return [];
  return events
    .filter(
      (e) =>
        member.provinces.has(e.province) &&
        e.tradesNeeded.some((t) => member.tradeSlugs.has(t)) &&
        !member.alreadySent?.has(`${e.slug}|${e.status}`),
    )
    .sort((a, b) => (b.estValueCad ?? 0) - (a.estValueCad ?? 0))
    .slice(0, max);
}

const STATUS_WORDS: Record<MajorProjectStatus, string> = {
  proposed: "proposed",
  approved: "approved",
  under_construction: "under construction",
  completed: "completed",
  on_hold: "on hold",
  cancelled: "cancelled",
  unknown: "status unknown",
};

/** One plain line for the email: "Now under construction (was approved) · Calgary, Alberta · $48M". */
export function projectAlertLine(a: ProjectAlert, money: (n: number) => string): string {
  const head =
    a.kind === "status" && a.previousStatus
      ? `Now ${STATUS_WORDS[a.status]} (was ${STATUS_WORDS[a.previousStatus]})`
      : `New on PMRFP · ${STATUS_WORDS[a.status]}`;
  return [head, [a.city, a.province].filter(Boolean).join(", "), a.estValueCad ? money(a.estValueCad) : null].filter(Boolean).join(" · ");
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The digest's "Major projects near you" block, or "" when there are none. */
export function majorProjectsHtml(items: { slug: string; name: string; line: string }[], base: string): string {
  if (!items.length) return "";
  const list = items
    .map(
      (i) =>
        `<li style="margin:0 0 12px;font-size:14px;color:#3A3D4D"><a href="${base}/major-projects/${esc(i.slug)}" style="color:#282B59;font-weight:600">${esc(i.name)}</a>` +
        `<br><span style="font-size:13px">${esc(i.line)}</span></li>`,
    )
    .join("");
  return (
    `<h2 style="font-size:16px;margin:24px 0 8px">Major projects near you</h2>` +
    `<p style="margin:0 0 8px;font-size:13px;color:#64748b">Big jobs in your province and trades that are new or just changed status. Trade packages usually go out through the general contractor, so this is the time to get on the bid list.</p>` +
    `<ul style="padding-left:18px;margin:8px 0 16px">${list}</ul>`
  );
}
