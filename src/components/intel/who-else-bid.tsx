/**
 * "Who else bid" panel: the ranked bid list for one award, for Award
 * Intelligence subscribers only (callers render it only when the viewer has
 * Intel; the rows come from an RLS-gated read). Every list says unofficial,
 * names its source and as-of date, measures the gap to the winning (or
 * apparent low) bid in % and dollars, and never says why anyone lost.
 */
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/dictionaries";
import { fmt, plural } from "@/i18n/format";
import type { WhoElseBid } from "@/lib/bid-results/model";
import { intelDay, intelMoney, intelPct } from "@/lib/intel/format";

export type BidResultsMessages = Messages["bidResults"];

/** Short source names for the lead line. */
const SOURCE_NAME: Record<string, string> = {
  "ca-seao": "SEAO (Québec)",
  "us-txdot-bids": "TxDOT",
};

export function WhoElseBidPanel({ panel, t, lang }: { panel: WhoElseBid; t: BidResultsMessages; lang: Locale }) {
  const money = (n: number) => intelMoney(n, panel.currency, lang);
  return (
    <section className="in-wb" data-panel="who-else-bid" aria-labelledby="who-else-bid">
      <h2 className="s-h2 sm" id="who-else-bid">{t.title}</h2>
      <p className="small">
        {fmt(t.lead, { source: SOURCE_NAME[panel.source] ?? panel.source, date: intelDay(panel.asOf, lang) })} {t.basis[panel.basis]}
      </p>
      <div className="s-dtw">
        <table className="s-dt" data-list="bids">
          <thead>
            <tr>
              <th scope="col">{t.col.rank}</th>
              <th scope="col">{t.col.bidder}</th>
              <th scope="col" className="r">{t.col.bid}</th>
              <th scope="col" className="r">{t.col.gap}</th>
              <th scope="col">{t.col.status}</th>
            </tr>
          </thead>
          <tbody>
            {panel.lines.map((l, i) => (
              <tr key={`${l.rank ?? "x"}-${i}`}>
                <td>{l.rank ?? "—"}</td>
                <td className="nm">{l.individual ? <span className="bm-muted">{t.individual}</span> : l.name}</td>
                <td className="r">{l.amount !== null ? money(l.amount) : "—"}</td>
                <td className="r">
                  {l.reference ? (
                    <span className="bm-muted">{t.reference}</span>
                  ) : l.gapPct !== null && l.gapAmount !== null ? (
                    `${l.gapPct >= 0 ? "+" : "−"}${intelPct(l.gapPct, lang)} (${l.gapAmount >= 0 ? "+" : "−"}${money(Math.abs(l.gapAmount))})`
                  ) : (
                    "—"
                  )}
                </td>
                <td>{t.status[l.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {plural(panel.bidders, t.bidders, { n: panel.bidders })}
        {panel.spreadPct !== null ? ` · ${fmt(t.spread, { pct: intelPct(panel.spreadPct, lang) })}` : ""}
      </p>
      <p className="small muted">{t.note}</p>
    </section>
  );
}
