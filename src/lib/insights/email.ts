/**
 * The weekly personal brief for Trade Pro and trial members (pure parts:
 * switches, who's due, what goes in, the HTML). Sent by
 * /api/cron/insights-brief through lib/insights/server.
 *
 * DECISION (one email a week, no duplicates): the brief is MERGED with the
 * weekly lead alert. A member whose opportunity-email setting is "weekly"
 * gets ONE email: the insights plus that week's new leads (logged in
 * lead_alert_log, so they never come again). While INSIGHTS_EMAIL_ENABLED
 * is on, /api/cron/lead-alerts skips those weekly members. A member on
 * "daily" keeps the daily lead alerts (they asked for them) and gets the
 * brief without a lead list, so no lead appears twice. "Off" or email off:
 * no brief at all (same setting, same one-click unsubscribe link).
 */
import { localizePath, type Locale } from "@/i18n/config";
import type { LeadCadence } from "@/lib/leads/alerts";
import type { Lead } from "@/lib/leads/match";
import { fmtFor, insightLabels, type RenderedInsight } from "./copy";
import { insightsUi } from "./ui-copy";

export function insightsEmailEnabled(env: string | undefined = process.env.INSIGHTS_EMAIL_ENABLED): boolean {
  return env === "1" || env === "true";
}

/** Insights in one brief (open ones), plus at most one locked teaser. */
export const BRIEF_MAX_INSIGHTS = 5;
export const BRIEF_MAX_LEADS = 8;
export const BRIEF_MAX_RECIPIENTS = 300;

/** Members on the weekly lead cadence get their leads inside the brief. */
export function mergesLeads(cadence: LeadCadence | null): boolean {
  return cadence === "weekly";
}

/** The lead-alert cron leaves a member to the brief: brief on and the member is weekly. */
export function leadAlertDeferredToBrief(cadence: LeadCadence | null, enabled: boolean = insightsEmailEnabled()): boolean {
  return enabled && mergesLeads(cadence);
}

export type BriefSkip = "opted-out" | "already-sent" | "empty" | "no-email";

/** Why a member gets no brief this week, or null when one is due. */
export function briefSkipReason(p: { email: string | null; cadence: LeadCadence | null; sentThisWeek: boolean; insights: number; leads: number }): BriefSkip | null {
  if (!p.email) return "no-email";
  if (!p.cadence) return "opted-out";
  if (p.sentThisWeek) return "already-sent";
  if (p.insights === 0 && p.leads === 0) return "empty";
  return null;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface BriefInput {
  lang: Locale;
  /** Display names, already in `lang`. */
  tradeNames: string[];
  area: string;
  insights: RenderedInsight[];
  /** Leads merged in (weekly members only), Pro fields included (recipients are Trade Pro / trial). */
  leads: Lead[];
  base: string;
  trial: boolean;
  unsubscribeUrl: string | null;
  mailingAddress: string;
  sender: string;
  contactEmail: string;
}

export interface RenderedBrief {
  subject: string;
  title: string;
  bodyHtml: string;
  footnoteHtml: string;
  text: string;
}

export function renderBrief(b: BriefInput): RenderedBrief {
  const ui = insightsUi(b.lang);
  const t = ui.email;
  const c = fmtFor(b.lang);
  const L = insightLabels(b.lang);
  const abs = (href: string) => (/^https?:/.test(href) ? href : `${b.base}${localizePath(href, b.lang)}`);
  const link = (href: string, text: string) => `<a href="${esc(abs(href))}" style="color:#282B59;font-weight:600">${esc(text)}</a>`;
  const muted = (s: string) => `<span style="color:#64748b;font-size:13px">${esc(s)}</span>`;
  const trades = b.tradeNames.slice(0, 3).join(", ");
  const parts: string[] = [`<p>${esc(t.intro(trades, b.area))}</p>`];
  const text: string[] = [t.intro(trades, b.area), ""];

  for (const i of b.insights) {
    const badge = i.locked ? ` <span style="font-size:11px;color:#64748b;border:1px solid #E6E8F0;border-radius:4px;padding:1px 5px">${esc(ui.card.locked[i.unlock ?? "pro"])}</span>` : "";
    const items = i.items.length
      ? `<ul style="padding-left:18px;margin:6px 0">${i.items.map((it) => `<li style="margin:0 0 4px">${it.href ? link(it.href, it.label) : esc(it.label)}${it.meta ? ` ${muted(`· ${it.meta}`)}` : ""}</li>`).join("")}</ul>`
      : "";
    const links = i.links.length ? `<p style="margin:4px 0 0;font-size:13px">${i.links.map((l) => link(l.href, `${l.label} →`)).join(" &nbsp; ")}</p>` : "";
    parts.push(
      `<div style="margin:16px 0;padding:14px 16px;border:1px solid #E6E8F0;border-radius:10px">` +
        `<p style="margin:0 0 4px;font-weight:700;color:#1B1E45">${esc(i.title)}${badge}</p>` +
        `<p style="margin:0">${esc(i.text)}</p>${items}` +
        (i.basis ? `<p style="margin:6px 0 0">${muted(i.basis)}</p>` : "") +
        links +
        `</div>`,
    );
    text.push(i.title, i.text, ...i.items.map((it) => `- ${it.label}${it.meta ? ` (${it.meta})` : ""}: ${abs(it.href)}`), "");
  }

  if (b.leads.length) {
    parts.push(`<h2 style="font-size:16px;margin:24px 0 8px;color:#1B1E45">${esc(t.leads)}</h2>`);
    const kind = (k: string) => (L.kinds as Record<string, string>)[k] ?? k;
    parts.push(
      `<ul style="padding-left:18px;margin:8px 0 16px">${b.leads
        .slice(0, BRIEF_MAX_LEADS)
        .map((l) => {
          const meta = [kind(l.kind), [l.city, l.province].filter(Boolean).join(", "), l.valueCad ? c.money(l.valueCad, "CAD") : null, l.date ? c.shortDay(l.date) : null].filter(Boolean).join(" · ");
          const who = l.pro?.contractor ? `<br>${muted(l.pro.contractor)}` : "";
          return `<li style="margin:0 0 10px;line-height:22px">${link(l.href, l.title)}<br>${muted(meta)}${who}</li>`;
        })
        .join("")}</ul>`,
    );
    text.push(t.leads, ...b.leads.slice(0, BRIEF_MAX_LEADS).map((l) => `- ${l.title}: ${abs(l.href)}`), "");
  }

  parts.push(
    `<p style="margin:20px 0 8px"><a href="${esc(abs("/dashboard"))}" style="display:inline-block;background:#282B59;color:#FFFFFF;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${esc(t.cta)}</a></p>`,
    `<p style="font-size:12px;color:#64748b">${esc(ui.card.method)}</p>`,
  );
  text.push(`${t.cta}: ${abs("/dashboard")}`, "", ui.card.method);

  const footer = [
    esc(t.footer(b.trial)),
    `<a href="${esc(abs("/dashboard/company"))}" style="color:#64748b">${esc(t.prefs)}</a>`,
    b.unsubscribeUrl ? `<a href="${esc(b.unsubscribeUrl)}" style="color:#64748b">${esc(t.unsub)}</a>` : null,
    `${esc(b.sender)}, ${esc(b.mailingAddress)} · ${esc(b.contactEmail)}`,
  ]
    .filter(Boolean)
    .join(". ");
  text.push("", `${t.footer(b.trial)}.`, b.unsubscribeUrl ? `${t.unsub}: ${b.unsubscribeUrl}` : "", `${b.sender}, ${b.mailingAddress}`);

  return { subject: t.subject(b.area), title: t.title, bodyHtml: parts.join("\n"), footnoteHtml: `${footer}.`, text: text.join("\n") };
}
