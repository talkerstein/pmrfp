/**
 * /admin/analytics and the weekly email: shapes the aggregated
 * site_analytics_report() result (migration 20261021000200) into per-market
 * numbers and funnels. Pure and unit-tested; no database here.
 *
 * Canada and the U.S. are always separate ("other" = any other country or
 * unknown). Funnel steps count distinct people (an account, or else a
 * visitor-day hash), except "Visits", which is visitor-days.
 */

import { CHANNEL_LABEL, isChannel } from "@/lib/attribution/channel";
import type { Market } from "./events";

export type RoleGroup = "trade" | "pm" | "town" | "other";

export interface RawReport {
  from: string;
  to: string;
  daily: { day: string; market: Market; visitors: number; page_views: number }[];
  top_pages: { market: Market; path: string; views: number }[];
  top_referrers: { market: Market; host: string; visits: number }[];
  signups: { market: Market; channel: string; method: string; role: string; n: number }[];
  accounts: { total: number; without_row: number } | null;
  events: { market: Market; event: string; role_group: RoleGroup; actors: number; n: number }[];
}

export const EMPTY_REPORT: RawReport = {
  from: "",
  to: "",
  daily: [],
  top_pages: [],
  top_referrers: [],
  signups: [],
  accounts: null,
  events: [],
};

/** Accepts whatever the RPC returned; anything malformed becomes empty. */
export function normalizeReport(raw: unknown): RawReport {
  if (!raw || typeof raw !== "object") return EMPTY_REPORT;
  const r = raw as Partial<RawReport>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    from: String(r.from ?? ""),
    to: String(r.to ?? ""),
    daily: arr(r.daily),
    top_pages: arr(r.top_pages),
    top_referrers: arr(r.top_referrers),
    signups: arr(r.signups),
    accounts: r.accounts && typeof r.accounts === "object" ? r.accounts : null,
    events: arr(r.events),
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  n: number;
  /** Share of the step before (null when that step is 0, or for the first step). */
  fromPrev: number | null;
  /** Share of the first step (null when the first step is 0). */
  fromTop: number | null;
}

/** Conversion at each step: from the previous step and from the top. Never divides by zero. */
export function funnel(steps: readonly { key: string; label: string; n: number }[]): FunnelStep[] {
  const top = steps[0]?.n ?? 0;
  return steps.map((s, i) => {
    const n = Math.max(0, Math.round(s.n));
    const prev = i > 0 ? Math.max(0, Math.round(steps[i - 1].n)) : 0;
    return {
      key: s.key,
      label: s.label,
      n,
      fromPrev: i === 0 || prev === 0 ? null : n / prev,
      fromTop: top > 0 ? n / top : null,
    };
  });
}

/** "12%", "0.8%", or "–" when there's nothing to divide by. */
export function pct(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return "–";
  const p = r * 100;
  if (p === 0) return "0%";
  if (p < 10) return `${p.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(p)}%`;
}

function actors(raw: RawReport, market: Market, event: string, groups?: readonly RoleGroup[]): number {
  return raw.events
    .filter((e) => e.market === market && e.event === event && (!groups || groups.includes(e.role_group)))
    .reduce((s, e) => s + (Number(e.actors) || 0), 0);
}

export const STEP_LABEL: Record<string, string> = {
  visit: "Visits",
  signup_started: "Opened sign-up",
  signup_completed: "Signed up",
  onboarding_completed: "Finished onboarding",
  upgrade_clicked: "Clicked upgrade",
  checkout_started: "Started checkout",
  checkout_completed: "Paid",
  writer_started: "Started the RFP Writer",
  rfp_posted: "Posted an RFP",
};

export interface MarketView {
  market: Market;
  visitors: number;
  pageViews: number;
  daily: { day: string; visitors: number; pageViews: number }[];
  topPages: { path: string; views: number }[];
  topReferrers: { host: string; visits: number }[];
  signups: number;
  signupsByChannel: { channel: string; label: string; n: number }[];
  signupsByMethod: { method: string; n: number }[];
  funnel: { shared: FunnelStep[]; trade: FunnelStep[]; pm: FunnelStep[] };
  /** Other activity, distinct people. */
  activity: { event: string; n: number }[];
}

/**
 * Branch funnels count signed-in members of that side only (checkout and
 * posting need an account). Anonymous upgrade clicks and writer use show
 * under "Other activity", counted for everyone.
 */
const TRADE_SIDE: readonly RoleGroup[] = ["trade"];
const PM_SIDE: readonly RoleGroup[] = ["pm"];

export function marketView(raw: RawReport, market: Market): MarketView {
  const daily = raw.daily
    .filter((d) => d.market === market)
    .map((d) => ({ day: d.day, visitors: Number(d.visitors) || 0, pageViews: Number(d.page_views) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const visitors = daily.reduce((s, d) => s + d.visitors, 0);
  const pageViews = daily.reduce((s, d) => s + d.pageViews, 0);

  const byChannel = new Map<string, number>();
  const byMethod = new Map<string, number>();
  let signups = 0;
  for (const s of raw.signups.filter((x) => x.market === market)) {
    const n = Number(s.n) || 0;
    signups += n;
    byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + n);
    byMethod.set(s.method, (byMethod.get(s.method) ?? 0) + n);
  }
  const step = (key: string, n: number) => ({ key, label: STEP_LABEL[key] ?? key, n });

  return {
    market,
    visitors,
    pageViews,
    daily,
    topPages: raw.top_pages.filter((p) => p.market === market).map((p) => ({ path: p.path, views: Number(p.views) || 0 })),
    topReferrers: raw.top_referrers.filter((p) => p.market === market).map((p) => ({ host: p.host, visits: Number(p.visits) || 0 })),
    signups,
    signupsByChannel: [...byChannel.entries()]
      .map(([channel, n]) => ({ channel, label: isChannel(channel) ? CHANNEL_LABEL[channel] : channel, n }))
      .sort((a, b) => b.n - a.n || a.channel.localeCompare(b.channel)),
    signupsByMethod: [...byMethod.entries()].map(([method, n]) => ({ method, n })).sort((a, b) => b.n - a.n),
    funnel: {
      shared: funnel([
        step("visit", visitors),
        step("signup_started", actors(raw, market, "signup_started")),
        step("signup_completed", actors(raw, market, "signup_completed")),
        step("onboarding_completed", actors(raw, market, "onboarding_completed")),
      ]),
      trade: funnel([
        step("onboarding_completed", actors(raw, market, "onboarding_completed", ["trade"])),
        step("upgrade_clicked", actors(raw, market, "upgrade_clicked", TRADE_SIDE)),
        step("checkout_started", actors(raw, market, "checkout_started", TRADE_SIDE)),
        step("checkout_completed", actors(raw, market, "checkout_completed", TRADE_SIDE)),
      ]),
      pm: funnel([
        step("onboarding_completed", actors(raw, market, "onboarding_completed", PM_SIDE)),
        step("writer_started", actors(raw, market, "writer_started", PM_SIDE)),
        step("rfp_posted", actors(raw, market, "rfp_posted", PM_SIDE)),
      ]),
    },
    activity: [
      "pricing_viewed",
      "upgrade_clicked",
      "writer_started",
      "writer_draft_generated",
      "trial_started",
      "rfp_posted",
      "follow_buyer",
      "claim_started",
      "claim_verified",
      "respond_to_job",
      "quote_request_posted",
    ].map((event) => ({ event, n: actors(raw, market, event) })),
  };
}

/** Lines for the Monday admin email (one market). */
export function weeklyLines(v: MarketView): string[] {
  const s = v.funnel.shared;
  const conv = (a: FunnelStep | undefined, b: FunnelStep | undefined) => (a && b && a.n > 0 ? pct(b.n / a.n) : "–");
  const sources = v.signupsByChannel.slice(0, 4).map((c) => `${c.label} ${c.n}`).join(", ") || "none";
  return [
    `Visitors ${v.visitors} · page views ${v.pageViews}`,
    `Sign-ups ${v.signups} by source: ${sources}`,
    `Visit → sign-up ${conv(s[0], s[2])} · sign-up → onboarded ${conv(s[2], s[3])} · trade upgrade → paid ${conv(v.funnel.trade[1], v.funnel.trade[3])} · PM writer → posted ${conv(v.funnel.pm[1], v.funnel.pm[2])}`,
  ];
}
