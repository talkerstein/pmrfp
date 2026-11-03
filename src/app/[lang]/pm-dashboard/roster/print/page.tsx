import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { PrintButton } from "@/components/roster/print-button";
import { RosterPrintSheet } from "@/components/roster/print-sheet";
import { rosterBlocked, rosterPm } from "@/components/roster/gate";
import { loadRosters } from "@/lib/roster/server";
import { rosterRows } from "@/lib/roster/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.print.metaTitle, robots: { index: false, follow: false } };
}

/** /pm-dashboard/roster/print — every building, one printed page each. */
export default async function RosterPrintAllPage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const R = getT("roster");
  const { session, country } = await rosterPm();
  const header = <PageHeader title={R.print.title} />;
  const blocked = rosterBlocked({ session, header, t: R.dash });
  if (blocked || !session.organization) return blocked;
  const { ready, rosters, entries } = await loadRosters(await createClient(), session.organization.id);
  const notReady = rosterBlocked({ session, header, t: R.dash, ready });
  if (notReady) return notReady;
  const now = new Date();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/pm-dashboard/roster" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {R.print.back}
        </Link>
        {rosters.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="max-w-md text-xs text-muted-foreground">{R.print.tip}</span>
            <PrintButton label={R.print.button} />
          </div>
        )}
      </div>
      {rosters.length === 0 ? (
        <EmptyState title={R.print.empty} description={R.dash.emptyBody} />
      ) : (
        rosters.map((r) => (
          <RosterPrintSheet
            key={r.id}
            roster={r}
            rows={rosterRows(
              entries.filter((e) => e.roster_id === r.id),
              { country, province: r.province },
            )}
            country={country}
            lang={lang}
            t={R}
            printedAt={now}
          />
        ))
      )}
    </div>
  );
}
