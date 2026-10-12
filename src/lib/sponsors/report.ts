/**
 * The monthly sponsor report: impressions and clicks per day, placement,
 * trade and province/state, from the daily counters. Pure, so the admin
 * page and the CSV export agree and both are tested.
 */

export interface CounterRow {
  day: string;
  placement: string;
  trade: string;
  region: string;
  n: number;
}

export interface ReportLine {
  day: string;
  placement: string;
  trade: string;
  region: string;
  impressions: number;
  clicks: number;
}

export interface SponsorReport {
  month: string;
  impressions: number;
  clicks: number;
  /** Clicks ÷ impressions, or null with no impressions. */
  ctr: number | null;
  lines: ReportLine[];
  byPlacement: { placement: string; impressions: number; clicks: number }[];
}

/** "2026-10" → first and last day; anything else → the current Toronto month. */
export function monthRange(month: string | null | undefined, today: string): { month: string; from: string; to: string } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? "") ? (month as string) : today.slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { month: m, from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
}

export function buildReport(month: string, impressions: readonly CounterRow[], clicks: readonly CounterRow[]): SponsorReport {
  const key = (r: CounterRow) => [r.day, r.placement, r.trade, r.region].join("|");
  const lines = new Map<string, ReportLine>();
  const line = (r: CounterRow) => {
    const k = key(r);
    let l = lines.get(k);
    if (!l) lines.set(k, (l = { day: r.day, placement: r.placement, trade: r.trade, region: r.region, impressions: 0, clicks: 0 }));
    return l;
  };
  for (const r of impressions) line(r).impressions += r.n;
  for (const r of clicks) line(r).clicks += r.n;
  const sorted = [...lines.values()].sort((a, b) => a.day.localeCompare(b.day) || a.placement.localeCompare(b.placement) || a.trade.localeCompare(b.trade) || a.region.localeCompare(b.region));
  const byPlacement = new Map<string, { placement: string; impressions: number; clicks: number }>();
  for (const l of sorted) {
    const p = byPlacement.get(l.placement) ?? { placement: l.placement, impressions: 0, clicks: 0 };
    p.impressions += l.impressions;
    p.clicks += l.clicks;
    byPlacement.set(l.placement, p);
  }
  const imp = sorted.reduce((s, l) => s + l.impressions, 0);
  const clk = sorted.reduce((s, l) => s + l.clicks, 0);
  return {
    month,
    impressions: imp,
    clicks: clk,
    ctr: imp > 0 ? clk / imp : null,
    lines: sorted,
    byPlacement: [...byPlacement.values()].sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks),
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote anything with a comma/quote/newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function reportCsv(sponsorName: string, r: SponsorReport): string {
  const rows: (string | number)[][] = [
    ["sponsor", "month", "day", "placement", "trade", "province_state", "impressions", "clicks"],
    ...r.lines.map((l) => [sponsorName, r.month, l.day, l.placement, l.trade, l.region, l.impressions, l.clicks]),
    [sponsorName, r.month, "TOTAL", "", "", "", r.impressions, r.clicks],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
