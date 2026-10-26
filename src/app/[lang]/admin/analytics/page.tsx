import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { loadSiteReport } from "@/lib/tracking/report-server";
import { EMPTY_REPORT, marketView, pct, type FunnelStep, type MarketView, type RawReport } from "@/lib/tracking/report";
import { clarityId, gaMeasurementId } from "@/lib/tracking/ga";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Site analytics · Admin · PMRFP" };

const RANGES = [7, 30, 90] as const;
const MARKET_NAME = { CA: "Canada", US: "United States", other: "Elsewhere / unknown" } as const;
const METHOD_LABEL: Record<string, string> = { password: "Password", email: "Password", magic_link: "Email link", google: "Google", unknown: "Not recorded" };
const ACTIVITY_LABEL: Record<string, string> = {
  pricing_viewed: "Viewed pricing",
  upgrade_clicked: "Clicked an upgrade link (anyone)",
  checkout_failed: "Checkout could not be created (Stripe)",
  writer_started: "Started the RFP Writer (anyone)",
  writer_draft_generated: "Generated an RFP draft",
  trial_cta_clicked: "Clicked a free-trial button (anyone)",
  trial_started: "Started a Trade Pro trial",
  trial_banner_upgrade_clicked: "Clicked Upgrade in the trial banner",
  missed_bids_card_viewed: "Saw the Bids you may have missed card",
  rfp_posted: "Posted a job (PMs, GCs, towns)",
  follow_buyer: "Followed a buyer or town",
  claim_started: "Submitted a claim",
  claim_verified: "Claim verified",
  respond_to_job: "Responded to a job",
  quote_request_posted: "Quote request posted",
  sealed_opened: "Sealed quote box opened (towns)",
  award_published: "Award published (towns)",
};

/**
 * Admin: first-party traffic and the sign-up funnel (lib/tracking), from
 * one aggregated SQL report (site_analytics_report, cached 5 minutes).
 * Canada and the United States side by side, never mixed. No IPs, no
 * per-person browsing history: visitors are daily hashes.
 */
export default async function AnalyticsPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ days?: string }> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const { days: rawDays } = await searchParams;
  const days = RANGES.find((d) => String(d) === rawDays) ?? 30;
  const demo = isDemoMode() || !isServiceConfigured();

  let report: RawReport & { missing?: boolean } = EMPTY_REPORT;
  let failed = false;
  if (!demo) {
    try {
      report = (await loadSiteReport(days)) ?? report;
    } catch (e) {
      failed = true;
      console.warn("[admin/analytics]", e instanceof Error ? e.message : e);
    }
  }
  const ca = marketView(report, "CA");
  const us = marketView(report, "US");
  const other = marketView(report, "other");
  const ga = gaMeasurementId();
  const clarity = clarityId();

  return (
    <>
      <PageHeader
        title="Site analytics"
        description={`First-party visits, sign-ups and the funnel for the last ${days} days (Toronto days${report.from ? `, ${report.from} to ${report.to}` : ""}). Canada and the U.S. are kept apart. Counts update within a few minutes.`}
        action={
          <div className="flex gap-1 text-sm">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/admin/analytics?days=${d}`}
                className={`rounded-md border px-3 py-1 ${d === days ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}
              >
                {d} days
              </Link>
            ))}
          </div>
        }
      />
      {demo && <DemoBanner />}
      {report.missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The tracking tables are missing. They arrive with supabase/migrations/20261021000200_site_tracking.sql.
        </p>
      )}
      {failed && <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">The report could not be loaded just now. Try again in a minute.</p>}

      <div className="grid gap-8 xl:grid-cols-2">
        <MarketColumn v={ca} />
        <MarketColumn v={us} />
      </div>

      <section className="mt-10">
        <h2 className="mb-2 text-lg font-semibold">{MARKET_NAME.other}</h2>
        <p className="text-sm text-muted-foreground">
          {other.visitors} visitors · {other.pageViews} page views · {other.signups} sign-ups. Visits from other countries, and anything the host couldn&apos;t place.
        </p>
      </section>

      <section className="mt-10 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <h2 className="mb-1 font-semibold text-foreground">How this is measured</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Page views come from our own cookie-free beacon (/api/t). A visitor is a daily hash, so one person on three days counts as three visits. Bots,
            the website widgets and browsers sending Do-Not-Track or Global Privacy Control are not counted.
          </li>
          <li>Sign-ups come from the sign-up record saved with each account (password, email link and Google). Funnel steps count distinct people.</li>
          {report.accounts && (
            <li>
              Accounts created in this period: {report.accounts.total}, of which {report.accounts.without_row} have no sign-up record (created before the
              fix on October 21, 2026, or the write failed).
            </li>
          )}
          <li>
            Google Analytics 4: {ga ? `${ga}, after the visitor accepts the cookie banner` : "off"}. Microsoft Clarity: {clarity ? "on, after consent" : "off (set NEXT_PUBLIC_CLARITY_ID)"}.
            Vercel Web Analytics shows data only when it is switched on for the project in Vercel.
          </li>
        </ul>
        <p className="mt-2">
          Where sign-ups came from, account by account: <Link href="/admin/signups" className="underline">Sign-up Sources</Link>.
        </p>
      </section>
    </>
  );
}

/** Where unfinished sign-ups stopped: the sign-up wizard's steps, then the company form's. */
function Stalls({ stalls }: { stalls: MarketView["stalls"] }) {
  if (!stalls.wizard.length && !stalls.onboarding.length) return null;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {stalls.wizard.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Sign-up form: how far people got</h4>
          <AdminTable columns={["Step", "People"]}>
            {stalls.wizard.map((w) => (
              <TableRow key={w.step}>
                <TableCell>Reached step {w.step}</TableCell>
                <TableCell>{w.actors}</TableCell>
              </TableRow>
            ))}
          </AdminTable>
        </div>
      )}
      {stalls.onboarding.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Company form: where it stopped them</h4>
          <AdminTable columns={["Step", "People"]}>
            {stalls.onboarding.map((o) => (
              <TableRow key={o.step}>
                <TableCell>{o.label}</TableCell>
                <TableCell>{o.actors}</TableCell>
              </TableRow>
            ))}
            {stalls.refusedFields.map((f) => (
              <TableRow key={f.field}>
                <TableCell className="text-muted-foreground">Refused field: {f.field}</TableCell>
                <TableCell>{f.actors}</TableCell>
              </TableRow>
            ))}
          </AdminTable>
        </div>
      )}
    </div>
  );
}

function MarketColumn({ v }: { v: MarketView }) {
  const maxDay = Math.max(1, ...v.daily.map((d) => d.visitors));
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{MARKET_NAME[v.market]}</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Visitors" value={v.visitors} hint="visitor-days" />
        <StatCard label="Page views" value={v.pageViews} />
        <StatCard label="Sign-ups" value={v.signups} />
      </div>

      <h3 className="mb-2 font-semibold">Funnel</h3>
      <FunnelTable steps={v.funnel.shared} />
      {v.leak && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="leak">
          Biggest drop: <strong>{v.leak.from}</strong> to <strong>{v.leak.to}</strong>. {v.leak.toN} of {v.leak.fromN} went on ({pct(v.leak.kept)}).
        </p>
      )}
      <Stalls stalls={v.stalls} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-semibold">Trades</h4>
          <FunnelTable steps={v.funnel.trade} />
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold">Property managers</h4>
          <FunnelTable steps={v.funnel.pm} />
        </div>
      </div>
      <div className="mt-4" data-testid="trial-funnel">
        <h4 className="mb-1 text-sm font-semibold">Free trial</h4>
        <FunnelTable steps={v.funnel.trial} />
        <p className="mt-1 text-xs text-muted-foreground">
          Trial start rate: {trialStartRate(v.funnel.trial)} of the people who clicked a trial button started one (distinct people per step; sign-up can come between the click and the start).
        </p>
      </div>

      <h3 className="mb-2 mt-6 font-semibold">Sign-ups by source</h3>
      {v.signupsByChannel.length === 0 ? (
        <p className="text-sm text-muted-foreground">None in this period.</p>
      ) : (
        <AdminTable columns={["Source", "Sign-ups"]}>
          {v.signupsByChannel.map((c) => (
            <TableRow key={c.channel}>
              <TableCell className="font-medium">{c.label}</TableCell>
              <TableCell>{c.n}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
      {v.signupsByMethod.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          How: {v.signupsByMethod.map((m) => `${METHOD_LABEL[m.method] ?? m.method} ${m.n}`).join(" · ")}
        </p>
      )}

      <h3 className="mb-2 mt-6 font-semibold">Visitors by day</h3>
      {v.daily.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
      ) : (
        <AdminTable columns={["Day", "Visitors", "Page views", ""]}>
          {[...v.daily].reverse().map((d) => (
            <TableRow key={d.day}>
              <TableCell className="whitespace-nowrap">{d.day}</TableCell>
              <TableCell>{d.visitors}</TableCell>
              <TableCell>{d.pageViews}</TableCell>
              <TableCell className="w-1/3">
                <div className="h-2 rounded bg-teal-600/70" style={{ width: `${Math.round((d.visitors / maxDay) * 100)}%` }} aria-hidden />
              </TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">Top pages</h3>
          {v.topPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <AdminTable columns={["Page", "Views"]}>
              {v.topPages.map((p) => (
                <TableRow key={p.path}>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">{p.path}</TableCell>
                  <TableCell>{p.views}</TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Top referring sites</h3>
          {v.topReferrers.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <AdminTable columns={["Site", "Visits"]}>
              {v.topReferrers.map((r) => (
                <TableRow key={r.host}>
                  <TableCell className="max-w-[200px] truncate">{r.host}</TableCell>
                  <TableCell>{r.visits}</TableCell>
                </TableRow>
              ))}
            </AdminTable>
          )}
        </div>
      </div>

      <h3 className="mb-2 mt-6 font-semibold">Other activity</h3>
      <AdminTable columns={["", "People"]}>
        {v.activity.map((a) => (
          <TableRow key={a.event}>
            <TableCell>{ACTIVITY_LABEL[a.event] ?? a.event}</TableCell>
            <TableCell className={a.n ? "" : "text-muted-foreground"}>{a.n}</TableCell>
          </TableRow>
        ))}
      </AdminTable>
    </section>
  );
}

function FunnelTable({ steps }: { steps: FunnelStep[] }) {
  return (
    <AdminTable columns={["Step", "People", "From previous", "From top"]}>
      {steps.map((s, i) => (
        <TableRow key={`${s.key}-${i}`}>
          <TableCell className="font-medium">{s.label}</TableCell>
          <TableCell>{s.n}</TableCell>
          <TableCell>{i === 0 ? "" : pct(s.fromPrev)}</TableCell>
          <TableCell>{pct(s.fromTop)}</TableCell>
        </TableRow>
      ))}
    </AdminTable>
  );
}

/** trial_started / trial_cta_clicked from the trial funnel, or "–" when nobody clicked. */
function trialStartRate(steps: FunnelStep[]): string {
  const clicked = steps.find((s) => s.key === "trial_cta_clicked")?.n ?? 0;
  const started = steps.find((s) => s.key === "trial_started")?.n ?? 0;
  return clicked > 0 ? pct(Math.min(1, started / clicked)) : "–";
}
