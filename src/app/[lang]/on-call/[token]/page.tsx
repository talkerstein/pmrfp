import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, Unlink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmergencyCard } from "@/components/roster/emergency-card";
import { getSharedRoster } from "@/lib/roster/server";
import { lastUpdated, rosterRows } from "@/lib/roster/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").roster.card.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * /on-call/<token> — a building's emergency card through a PM's share link:
 * read-only, no account, outside the site chrome so it loads fast on a
 * phone. The link is the credential (unguessable, revocable); a turned-off
 * link or a suspended company shows nothing but "this link is off". Ends on
 * PMRFP: anyone who manages buildings can keep their own roster free.
 */
export default async function SharedRosterPage({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const lang = await setLangFrom(params);
  const R = getT("roster");
  const { token } = await params;
  const shared = await getSharedRoster(token, { countView: true });

  if (!shared) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16" data-page="roster-share">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Unlink className="size-5" /> {R.share.brokenTitle}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">{R.share.brokenBody}</p>
      </main>
    );
  }

  return (
    <main className="px-4 py-8" data-page="roster-share">
      <EmergencyCard
        roster={shared.roster}
        rows={rosterRows(shared.entries, { country: shared.country, province: shared.roster.province })}
        country={shared.country}
        lang={lang}
        t={R}
        updatedAt={lastUpdated(shared.roster, shared.entries)}
        vcardHref={`/api/roster/vcard?t=${encodeURIComponent(token)}&lang=${lang}`}
        sharedBy={shared.company}
      />
      <aside className="mx-auto mt-8 max-w-xl rounded-xl border border-teal-200 bg-teal-50/60 p-4 print:hidden">
        <h2 className="text-sm font-semibold">{R.share.promoTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{R.share.promoBody}</p>
        <Link href="/after-hours-vendor-roster" className={`${buttonVariants({ size: "sm" })} mt-3`}>
          {R.share.promoCta} <ArrowRight className="size-3.5" />
        </Link>
      </aside>
    </main>
  );
}
