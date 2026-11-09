import { ArrowUpRight } from "lucide-react";
import { WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { isWidgetLang, outLink, reportQuotesLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";

// One cached page per language × company handle (nothing on it changes).
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

/**
 * "Get repair quotes from local trades": a button card for a home
 * inspector's or agent's website. It opens the public Report → Quotes page
 * with the owner's company handle as `ref` (analytics only, no referral
 * payments). No database read: the handle is only passed along.
 */
export default async function ReportQuotesWidget({ params }: { params: Promise<{ lang: string; ref: string }> }) {
  const { lang, ref } = await params;
  if (!isWidgetLang(lang)) return <WidgetUnavailable href={outLink(SITE.url, "/inspection-report-to-quotes", "report-quotes")} />;
  const r = getDictionary(lang).reportQuotes;
  const w = r.widget;
  const href = reportQuotesLink(SITE.url, ref, lang, "embed");

  return (
    <WidgetShell
      kind="report-quotes"
      lang={lang === "en" ? undefined : `${lang}-CA`}
      eyebrow={w.eyebrow}
      title={w.button}
      homeHref={SITE.url}
      footerLinks={[{ href, label: r.name }]}
      list={false}
    >
      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground">{w.body}</p>
        <a
          suppressHydrationWarning
          href={href}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {w.cta} <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </WidgetShell>
  );
}
