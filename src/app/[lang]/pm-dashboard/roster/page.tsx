import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, FileText, Printer, Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { AddBuildingForm } from "@/components/roster/add-building";
import { rosterBlocked, rosterPm } from "@/components/roster/gate";
import { loadRosters } from "@/lib/roster/server";
import { buildingGaps, provincesFor, rosterRows, rosterSummary } from "@/lib/roster/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.dash.metaTitle };
}

/**
 * /pm-dashboard/roster — the After-Hours Vendor Roster: one roster per
 * building (RLS: the PM company's own), readiness worked out here, the
 * add-building form, and the step onto PMRFP (an on-call RFP).
 */
export default async function RosterListPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const R = getT("roster");
  const t = R.dash;
  const { session, country } = await rosterPm();
  const header = <PageHeader title={t.title} description={t.description[country]} />;
  const blocked = rosterBlocked({ session, header, t });
  if (blocked || !session.organization) return blocked;

  const { ready, rosters, entries } = await loadRosters(await createClient(), session.organization.id);
  const notReady = rosterBlocked({ session, header, t, ready });
  if (notReady) return notReady;

  const buildings = rosters.map((r) => {
    const rows = rosterRows(
      entries.filter((e) => e.roster_id === r.id),
      { country, province: r.province },
    );
    return { roster: r, summary: rosterSummary(rows), gaps: buildingGaps(r) };
  });
  const readyRows = buildings.reduce((n, b) => n + b.summary.ready, 0);
  const openGaps = buildings.reduce((n, b) => n + (b.summary.needed - b.summary.ready) + b.gaps.length, 0);

  return (
    <div>
      {header}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.stats.buildings} value={buildings.length} />
        <StatCard label={t.stats.ready} value={readyRows} />
        <StatCard label={t.stats.gaps} value={openGaps} />
      </div>

      <div className="mt-6">
        <AddBuildingForm country={country} provinces={[...provincesFor(country)]} copy={t.add} errors={R.editor.errors} />
      </div>

      {buildings.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t.emptyTitle} description={t.emptyBody} />
        </div>
      ) : (
        <>
          <div className="mt-6 flex justify-end">
            <Link href="/pm-dashboard/roster/print" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Printer className="size-3.5" /> {t.printAll}
            </Link>
          </div>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {buildings.map(({ roster, summary, gaps }) => {
              const left = summary.needed - summary.ready;
              return (
                <li key={roster.id} className={`rounded-lg border bg-card p-4 ${left || gaps.length ? "border-amber-200" : "border-teal-200"}`}>
                  <Link href={`/pm-dashboard/roster/${roster.id}`} className="text-base font-semibold hover:underline">
                    {roster.building_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{[roster.address, roster.city, roster.province].filter(Boolean).join(", ")}</p>
                  <p className={`mt-2 text-sm font-medium ${left ? "text-amber-800" : "text-teal-800"}`}>
                    {left ? fmt(t.readyOf, { ready: summary.ready, needed: summary.needed }) : t.allReady}
                  </p>
                  {gaps.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {gaps.map((g) => (
                        <span key={g} className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{R.buildingGaps[g]}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/pm-dashboard/roster/${roster.id}`} className={buttonVariants({ size: "sm" })}>
                      {t.open}
                    </Link>
                    <Link href={`/pm-dashboard/roster/${roster.id}/card`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <Siren className="size-3.5" /> {t.card}
                    </Link>
                    <Link href={`/pm-dashboard/roster/${roster.id}/print`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      <Printer className="size-3.5" /> {t.print}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Every tool ends on PMRFP: a gap nobody can fill is an on-call contract to post. */}
      <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6 ${openGaps ? "border-teal-300 bg-teal-50/60" : "border-border bg-card"}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-500 text-indigo">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t.fillTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.fillBody}</p>
          </div>
        </div>
        <Link href="/pm-dashboard/rfps/new" className={buttonVariants({ size: "lg" })}>
          {t.fillCta} <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t.note}</p>
    </div>
  );
}
