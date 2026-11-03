import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmergencyCard } from "@/components/roster/emergency-card";
import { rosterBlocked, rosterPm } from "@/components/roster/gate";
import { loadRoster } from "@/lib/roster/server";
import { lastUpdated, rosterRows } from "@/lib/roster/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.card.metaTitle, robots: { index: false, follow: false } };
}

/** /pm-dashboard/roster/<id>/card — the building's emergency card, as the on-call phone sees it. */
export default async function RosterCardPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await setLangFrom(params);
  const R = getT("roster");
  const { id } = await params;
  const { session, country } = await rosterPm();
  const blocked = rosterBlocked({ session, header: <PageHeader title={R.dash.title} />, t: R.dash });
  if (blocked) return blocked;
  if (!z.uuid().safeParse(id).success) notFound();
  const { ready, roster, entries } = await loadRoster(await createClient(), id);
  const notReady = rosterBlocked({ session, header: <PageHeader title={R.dash.title} />, t: R.dash, ready });
  if (notReady) return notReady;
  if (!roster) notFound();

  return (
    <div>
      <Link href={`/pm-dashboard/roster/${roster.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" /> {R.print.back}
      </Link>
      <EmergencyCard
        roster={roster}
        rows={rosterRows(entries, { country, province: roster.province })}
        country={country}
        lang={lang}
        t={R}
        updatedAt={lastUpdated(roster, entries)}
        vcardHref={`/api/roster/vcard?id=${roster.id}&lang=${lang}`}
        editHref={`/pm-dashboard/roster/${roster.id}`}
      />
    </div>
  );
}
