import type { Metadata } from "next";
import { isDemoMode } from "@/lib/access/access";
import { SummarySheet } from "@/components/report-quotes/summary-sheet";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { buildSummary } from "@/lib/report-quotes/summary";
import { loadBranding, loadSummaryParts, resolveSummaryShare } from "@/lib/report-quotes/summary-server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { tradeName } from "@/i18n/terms";

// Every open is checked against the current link (and counted): never cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").reportQuotes.summary.metaTitle,
    robots: { index: false, follow: false, nocache: true },
    // The token is in the path: never send it on to another site.
    referrer: "no-referrer",
  };
}

/**
 * /repair-summary/[token] — the read-only Repair Cost Summary someone shared.
 * Only a token whose hash is the summary's current one opens it; a link that
 * was turned off or replaced shows a plain "no longer active" page. Never
 * shows emails, files, notes, or the street address unless the owner opted in.
 */
export default async function SharedRepairSummaryPage({ params }: { params: Promise<{ token: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const s = getT("reportQuotes").summary;
  const { token } = await params;
  const admin = !isDemoMode() && isServiceConfigured() ? createServiceClient() : null;
  const shared = admin ? await resolveSummaryShare(admin, token) : ({ state: "closed" } as const);

  if (!admin || shared.state !== "open") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-neutral-100 px-4 py-16">
        <div className="max-w-md rounded-2xl border border-border bg-white p-8 text-center">
          <h1 className="text-xl font-semibold">{s.shared.closedTitle}</h1>
          <p className="mt-2 text-sm text-neutral-600">{s.shared.closedBody}</p>
          <p className="mt-6 text-[11px] text-neutral-400">{s.footer}</p>
        </div>
      </main>
    );
  }

  const { report, includeAddress, preparedBy } = shared;
  const [parts, branding, categories] = await Promise.all([
    loadSummaryParts(admin, report),
    loadBranding(admin, preparedBy, report.organization_id),
    getCategories(),
  ]);
  const summary = buildSummary({ report, ...parts, includeAddress, fallbackTitle: getT("reportQuotes").reportTypes[report.report_type] });
  const tradeNames = Object.fromEntries(categories.map((c) => [c.slug, tradeName(c.name, lang)]));

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 sm:py-12 print:bg-white print:p-0">
      <SummarySheet summary={summary} branding={branding} tradeNames={tradeNames} />
    </main>
  );
}
