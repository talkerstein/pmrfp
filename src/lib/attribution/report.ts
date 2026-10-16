/**
 * /admin/signups numbers, from users_profile rows joined (in memory) to
 * their signup_attribution rows. Pure and unit-tested. An account with no
 * attribution row (created before attribution started, or a browser that
 * blocked the cookie) counts as "unknown".
 */

import { CHANNELS, isChannel, type Channel } from "./channel";
import { torontoDay } from "./cookie";

export interface SignupUser {
  id: string;
  created_at: string;
  primary_role: string | null;
}

export interface AttributionLite {
  user_id: string;
  org_id: string | null;
  channel: string;
  landing_path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  last_utm_source: string | null;
  last_utm_campaign: string | null;
  country: string | null;
  lang: string | null;
  method: string | null;
}

export interface SignupLine {
  userId: string;
  at: string;
  week: string;
  role: string | null;
  channel: Channel;
  a: AttributionLite | null;
}

/** The Monday (YYYY-MM-DD, Toronto) of the week an ISO timestamp falls in. */
export function weekOf(iso: string): string {
  const day = torontoDay(new Date(iso));
  const d = new Date(`${day}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function joinSignups(users: readonly SignupUser[], rows: readonly AttributionLite[]): SignupLine[] {
  const byUser = new Map(rows.map((r) => [r.user_id, r]));
  return users
    .map((u) => {
      const a = byUser.get(u.id) ?? null;
      return {
        userId: u.id,
        at: u.created_at,
        week: weekOf(u.created_at),
        role: u.primary_role,
        channel: a && isChannel(a.channel) ? a.channel : ("unknown" as Channel),
        a,
      };
    })
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

export interface WeekRow {
  week: string;
  total: number;
  byChannel: Partial<Record<Channel, number>>;
}

/** Sign-ups per week (newest first) split by channel, plus the channels that appear (in CHANNELS order). */
export function byWeek(lines: readonly SignupLine[]): { weeks: WeekRow[]; channels: Channel[] } {
  const weeks = new Map<string, WeekRow>();
  const seen = new Set<Channel>();
  for (const l of lines) {
    const w = weeks.get(l.week) ?? { week: l.week, total: 0, byChannel: {} };
    w.total += 1;
    w.byChannel[l.channel] = (w.byChannel[l.channel] ?? 0) + 1;
    weeks.set(l.week, w);
    seen.add(l.channel);
  }
  return {
    weeks: [...weeks.values()].sort((a, b) => (a.week < b.week ? 1 : -1)),
    channels: CHANNELS.filter((c) => seen.has(c)),
  };
}

/** Most common values of a field across attributed sign-ups ("" and null skipped). */
export function top(lines: readonly SignupLine[], pick: (l: SignupLine) => string | null | undefined, limit = 10): { key: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const l of lines) {
    const k = pick(l);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, limit);
}
