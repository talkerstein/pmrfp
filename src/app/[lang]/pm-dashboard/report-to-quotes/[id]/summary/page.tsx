import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { SummarySheet } from "@/components/report-quotes/summary-sheet";
import { GroupLinks, SummaryControls, type GroupLink } from "@/components/report-quotes/summary-controls";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { buildSummary } from "@/lib/report-quotes/summary";
import {
  SUMMARY_REPORT_COLUMNS,
  loadBranding,
  loadLinkCandidates,
  loadLinks,
  loadSummaryParts,
  loadSummarySettings,
  type SummaryReportRow,
} from "@/lib/report-quotes/summary-server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").reportQuotes.summary.metaTitle, robots: { index: false, follow: false } };
}

const DASH = "/pm-dashboard/report-to-quotes";

/**
 * /pm-dashboard/report-to-quotes/[id]/summary — the Repair Cost Summary for
 * one report, with the owner's controls (print, share link, address opt-in,
 * linking each trade group to its RFP). The report is read through the
 * user's own client first, so another company's report is a 404; only then
 * does the service role read the quotes trades sent on the linked RFPs.
 */
export default async function ReportSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const r = getT("reportQuotes");
  const s = r.summary;
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  if (isDemoMode() || !session.organization) redirect(localizePath(DASH, lang));
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createClient();
  const { data: report } = await db.from("quote_reports").select(SUMMARY_REPORT_COLUMNS).eq("id", id).maybeSingle<SummaryReportRow>();
  if (!report) notFound();

  const back = (
    <Link href={`${DASH}/${report.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {s.back}
    </Link>
  );
  if (!isServiceConfigured()) {
    return (
      <div className="space-y-4">
        {back}
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{s.controls.notReady}</p>
      </div>
    );
  }

  const admin = createServiceClient();
  const [parts, settings, branding, categories, links, candidates] = await Promise.all([
    loadSummaryParts(admin, report),
    loadSummarySettings(admin, report.id),
    loadBranding(admin, session.userId, report.organization_id),
    getCategories(),
    loadLinks(db, report.id),
    loadLinkCandidates(db, session.organization.id),
  ]);
  const summary = buildSummary({ report, ...parts, includeAddress: settings.includeAddress, fallbackTitle: r.reportTypes[report.report_type] });
  const tradeNames = Object.fromEntries(categories.map((c) => [c.slug, tradeName(c.name, lang)]));

  // Titles of linked RFPs older than the 50 recent ones offered for linking.
  const titles = new Map(candidates.map((c) => [c.id, c.title]));
  const missing = [...new Set(links.map((l) => l.rfp_id))].filter((rid) => !titles.has(rid));
  if (missing.length) {
    const { data } = await db.from("rfp_posts").select("id,title").in("id", missing);
    for (const row of (data ?? []) as { id: string; title: string }[]) titles.set(row.id, row.title);
  }

  const groupExtra = (g: { tradeSlug: string | null }) => {
    if (!g.tradeSlug || !settings.ready) return null;
    const slug = g.tradeSlug;
    const linked: GroupLink[] = links
      .filter((l) => l.trade_slug === slug && titles.has(l.rfp_id))
      .map((l) => ({ linkId: l.id, rfpId: l.rfp_id, title: titles.get(l.rfp_id)! }));
    const taken = new Set(linked.map((l) => l.rfpId));
    // This trade's RFPs first, then the rest of the company's recent ones.
    const offer = candidates
      .filter((c) => !taken.has(c.id) && c.status !== "rejected")
      .sort((a, b) => Number(b.tradeSlugs.includes(slug)) - Number(a.tradeSlugs.includes(slug)))
      .map((c) => ({ id: c.id, title: c.title }));
    return <GroupLinks reportId={report.id} tradeSlug={slug} linked={linked} candidates={offer} s={s.controls} />;
  };

  return (
    <div>
      <div className="mx-auto mb-4 max-w-3xl print:hidden">{back}</div>
      {settings.ready ? (
        <SummaryControls
          reportId={report.id}
          sharePrefix={localizePath("/repair-summary", lang)}
          includeAddress={settings.includeAddress}
          shareSince={settings.shareCreatedAt ? formatDate(settings.shareCreatedAt, lang) : null}
          openCount={settings.openCount}
          attachHint={s.attach[report.country]}
          s={s.controls}
        />
      ) : (
        <p className="mx-auto mb-6 max-w-3xl rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground print:hidden">{s.controls.notReady}</p>
      )}
      <SummarySheet summary={summary} branding={branding} tradeNames={tradeNames} groupExtra={groupExtra} />
    </div>
  );
}
