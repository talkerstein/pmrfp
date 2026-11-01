import Link from "@/i18n/link";
import { ArrowLeft } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import { fmt, formatDate } from "@/i18n/format";
import type { BidCountry } from "@/lib/bid-compare/rules";
import type { ComparisonRow, SheetView } from "@/lib/bid-compare/view";
import { SheetGrid, SheetSummary } from "./sheet-grid";
import { PrintButton } from "./print-button";

/**
 * The board view (the owner's print view and the read-only share link):
 * the PM company's name, the date, the sheet and the recommendation. No
 * PMRFP chrome apart from a small "Prepared with PMRFP" footer. Prints on
 * landscape pages.
 */
export function BoardSheet({
  company,
  comparison: c,
  view,
  country,
  lang,
  m,
  backHref,
}: {
  company: string;
  comparison: ComparisonRow;
  view: SheetView;
  country: BidCountry;
  lang: Locale;
  m: Messages["bidCompare"];
  backHref?: string;
}) {
  const b = m.board;
  const recommended = c.recommended_bid_id ? view.bids.find((x) => x.id === c.recommended_bid_id) : null;
  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-white px-4 py-8 text-slate-900 print:max-w-none print:p-0">
      <style>{"@page { size: landscape; margin: 12mm; } @media print { html, body { background: #fff !important; } }"}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {backHref ? (
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" /> {b.back}
          </Link>
        ) : (
          <span />
        )}
        <PrintButton label={b.print} />
      </div>

      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{b.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight print:text-xl">{c.title}</h1>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {company && (
            <div>
              <dt className="sr-only">{b.preparedBy}</dt>
              <dd className="font-medium">{fmt(b.preparedBy, { company })}</dd>
            </div>
          )}
          {c.building_name && (
            <div className="flex gap-1">
              <dt className="text-slate-500">{b.building}:</dt>
              <dd>{[c.building_name, c.building_address].filter(Boolean).join(", ")}</dd>
            </div>
          )}
          {c.trade && (
            <div className="flex gap-1">
              <dt className="text-slate-500">{b.trade}:</dt>
              <dd>{c.trade}</dd>
            </div>
          )}
          <div>
            <dt className="sr-only">{b.date}</dt>
            <dd className="text-slate-500">{fmt(b.date, { date: formatDate(new Date(), lang, { month: "long", day: "numeric", year: "numeric" }) })}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <SheetSummary view={view} country={country} lang={lang} t={m.sheet} />
      </div>

      <div className="mt-4">
        {view.bids.length ? (
          <SheetGrid view={view} country={country} lang={lang} t={m.sheet} recommendedId={c.recommended_bid_id} awardedId={c.awarded_bid_id} board />
        ) : (
          <p className="text-sm text-slate-500">{b.noBids}</p>
        )}
      </div>

      {(recommended || c.recommendation) && (
        <section className="mt-6 break-inside-avoid rounded-lg border border-slate-200 p-4 print:rounded-none">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{b.recommendation}</h2>
          {recommended && <p className="mt-1 text-base font-semibold">{fmt(b.recommended, { company: recommended.company })}</p>}
          {c.recommendation && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.recommendation}</p>}
        </section>
      )}
      {c.awarded_at && c.awarded_company && (
        <p className="mt-4 text-sm font-medium">{fmt(b.awarded, { company: c.awarded_company, date: formatDate(c.awarded_at, lang) })}</p>
      )}

      <footer className="mt-10 text-center text-[10px] text-slate-400">{b.footer}</footer>
    </main>
  );
}

/** The share link is off, replaced or never existed. */
export function BoardBroken({ m }: { m: Messages["bidCompare"] }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center bg-white px-4 py-16 text-slate-900">
      <h1 className="text-xl font-semibold">{m.board.brokenTitle}</h1>
      <p className="mt-2 text-sm text-slate-600">{m.board.brokenBody}</p>
      <Link href="/" className="mt-6 text-sm font-medium text-teal-700 hover:underline">
        {m.board.goHome}
      </Link>
    </main>
  );
}
