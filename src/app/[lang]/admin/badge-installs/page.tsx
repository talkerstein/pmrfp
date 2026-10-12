import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { setLangFrom } from "@/i18n/server";

export const metadata: Metadata = { title: "Badge installs · Admin · PMRFP" };

type SP = Promise<Record<string, string | undefined>>;

interface HitRow {
  day: string;
  kind: "listed" | "winner" | "karma";
  slug: string;
  referrer: string;
  hits: number;
}

interface Install {
  referrer: string;
  kind: HitRow["kind"];
  slug: string;
  hits: number;
  first: string;
  last: string;
}

const KIND: Record<HitRow["kind"], string> = { listed: "Directory", winner: "Contract winner", karma: "Reputation" };
/** YYYY-MM-DD, `days` ago. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const pageOf = (kind: HitRow["kind"], slug: string) => (kind === "winner" ? `/contract-winners/${slug}` : `/directory/${slug}`);

/**
 * Admin: where PMRFP badges are embedded. One row per website × badge, from
 * the daily counters (lib/badge/hits → badge_hits). "(no referrer)" is loads
 * where the browser didn't say which site (emails, strict privacy settings).
 */
export default async function BadgeInstallsPage({ params, searchParams }: { params: Promise<object>; searchParams: SP }) {
  await setLangFrom(params);
  await requireRole(["admin", "super_admin"]);
  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30;
  const demo = isDemoMode() || !isServiceConfigured();
  const since = daysAgo(days);

  let rows: HitRow[] = [];
  let missing = false;
  if (!demo) {
    const { data, error } = await createServiceClient()
      .from("badge_hits")
      .select("day,kind,slug,referrer,hits")
      .gte("day", since)
      .order("day", { ascending: false })
      .limit(10_000)
      .returns<HitRow[]>();
    missing = Boolean(error);
    rows = data ?? [];
  }

  const byKey = new Map<string, Install>();
  for (const r of rows) {
    const k = `${r.referrer}|${r.kind}|${r.slug}`;
    const cur = byKey.get(k) ?? { referrer: r.referrer, kind: r.kind, slug: r.slug, hits: 0, first: r.day, last: r.day };
    cur.hits += r.hits;
    if (r.day < cur.first) cur.first = r.day;
    if (r.day > cur.last) cur.last = r.day;
    byKey.set(k, cur);
  }
  const installs = [...byKey.values()].sort((a, b) => Number(!a.referrer) - Number(!b.referrer) || b.hits - a.hits);
  const sites = new Set(installs.filter((i) => i.referrer).map((i) => i.referrer)).size;
  const total = installs.reduce((s, i) => s + i.hits, 0);

  return (
    <>
      <PageHeader
        title="Badge installs"
        description={`Websites showing a PMRFP badge in the last ${days} days: ${sites} site${sites === 1 ? "" : "s"}, ${total} image loads. Counted per browser per day (badges are cached for a day), by the embedding site's domain only.`}
      />
      {demo && <DemoBanner />}
      {missing && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The badge_hits table is missing. Run supabase/migrations/20261013000010_growth_pack.sql.
        </p>
      )}
      <p className="mb-4 flex gap-3 text-sm">
        {[7, 30, 90].map((d) => (
          <a key={d} href={`?days=${d}`} className={d === days ? "font-semibold underline" : "text-muted-foreground hover:underline"}>
            {d} days
          </a>
        ))}
      </p>
      {installs.length === 0 ? (
        <EmptyState title="No badge loads yet" description="Once a company pastes a badge on its site, the site shows up here within a few minutes of its first visitor." />
      ) : (
        <AdminTable columns={["Website", "Badge", "Company page", "Loads", "First seen", "Last seen"]}>
          {installs.map((i) => (
            <TableRow key={`${i.referrer}|${i.kind}|${i.slug}`}>
              <TableCell className="font-medium">
                {i.referrer ? (
                  <a href={`https://${i.referrer}`} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">{i.referrer}</a>
                ) : (
                  <span className="text-muted-foreground">(no referrer)</span>
                )}
              </TableCell>
              <TableCell>{KIND[i.kind]}</TableCell>
              <TableCell><a href={pageOf(i.kind, i.slug)} className="hover:underline">{i.slug}</a></TableCell>
              <TableCell>{i.hits}</TableCell>
              <TableCell>{i.first}</TableCell>
              <TableCell>{i.last}</TableCell>
            </TableRow>
          ))}
        </AdminTable>
      )}
    </>
  );
}
