import Link from "@/i18n/link";
import { provinceFirst } from "@/lib/visitor-geo";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { Lock } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { listRfps } from "@/lib/data/rfps";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getT, setLangFrom } from "@/i18n/server";
import type { Metadata } from "next";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.rfps };
}

export default async function RfpFeedPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("dash").rfps;
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  // Country-first: the company's country only, its own province/state first.
  const { country, province } = await getVisitorCountry({ session });
  const rfps = provinceFirst(await listRfps({ country }), province, (r) => r.province);
  const locked = !session.hasTradeAccess && !demo;

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {locked && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50/60 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="size-4 text-teal-600" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{t.lockedTitle}</strong> {t.lockedBody}
            </span>
          </div>
          <Link href="/dashboard/billing" className={buttonVariants()}>
            {t.activate}
          </Link>
        </div>
      )}

      {rfps.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyBody}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rfps.map((rfp) => (
            <RfpCard key={rfp.slug} rfp={rfp} locked={locked} />
          ))}
        </div>
      )}
    </div>
  );
}
