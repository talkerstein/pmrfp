import type { Metadata } from "next";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner, StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { CHANNEL_LABEL, isChannel, type Channel } from "@/lib/attribution/channel";
import { byWeek, joinSignups, top, type AttributionLite, type SignupUser } from "@/lib/attribution/report";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Sign-ups by source · Admin · PMRFP" };

const DAYS = 90;
const RECENT = 150;
/** The day first-touch attribution went live. Accounts created before it have no source. */
const ATTRIBUTION_START = "October 15, 2026";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const ROLE: Record<string, string> = {
  trade: "Trade",
  supplier: "Supplier",
  property_manager: "Buyer (PM / GC / landlord)",
  real_estate_agent: "Real estate agent",
  visitor: "Visitor",
  talent: "Tradesperson",
  admin: "Admin",
  super_admin: "Admin",
};

interface LandingRow {
  day: string;
  channel: string;
  landing_path: string;
  visits: number;
}

/**
 * Admin: where sign-ups come from. First-touch attribution (lib/attribution)
 * per account for the last 90 days: channel, landing page, referring site
 * and campaign, by week. Accounts without a signup_attribution row (before
 * attribution started, or a browser without the cookie) show as Unknown.
 * Below: new visitors by channel and landing page from the daily counters.
 */
export default async function SignupsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const demo = isDemoMode() || !isServiceConfigured();
  const since = daysAgo(DAYS);

  let users: SignupUser[] = [];
  let rows: AttributionLite[] = [];
  let landings: LandingRow[] = [];
  let missing = false;
  const orgNames = new Map<string, string>();
  if (!demo) {
    const db = createServiceClient();
    const [u, a, l] = await Promise.all([
      db
        .from("users_profile")
        .select("id,created_at,primary_role")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<SignupUser[]>(),
      db
        .from("signup_attribution")
        .select("user_id,org_id,channel,landing_path,referrer_host,utm_source,utm_medium,utm_campaign,last_utm_source,last_utm_campaign,country,lang,method")
        .gte("signed_up_at", daysAgo(DAYS + 2))
        .limit(5000)
        .returns<AttributionLite[]>(),
      db
        .from("landing_counts")
        .select("day,channel,landing_path,visits")
        .gte("day", daysAgo(30).slice(0, 10))
        .limit(10_000)
        .returns<LandingRow[]>(),
    ]);
    users = u.data ?? [];
    rows = a.data ?? [];
    landings = l.data ?? [];
    missing = Boolean(a.error);
  }

  const lines = joinSignups(users, rows);
  const { weeks, channels } = byWeek(lines);
  const recent = lines.slice(0, RECENT);
  const orgIds = [...new Set(recent.map((l) => l.a?.org_id).filter((id): id is string => !!id))];
  if (orgIds.length) {
    const { data } = await createServiceClient().from("organizations").select("id,name").in("id", orgIds).returns<{ id: string; name: string }[]>();
    for (const o of data ?? []) orgNames.set(o.id, o.name);
  }
  const attributed = lines.filter((l) => l.channel !== "unknown");
  const unknown = lines.length - attributed.length;
  const topChannel = top(attributed, (l) => l.channel, 1)[0];
  const topLanding = top(attributed, (l) => l.a?.landing_path);
  const topReferrer = top(attributed, (l) => l.a?.referrer_host);
  const topCampaign = top(attributed, (l) => (l.a?.utm_campaign ? `${l.a.utm_source ?? "?"} / ${l.a.utm_campaign}` : null));

  // New visitors (daily counters), last 30 days.
  const visitsByChannel = new Map<string, number>();
  const visitsByPage = new Map<string, number>();
  for (const r of landings) {
    visitsByChannel.set(r.channel, (visitsByChannel.get(r.channel) ?? 0) + r.visits);
    const k = `${r.channel}\u0001${r.landing_path}`;
    visitsByPage.set(k, (visitsByPage.get(k) ?? 0) + r.visits);
  }
  const visitChannels = [...visitsByChannel.entries()].sort((a, b) => b[1] - a[1]);
  const visitPages = [...visitsByPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const signups30 = new Map<string, number>();
  const cutoff30 = daysAgo(30);
  for (const l of lines) if (l.at >= cutoff30) signups30.set(l.channel, (signups30.get(l.channel) ?? 0) + 1);
  const label = (c: string) => (isChannel(c) ? CHANNEL_LABEL[c] : c);

  return (
    <>
      <PageHeader
        title="Sign-ups by source"
        description={`Where new accounts came from in the last ${DAYS} days: the first page each browser landed on, the referring site (domain only) and campaign tags, classified into a channel. First touch, kept for 90 days in one first-party cookie. No IP addresses, no cross-site tracking.`}
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The signup_attribution table is missing. Run supabase/migrations/20261015000001_signup_attribution.sql.
        </p>
      )}
      <p className="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <strong className="text-foreground">Backfill note:</strong> attribution started on {ATTRIBUTION_START}, but until October 21, 2026 only password
        sign-ups were saved at sign-up (email-link and Google sign-ups waited for onboarding, town sign-ups were never saved). Accounts without a row
        show as <strong>Unknown</strong>, as do sign-ups from browsers that blocked or cleared the cookie or asked not to be tracked. Nothing is guessed
        after the fact. Traffic and the funnel: <Link href="/admin/analytics" className="underline">Site Analytics</Link>.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label={`Sign-ups, ${DAYS} days`} value={lines.length} />
        <StatCard label="With a known source" value={attributed.length} hint={lines.length ? `${Math.round((attributed.length / lines.length) * 100)}%` : undefined} />
        <StatCard label="Unknown" value={unknown} />
        <StatCard label="Top channel" value={topChannel ? label(topChannel.key) : "–"} hint={topChannel ? `${topChannel.n} sign-ups` : undefined} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">By week</h2>
      {weeks.length === 0 ? (
        <EmptyState title="No sign-ups in the last 90 days" description="New accounts show up here as soon as they sign up." />
      ) : (
        <AdminTable columns={["Week of", "Total", ...channels.map((c) => CHANNEL_LABEL[c])]}>
          {weeks.map((w) => (
            <TableRow key={w.week}>
              <TableCell className="font-medium">{w.week}</TableCell>
              <TableCell>{w.total}</TableCell>
              {channels.map((c: Channel) => (
                <TableCell key={c} className={w.byChannel[c] ? "" : "text-muted-foreground"}>
                  {w.byChannel[c] ?? 0}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </AdminTable>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {[
          { title: "Top landing pages", items: topLanding },
          { title: "Top referring sites", items: topReferrer },
          { title: "Top campaigns (source / campaign)", items: topCampaign },
        ].map((b) => (
          <section key={b.title}>
            <h2 className="mb-3 text-lg font-semibold">{b.title}</h2>
            {b.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <AdminTable columns={["", "Sign-ups"]}>
                {b.items.map((i) => (
                  <TableRow key={i.key}>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs">{i.key}</TableCell>
                    <TableCell>{i.n}</TableCell>
                  </TableRow>
                ))}
              </AdminTable>
            )}
          </section>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent sign-ups</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <AdminTable columns={["Signed up", "Account", "Company", "Channel", "Landing page", "Referrer", "Campaign", "Last campaign", "Country"]}>
          {recent.map((l) => (
            <TableRow key={l.userId}>
              <TableCell className="whitespace-nowrap">{l.at.slice(0, 10)}</TableCell>
              <TableCell>{ROLE[l.role ?? ""] ?? l.role ?? "–"}{l.a?.method === "google" ? " · Google" : l.a?.method === "magic_link" ? " · email link" : ""}</TableCell>
              <TableCell className="max-w-[180px] truncate">{(l.a?.org_id && orgNames.get(l.a.org_id)) || "–"}</TableCell>
              <TableCell className={l.channel === "unknown" ? "text-muted-foreground" : "font-medium"}>{CHANNEL_LABEL[l.channel]}</TableCell>
              <TableCell className="max-w-[220px] truncate font-mono text-xs">{l.a?.landing_path ?? "–"}</TableCell>
              <TableCell className="max-w-[160px] truncate">{l.a?.referrer_host ?? "–"}</TableCell>
              <TableCell className="max-w-[180px] truncate text-xs">
                {l.a?.utm_source || l.a?.utm_campaign ? [l.a.utm_source, l.a.utm_medium, l.a.utm_campaign].filter(Boolean).join(" / ") : "–"}
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-xs">
                {l.a?.last_utm_source || l.a?.last_utm_campaign ? [l.a.last_utm_source, l.a.last_utm_campaign].filter(Boolean).join(" / ") : "–"}
              </TableCell>
              <TableCell>{l.a?.country ?? "–"}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}

      <h2 className="mb-1 mt-10 text-lg font-semibold">New visitors, last 30 days</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        First visits by channel and landing page, from daily aggregate counters (no per-visitor data). Approximate: counted in memory and written in batches.
      </p>
      {visitChannels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No counts yet. They appear a few minutes after the migration runs and the first new visitors arrive.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminTable columns={["Channel", "New visitors", "Sign-ups", "Rate"]}>
            {visitChannels.map(([c, n]) => {
              const s = signups30.get(c) ?? 0;
              return (
                <TableRow key={c}>
                  <TableCell className="font-medium">{label(c)}</TableCell>
                  <TableCell>{n}</TableCell>
                  <TableCell>{s}</TableCell>
                  <TableCell>{n ? `${((s / n) * 100).toFixed(1)}%` : "–"}</TableCell>
                </TableRow>
              );
            })}
          </AdminTable>
          <AdminTable columns={["Landing page", "Channel", "New visitors"]}>
            {visitPages.map(([k, n]) => {
              const [c, path] = k.split("\u0001");
              return (
                <TableRow key={k}>
                  <TableCell className="max-w-[260px] truncate font-mono text-xs">{path || "/"}</TableCell>
                  <TableCell>{label(c)}</TableCell>
                  <TableCell>{n}</TableCell>
                </TableRow>
              );
            })}
          </AdminTable>
        </div>
      )}
    </>
  );
}
