import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { PrintButton } from "@/components/roster/print-button";
import { RosterPrintSheet } from "@/components/roster/print-sheet";
import { rosterBlocked, rosterPm } from "@/components/roster/gate";
import { loadRoster } from "@/lib/roster/server";
import { rosterRows } from "@/lib/roster/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.print.metaTitle, robots: { index: false, follow: false } };
}

/**
 * /pm-dashboard/roster/<id>/print — one building's roster as a single
 * printed page (the dashboard's sidebar and header don't print).
 */
export default async function RosterPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await setLangFrom(params);
  const R = getT("roster");
  const { id } = await params;
  const { session, country } = await rosterPm();
  const blocked = rosterBlocked({ session, header: <PageHeader title={R.print.title} />, t: R.dash });
  if (blocked) return blocked;
  if (!z.uuid().safeParse(id).success) notFound();
  const { ready, roster, entries } = await loadRoster(await createClient(), id);
  const notReady = rosterBlocked({ session, header: <PageHeader title={R.print.title} />, t: R.dash, ready });
  if (notReady) return notReady;
  if (!roster) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/pm-dashboard/roster/${roster.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {R.print.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="max-w-md text-xs text-muted-foreground">{R.print.tip}</span>
          <PrintButton label={R.print.button} />
        </div>
      </div>
      <RosterPrintSheet roster={roster} rows={rosterRows(entries, { country, province: roster.province })} country={country} lang={lang} t={R} printedAt={new Date()} />
    </div>
  );
}
