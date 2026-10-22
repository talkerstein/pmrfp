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
  /** signup_step / onboarding_step by step (and the field a refused form named). Missing before migration 20261022000100. */
  steps: { market: Market; event: string; step: string; field: string; actors: number; n: number }[];
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
  steps: [],
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
    steps: arr(r.steps),
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
  signup_viewed: "Opened the sign-up page",
  signup_started: "Submitted the sign-up form",
  signup_completed: "Account created",
  email_confirmed: "Confirmed their email",
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
  /** The sign-up wizard and the onboarding form, step by step: where unfinished sign-ups stopped. */
  stalls: StallView;
  /** The single biggest drop in the sign-up funnel (null when there is too little to say). */
  leak: Leak | null;
}

export interface StallView {
  wizard: { step: number; actors: number }[];
  onboarding: { step: string; label: string; actors: number }[];
  /** Fields the company form refused, with how many people it stopped. */
  refusedFields: { field: string; actors: number }[];
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
        step("signup_viewed", actors(raw, market, "signup_viewed")),
        step("signup_started", actors(raw, market, "signup_started")),
        step("signup_completed", actors(raw, market, "signup_completed")),
        step("email_confirmed", actors(raw, market, "email_confirmed")),
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
    stalls: stallView(raw, market),
    leak: biggestLeak(funnel([
      step("signup_viewed", actors(raw, market, "signup_viewed")),
      step("signup_started", actors(raw, market, "signup_started")),
      step("signup_completed", actors(raw, market, "signup_completed")),
      step("email_confirmed", actors(raw, market, "email_confirmed")),
      step("onboarding_completed", actors(raw, market, "onboarding_completed")),
    ])),
    activity: [
      "pricing_viewed",
      "upgrade_clicked",
      "checkout_failed",
      "writer_started",
      "writer_draft_generated",
      "trial_started",
      "rfp_posted",
      "follow_buyer",
      "claim_started",
      "claim_verified",
      "respond_to_job",
      "quote_request_posted",
      "sealed_opened",
      "award_published",
    ].map((event) => ({ event, n: actors(raw, market, event) })),
  };
}

/** Lines for the Monday admin email (one market). */
export function weeklyLines(v: MarketView): string[] {
  const s = v.funnel.shared;
  const at = (key: string) => s.find((x) => x.key === key);
  const conv = (a: FunnelStep | undefined, b: FunnelStep | undefined) => (a && b && a.n > 0 ? pct(b.n / a.n) : "–");
  const sources = v.signupsByChannel.slice(0, 4).map((c) => `${c.label} ${c.n}`).join(", ") || "none";
  return [
    `Visitors ${v.visitors} · page views ${v.pageViews}`,
    `Sign-ups ${v.signups} by source: ${sources}`,
    `Visit → sign-up ${conv(at("visit"), at("signup_completed"))} · sign-up page → submitted ${conv(at("signup_viewed"), at("signup_started"))} · account → onboarded ${conv(at("signup_completed"), at("onboarding_completed"))} · trade upgrade → paid ${conv(v.funnel.trade[1], v.funnel.trade[3])} · PM writer → posted ${conv(v.funnel.pm[1], v.funnel.pm[2])}`,
  ];
}

export interface Leak {
  from: string;
  to: string;
  fromN: number;
  toN: number;
  /** Share of the step before that reached this one (0 to 1). */
  kept: number;
}

/**
 * The biggest drop between two neighbouring steps. Steps with nobody in
 * them, and any "drop" that isn't one (a later step with MORE people: the
 * steps count browsers before sign-in and accounts after it, so they can
 * disagree by a few), are skipped. Needs at least 5 people on the first
 * step of the pair, so three visitors don't make a verdict.
 */
export function biggestLeak(steps: readonly FunnelStep[], minimum = 5): Leak | null {
  let worst: Leak | null = null;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1];
    const b = steps[i];
    if (a.n < minimum || b.fromPrev == null || b.n > a.n) continue;
    if (!worst || b.fromPrev < worst.kept) worst = { from: a.label, to: b.label, fromN: a.n, toN: b.n, kept: b.fromPrev };
  }
  return worst;
}

export const ONBOARDING_STEP_LABEL: Record<string, string> = {
  role_pick_viewed: "Saw \"what describes you\" (Google)",
  role_picked: "Picked a role",
  form_viewed: "Opened the company form",
  form_error: "Company form refused something",
  org_failed: "Saving the company failed (our side)",
};

function stallView(raw: RawReport, market: Market): StallView {
  const rows = raw.steps.filter((r) => r.market === market);
  const sum = (event: string, key: (r: RawReport["steps"][number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows.filter((x) => x.event === event)) m.set(key(r), (m.get(key(r)) ?? 0) + (Number(r.actors) || 0));
    return m;
  };
  const wizard = [...sum("signup_step", (r) => r.step)]
    .map(([step, actors]) => ({ step: Number(step), actors }))
    .filter((x) => Number.isInteger(x.step) && x.step >= 1 && x.step <= 9)
    .sort((a, b) => a.step - b.step);
  const onboarding = [...sum("onboarding_step", (r) => r.step)]
    .map(([step, actors]) => ({ step, label: ONBOARDING_STEP_LABEL[step] ?? step, actors }))
    .filter((x) => x.step !== "")
    .sort((a, b) => Object.keys(ONBOARDING_STEP_LABEL).indexOf(a.step) - Object.keys(ONBOARDING_STEP_LABEL).indexOf(b.step));
  const refused = [...sum("onboarding_step", (r) => (r.step === "form_error" ? r.field : ""))]
    .filter(([field]) => field !== "")
    .map(([field, actors]) => ({ field, actors }))
    .sort((a, b) => b.actors - a.actors);
  return { wizard, onboarding, refusedFields: refused };
}
