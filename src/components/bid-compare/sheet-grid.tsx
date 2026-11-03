import type { ReactNode } from "react";
import Link from "@/i18n/link";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import { coverageFlagged, type BidCountry, type CoverageState } from "@/lib/bid-compare/rules";
import { formatMoney, type GridBid, type SheetView } from "@/lib/bid-compare/view";

export type SheetCopy = Messages["bidCompare"]["sheet"];

const CHIP: Record<CoverageState, string> = {
  on_file: "border-teal-200 bg-teal-50 text-teal-800",
  expiring: "border-amber-200 bg-amber-50 text-amber-800",
  expired: "border-red-200 bg-red-50 text-red-700",
  profile: "border-slate-200 bg-slate-50 text-slate-700",
  missing: "border-red-200 bg-red-50 text-red-700",
};

/**
 * The side-by-side sheet: one column per bid, the lowest price highlighted,
 * what each bid is above the lowest, tax and the total with tax on their
 * own lines, scope items with "not quoted" flags, terms, and insurance /
 * WSIB (workers' comp in the U.S.) flags. Presentational only (no hooks),
 * so the workspace, the board view and the shared link all render it; the
 * workspace passes its buttons in through fileCell / actionCell.
 */
export function SheetGrid({
  view,
  country,
  lang,
  t,
  recommendedId,
  awardedId,
  board = false,
  fileCell,
  actionCell,
}: {
  view: SheetView;
  country: BidCountry;
  lang: Locale;
  t: SheetCopy;
  recommendedId: string | null;
  awardedId: string | null;
  board?: boolean;
  fileCell?: Record<string, ReactNode>;
  actionCell?: Record<string, ReactNode>;
}) {
  const { bids, items, math } = view;
  const money = (n: number | null) => (n == null ? null : formatMoney(n, country, lang));
  const pct = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 1 });
  const lowest = new Set(math.lowestIds);
  const none = <span className="text-muted-foreground">{t.cell.none}</span>;
  const cellBase = "border-t border-border px-3 py-2.5 align-top print:px-1.5 print:py-1";
  const labelCell = `${cellBase} sticky left-0 z-10 bg-card text-xs font-semibold uppercase tracking-wide text-muted-foreground print:static print:bg-transparent`;
  const col = (b: GridBid) => (b.id === awardedId ? "bg-teal-50/70 print:bg-transparent" : "");

  const row = (label: ReactNode, cell: (b: GridBid) => ReactNode, key: string) => (
    <tr key={key}>
      <th scope="row" className={labelCell}>
        {label}
      </th>
      {bids.map((b) => (
        <td key={b.id} className={`${cellBase} ${col(b)}`}>
          {cell(b)}
        </td>
      ))}
    </tr>
  );

  const coverage = (state: CoverageState, profile: string | null) => (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium print:border-0 print:px-0 ${CHIP[state]}`} data-flagged={coverageFlagged(state) || undefined}>
      {coverageFlagged(state) && <span aria-hidden="true">! </span>}
      {state === "profile" ? fmt(t.coverage.profile, { status: profile ?? "" }) : t.coverage[state]}
    </span>
  );

  const text = (v: string | null) => (v ? <span className="whitespace-pre-line">{v}</span> : none);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card print:overflow-visible print:rounded-none print:border-0">
      <table className={`w-full border-collapse text-sm ${board ? "print:text-[10px]" : ""}`} style={{ minWidth: `${Math.max(2, bids.length) * 11 + 10}rem` }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-40 bg-card px-3 py-3 print:static print:w-28 print:bg-transparent print:px-1.5" />
            {bids.map((b) => (
              <th key={b.id} scope="col" className={`min-w-[11rem] px-3 py-3 text-left align-bottom print:min-w-0 print:px-1.5 ${col(b)}`}>
                <div className="flex flex-wrap gap-1">
                  {lowest.has(b.id) && <Tag tone="teal">{t.cell.lowest}</Tag>}
                  {b.id === recommendedId && <Tag tone="indigo">{t.cell.recommended}</Tag>}
                  {b.id === awardedId && <Tag tone="green">{t.cell.awarded}</Tag>}
                </div>
                <div className="mt-1 text-base font-semibold leading-snug print:text-[11px]">
                  {b.profileSlug && !board ? (
                    <Link href={`/directory/${b.profileSlug}`} className="hover:text-teal-700" target="_blank">
                      {b.company}
                    </Link>
                  ) : (
                    b.company
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-normal text-muted-foreground">
                  {b.onPmrfp && <span>{t.bids.onPmrfp}</span>}
                  {b.fromRfp && !board && <span>{t.bids.fromRfp}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(
            t.rows.price,
            (b) =>
              b.price == null ? (
                none
              ) : (
                <div>
                  <span className={`text-base font-semibold print:text-[11px] ${lowest.has(b.id) ? "rounded bg-teal-100 px-1.5 py-0.5 text-teal-900 print:bg-transparent print:px-0 print:underline" : ""}`}>
                    {money(b.price)}
                  </span>
                  {!lowest.has(b.id) && math.aboveLowest[b.id] && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmt(t.cell.above, { amount: money(math.aboveLowest[b.id]!.amount) ?? "", pct: math.aboveLowest[b.id]!.pct == null ? "—" : pct(math.aboveLowest[b.id]!.pct!) })}
                    </div>
                  )}
                  {math.lineMismatch[b.id] && math.lineSum[b.id] != null && (
                    <div className="mt-0.5 text-xs text-amber-700">{fmt(t.cell.lineSum, { amount: money(math.lineSum[b.id]) ?? "" })}</div>
                  )}
                </div>
              ),
            "price",
          )}
          {row(
            t.rows.tax[country],
            (b) =>
              math.tax[b.id] == null ? (
                none
              ) : (
                <span>
                  {money(math.tax[b.id])}
                  {b.taxAmount == null && b.taxPercent != null && <span className="text-xs text-muted-foreground"> ({fmt(t.cell.taxPct, { pct: pct(b.taxPercent) })})</span>}
                </span>
              ),
            "tax",
          )}
          {row(t.rows.total, (b) => (math.total[b.id] == null ? none : <span className="font-medium">{money(math.total[b.id])}</span>), "total")}

          {items.length > 0 && (
            <tr>
              <th colSpan={bids.length + 1} scope="rowgroup" className="border-t border-border bg-secondary/50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground print:bg-transparent print:px-1.5">
                {t.rows.scope}
              </th>
            </tr>
          )}
          {items.map((it) =>
            row(
              <span className="normal-case tracking-normal text-foreground">{it.label}</span>,
              (b) => {
                const v = b.linePrices[it.id];
                if (v == null)
                  return (
                    <span className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 print:border-0 print:bg-transparent print:px-0" data-flagged>
                      {t.cell.notQuoted}
                    </span>
                  );
                const low = math.items[it.id]?.lowestIds.includes(b.id);
                return <span className={low ? "font-semibold text-teal-800" : ""}>{money(v)}</span>;
              },
              `item-${it.id}`,
            ),
          )}

          {row(t.rows.start, (b) => (b.startDate ? formatDate(b.startDate, lang) : none), "start")}
          {row(t.rows.duration, (b) => text(b.duration), "duration")}
          {row(t.rows.warranty, (b) => text(b.warranty), "warranty")}
          {row(t.rows.terms, (b) => text(b.paymentTerms), "terms")}
          {row(t.rows.notes, (b) => text(b.notes), "notes")}
          {row(t.rows.insurance[country], (b) => coverage(b.insurance, b.insuranceProfile), "insurance")}
          {row(t.rows.wsib[country], (b) => coverage(b.wsib, b.wsibProfile), "wsib")}
          {!board && fileCell && row(t.rows.file, (b) => fileCell[b.id] ?? none, "file")}
          {!board && actionCell && (
            <tr>
              <th scope="row" className={labelCell}>
                <span className="sr-only">{t.bids.edit}</span>
              </th>
              {bids.map((b) => (
                <td key={b.id} className={`${cellBase} ${col(b)}`}>
                  {actionCell[b.id]}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ tone, children }: { tone: "teal" | "indigo" | "green"; children: ReactNode }) {
  const cls = tone === "teal" ? "bg-teal-100 text-teal-900" : tone === "indigo" ? "bg-indigo text-white" : "bg-success/15 text-success";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide print:border print:border-current print:bg-transparent print:text-black ${cls}`}>{children}</span>;
}

/** "3 bids · Lowest before tax: Acme at $48,500 · Spread: 22%" and the before-tax note. */
export function SheetSummary({ view, country, lang, t }: { view: SheetView; country: BidCountry; lang: Locale; t: SheetCopy }) {
  const { math, bids } = view;
  const n = bids.length;
  const bidsText = fmt(n === 1 ? t.summary.bids.one : t.summary.bids.other, { n });
  if (math.priced < 2 || math.lowest == null) {
    return (
      <p className="text-sm text-muted-foreground">
        {bidsText} · {t.summary.needTwo}
      </p>
    );
  }
  const low = math.lowestIds.length === 1 ? bids.find((b) => b.id === math.lowestIds[0]) : null;
  const amount = formatMoney(math.lowest, country, lang);
  return (
    <div className="text-sm">
      <p className="font-medium">
        {bidsText} · {low ? fmt(t.summary.lowest, { company: low.company, amount }) : fmt(t.summary.lowestTie, { amount })}
        {math.spreadPct != null && <> · {fmt(t.summary.spread, { pct: formatNumber(math.spreadPct, lang, { maximumFractionDigits: 1 }) })}</>}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.summary.note}</p>
    </div>
  );
}
