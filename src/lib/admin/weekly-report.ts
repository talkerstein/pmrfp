/**
 * The Monday numbers email: who signed up, who paid, who left, what moved.
 * Pure summary over rows the cron route fetches — kept separate so it can be
 * tested without a database.
 */

export interface ReportInput {
  now: Date;
  users: { email: string; primary_role: string; created_at: string }[];
  subscriptions: {
    status: string;
    amount: number | null;
    stripe_price_id: string | null;
    created_at: string;
    updated_at: string;
    cancel_at_period_end: boolean;
    orgName: string | null;
  }[];
  /** RFPs posted by property managers (not imported tenders). */
  pmRfps: { title: string; slug: string; created_at: string }[];
  /** Imported public tenders this week — counted in SQL (can exceed the 1,000-row API cap). */
  tenders: { total: number; us: number };
  interests: number;
  interestsPrev: number;
  contactRequests: number;
  monthlyPriceIds: string[];
}

const DAY = 86_400_000;
const PAID = new Set(["active", "trialing", "past_due"]);

export const ROLE_LABEL: Record<string, string> = {
  trade: "Trades",
  supplier: "Suppliers",
  property_manager: "Property managers",
  real_estate_agent: "Real estate agents",
  visitor: "Browsing only",
  admin: "Admins",
  super_admin: "Admins",
};

export function buildWeeklyReport(input: ReportInput) {
  const end = input.now.getTime();
  const weekAgo = end - 7 * DAY;
  const twoWeeksAgo = end - 14 * DAY;
  const inWeek = (iso: string) => Date.parse(iso) >= weekAgo;
  const inPrevWeek = (iso: string) => Date.parse(iso) >= twoWeeksAgo && Date.parse(iso) < weekAgo;

  const signups = input.users.filter((u) => inWeek(u.created_at));
  const signupsPrev = input.users.filter((u) => inPrevWeek(u.created_at)).length;
  const byRole = new Map<string, number>();
  for (const u of signups) {
    const label = ROLE_LABEL[u.primary_role] ?? u.primary_role;
    byRole.set(label, (byRole.get(label) ?? 0) + 1);
  }

  const monthly = new Set(input.monthlyPriceIds.filter(Boolean));
  const paying = input.subscriptions.filter((s) => PAID.has(s.status) && (s.amount ?? 0) > 0);
  const mrr = paying.reduce(
    (sum, s) => sum + (s.stripe_price_id && monthly.has(s.stripe_price_id) ? s.amount ?? 0 : (s.amount ?? 0) / 12),
    0,
  );
  const newPaid = paying.filter((s) => inWeek(s.created_at));
  // Cancellations: fully canceled this week, or set to cancel at period end.
  const churned = input.subscriptions.filter(
    (s) => inWeek(s.updated_at) && (s.status === "canceled" || (s.cancel_at_period_end && PAID.has(s.status))),
  );
  const comped = input.subscriptions.filter((s) => s.status === "comped").length;

  const pmRfps = input.pmRfps.filter((r) => inWeek(r.created_at));

  return {
    period: { from: new Date(weekAgo).toISOString().slice(0, 10), to: input.now.toISOString().slice(0, 10) },
    signups: {
      count: signups.length,
      prev: signupsPrev,
      byRole: [...byRole].sort((a, b) => b[1] - a[1]),
      latest: [...signups].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25),
    },
    revenue: {
      payingCount: paying.length,
      comped,
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      newPaid: newPaid.map((s) => ({ org: s.orgName, amount: s.amount, monthly: !!s.stripe_price_id && monthly.has(s.stripe_price_id) })),
      churned: churned.map((s) => ({ org: s.orgName, status: s.status })),
    },
    activity: {
      pmRfps: pmRfps.map((r) => ({ title: r.title, slug: r.slug })),
      tendersImported: input.tenders.total,
      usTendersImported: input.tenders.us,
      interests: input.interests,
      interestsPrev: input.interestsPrev,
      contactRequests: input.contactRequests,
    },
  };
}

export type WeeklyReport = ReturnType<typeof buildWeeklyReport>;

/** "12 (+4)" / "3 (−2)" / "5 (same)". */
export function withDelta(now: number, prev: number): string {
  const d = now - prev;
  return `${now} (${d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "same"} vs last week)`;
}
