import type { Urgency } from "@/lib/report-quotes/rules";
import { summaryCurrency, type GroupStatus, type Summary, type SummaryGroup, type SummaryQuote } from "@/lib/report-quotes/summary";
import type { Branding } from "@/lib/report-quotes/summary-server";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

const URGENCY_CHIP: Record<Urgency, string> = {
  safety: "border-red-200 bg-red-50 text-red-700",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  monitor: "border-slate-200 bg-slate-100 text-slate-700",
};

const STATUS_CHIP: Record<GroupStatus["kind"], string> = {
  notRequested: "border-slate-200 bg-slate-50 text-slate-600",
  requested: "border-sky-200 bg-sky-50 text-sky-800",
  quotes: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * The Repair Cost Summary sheet: the owner's page and the read-only share
 * page render the same thing, and it prints cleanly (browser print). Only
 * what buildSummary kept: no contact details, files, notes or estimates.
 * `groupExtra` lets the owner's page add its controls under each group
 * (hidden in print); the share page passes nothing.
 */
export function SummarySheet({
  summary,
  branding,
  tradeNames,
  groupExtra,
}: {
  summary: Summary;
  branding: Branding;
  /** Trade slug → name in the page language. */
  tradeNames: Readonly<Record<string, string>>;
  groupExtra?: (group: SummaryGroup) => React.ReactNode;
}) {
  const lang = getLang();
  const r = getT("reportQuotes");
  const s = r.summary;
  const currency = summaryCurrency(summary.country);
  const day = (d: string) => formatDate(d, lang, { month: "long", day: "numeric", year: "numeric" });
  const money = (n: number) => formatNumber(n, lang, { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
  const preparer = [branding.name, branding.company].filter(Boolean);

  return (
    <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 text-[15px] leading-relaxed text-neutral-900 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
      <style>{`@media print { @page { margin: 16mm; } body { background: #fff !important; } .rcs-group { break-inside: avoid; } }`}</style>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.title}</p>
          <h1 className="mt-1 break-words text-2xl font-bold leading-tight">{summary.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">{fmt(s.reportLine, { type: r.reportTypes[summary.reportType], date: day(summary.reportDate) })}</p>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {summary.area && (
              <>
                <dt className="font-semibold">{s.areaLabel}</dt>
                <dd>{summary.area}</dd>
              </>
            )}
            {summary.address && (
              <>
                <dt className="font-semibold">{s.addressLabel}</dt>
                <dd>{summary.address}</dd>
              </>
            )}
          </dl>
        </div>
        {(branding.logoUrl || preparer.length > 0) && (
          <div className="flex max-w-[220px] flex-col items-end gap-2 text-right">
            {branding.logoUrl && (
              // The preparer's own company logo (an https URL from their profile).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.company} referrerPolicy="no-referrer" className="max-h-16 max-w-[180px] object-contain" />
            )}
            {preparer.length > 0 && (
              <p className="text-sm leading-snug text-neutral-700">
                {branding.name ? fmt(s.preparedBy, { name: branding.name }) : null}
                {branding.name && branding.company ? <br /> : null}
                {branding.company}
              </p>
            )}
          </div>
        )}
      </header>

      <p className="mt-4 text-sm font-medium text-neutral-700">
        {plural(summary.itemCount, s.itemsCount)} · {plural(summary.quoteCount, s.quotesCount)}
      </p>

      {summary.groups.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">{s.empty}</p>
      ) : (
        <div className="mt-2">
          {summary.groups.map((g) => (
            <section key={g.tradeSlug ?? "unassigned"} className="rcs-group border-b border-neutral-200 py-5 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{g.tradeSlug ? tradeNames[g.tradeSlug] ?? g.tradeSlug : r.unassigned}</h2>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[g.status.kind]}`}>{statusText(g.status, s.status, day)}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {g.items.map((i, n) => (
                  <li key={n} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${URGENCY_CHIP[i.urgency]}`}>{r.urgency[i.urgency]}</span>
                    <span>
                      {i.item}
                      {i.location ? <span className="text-neutral-500"> ({i.location})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {g.quotes.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.quotesHeading}</h3>
                  <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                    {g.quotes.map((q, n) => (
                      <QuoteRow key={`${q.rfpId}-${n}`} q={q} money={money} day={day} s={s} />
                    ))}
                  </ul>
                </div>
              )}
              {groupExtra?.(g)}
            </section>
          ))}
        </div>
      )}

      <footer className="mt-8 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-600">
        <p className="font-semibold text-neutral-700">{s.disclaimerTitle}</p>
        <ul className="mt-1 space-y-0.5">
          {s.disclaimer.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-neutral-400">{s.footer}</p>
      </footer>
    </article>
  );
}

function statusText(status: GroupStatus, t: { notRequested: string; requested: string; quotes: { one: string; other: string } }, day: (d: string) => string): string {
  switch (status.kind) {
    case "notRequested":
      return t.notRequested;
    case "requested":
      return fmt(t.requested, { date: day(status.on) });
    case "quotes":
      return plural(status.count, t.quotes);
  }
}

function QuoteRow({
  q,
  money,
  day,
  s,
}: {
  q: SummaryQuote;
  money: (n: number) => string;
  day: (d: string) => string;
  s: { kind: { firm: string; estimate: string }; noAmount: string; canStart: string; received: string; insurance: string };
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{q.tradeName}</p>
        <p className="text-xs text-neutral-500">
          {[fmt(s.received, { date: day(q.receivedAt) }), q.startDate ? fmt(s.canStart, { date: day(`${q.startDate.slice(0, 10)}T12:00:00Z`) }) : null].filter(Boolean).join(" · ")}
        </p>
        {q.insuranceUploadedAt && <p className="text-xs text-neutral-600">{fmt(s.insurance, { date: day(q.insuranceUploadedAt) })}</p>}
      </div>
      <p className="shrink-0 text-right">
        {q.amount !== null ? (
          <>
            <span className="font-semibold tabular-nums">{money(q.amount)}</span>
            {q.kind && <span className="ml-1.5 text-xs text-neutral-500">{s.kind[q.kind]}</span>}
          </>
        ) : (
          <span className="text-xs text-neutral-500">{s.noAmount}</span>
        )}
      </p>
    </li>
  );
}
