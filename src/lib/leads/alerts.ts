/**
 * "New leads for {trade} in {area}": the Trade Pro (and trial) lead alert
 * email, sent by /api/cron/lead-alerts behind LEAD_ALERTS_ENABLED.
 *
 * Covers the lead kinds the daily match digest (cron/rfp-alerts) doesn't:
 * contractors who just won public work, major projects, permits and
 * development applications. New open bids and GC packages are already in
 * the daily digest, so they're left out here.
 *
 * Rules: a lead goes to a member ONCE (lead_alert_log); only leads that
 * became news in the cadence window (no backlog flood on day one); at most
 * LEAD_ALERT_MAX per email; daily or weekly from the member's opportunity
 * email setting (new_rfps: daily/instant → daily, weekly → weekly, off →
 * none; channel_email off → none); country-scoped by the matcher. Pure.
 */
import type { Lead, LeadKind } from "./match";

export function leadAlertsEnabled(env: string | undefined = process.env.LEAD_ALERTS_ENABLED): boolean {
  return env === "1" || env === "true";
}

export const LEAD_ALERT_MAX = 10;
export const ALERT_KINDS: ReadonlySet<LeadKind> = new Set(["award", "project", "permit", "application"]);

export type LeadCadence = "daily" | "weekly";

/** From notification_preferences (a missing row = the defaults: daily, email on). */
export function leadCadence(pref: { new_rfps?: string | null; channel_email?: boolean | null } | null | undefined): LeadCadence | null {
  if (pref?.channel_email === false) return null;
  const f = pref?.new_rfps ?? "daily";
  if (f === "off") return null;
  return f === "weekly" ? "weekly" : "daily";
}

/** How far back "new" goes for each cadence (a little slack for late imports). */
export const CADENCE_WINDOW_DAYS: Record<LeadCadence, number> = { daily: 3, weekly: 8 };
/** Award notices land days after the award date, so they get extra slack. */
const AWARD_SLACK_DAYS = 14;

/** Is a member due an email? Daily: not in the last 20 hours. Weekly: not in the last 6 days. */
export function isDue(cadence: LeadCadence, lastSentAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSentAt) return true;
  const gap = now.getTime() - Date.parse(lastSentAt);
  return gap >= (cadence === "weekly" ? 6 * 86_400_000 : 20 * 3_600_000);
}

const dayBefore = (today: string, days: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** The leads to email one member now: alert kinds, new in the window, never sent before, best first. */
export function pickLeadAlerts(
  leads: readonly Lead[],
  opts: { alreadySent: ReadonlySet<string>; today: string; cadence: LeadCadence; max?: number },
): Lead[] {
  const window = CADENCE_WINDOW_DAYS[opts.cadence];
  const since = dayBefore(opts.today, window);
  const awardSince = dayBefore(opts.today, window + AWARD_SLACK_DAYS);
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const l of leads) {
    if (!ALERT_KINDS.has(l.kind) || opts.alreadySent.has(l.key) || seen.has(l.key)) continue;
    if (!l.seen || l.seen < (l.kind === "award" ? awardSince : since) || l.seen > opts.today) continue;
    seen.add(l.key);
    out.push(l);
    if (out.length >= (opts.max ?? LEAD_ALERT_MAX)) break;
  }
  return out;
}

/** "3 new leads for Painting in Toronto" (English; the email is English like the other alerts). */
export function leadAlertSubject(n: number, trade: string, area: string): string {
  return `${n} new lead${n === 1 ? "" : "s"} for ${trade} in ${area}`;
}

const KIND_LABEL: Record<LeadKind, string> = {
  bid: "Open bid",
  package: "GC sub-trade package",
  award: "Just won public work",
  project: "Major project",
  permit: "Building permit",
  application: "Development application",
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email body list. Recipients are Trade Pro / trial, so the Pro fields are included. */
export function leadAlertHtml(leads: readonly Lead[], base: string, money: (n: number) => string): string {
  const items = leads
    .map((l) => {
      const place = [l.city, l.province].filter(Boolean).join(", ");
      const meta = [KIND_LABEL[l.kind], place, l.valueCad ? money(l.valueCad) : null, l.date].filter(Boolean).join(" · ");
      const who = l.pro?.contractor
        ? `<br><span style="font-size:13px;color:#3A3D4D">${l.kind === "award" ? "Won by" : "Contractor"}: <strong>${esc(l.pro.contractor)}</strong></span>`
        : "";
      const bid = l.pro?.bidListUrl
        ? `<br><a href="${esc(l.pro.bidListUrl)}" style="font-size:13px;color:#0C7A5A">Bid list / prequalification</a>`
        : "";
      return (
        `<li style="margin:0 0 16px;line-height:22px"><a href="${base}${esc(l.href)}" style="color:#282B59;font-weight:600;font-size:15px">${esc(l.title)}</a>` +
        `<br><span style="color:#0C7A5A;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${esc(meta)}</span>${who}${bid}</li>`
      );
    })
    .join("");
  return `<ul style="padding-left:18px;margin:16px 0">${items}</ul>`;
}
