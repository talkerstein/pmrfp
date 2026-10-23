import { Container } from "@/components/container";
import { SH2 } from "@/components/v3/simple";
import { compactDollars } from "@/lib/data/fomo";
import { loadContractorActivity, loadRecentPermits, type ContractorList, type PlannedRow, type RecentPermits } from "@/lib/open-data/load";
import { CALGARY_ATTRIBUTION } from "@/lib/open-data/calgary";
import { TORONTO_ATTRIBUTION } from "@/lib/data/toronto-awards";
import { localizeCredits } from "@/lib/data-credits";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

/**
 * Open-data blocks (batch 1). Each renders nothing unless it has rows, so a
 * page without data is unchanged. They add no new page type and no new URL:
 * the data is read through 24 h tagged caches (lib/open-data/load.ts), and
 * every block carries the licence credit its sources require.
 */

/** "Data sources": the credit lines (each licence's own wording) for the data on this page. */
export function DataSourcesCredit({ credits, heading = true }: { credits: readonly string[]; heading?: boolean }) {
  const t = getT("openData").credits;
  const lang = getLang();
  if (!credits.length) return null;
  return (
    <div className="mt-3 text-xs leading-relaxed text-muted-foreground" data-credit="data-sources">
      {heading && <p className="font-medium text-foreground">{t.title}</p>}
      {localizeCredits(credits, lang).map((c) => (
        <p key={c}>{c}</p>
      ))}
    </div>
  );
}

const day = (d: string, lang: ReturnType<typeof getLang>) => formatDate(`${d}T12:00:00Z`, lang);

function PermitsList({ permits, city }: { permits: RecentPermits; city: string }) {
  const t = getT("openData").permits;
  const lang = getLang();
  return (
    <section className="border-t border-border" data-block="recent-permits">
      <Container className="py-10">
        <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.title, { city })}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{fmt(t.lead, { city })}</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3 font-medium">{t.issued}</th>
                <th className="p-3 font-medium">{t.contractor}</th>
                <th className="p-3 text-right font-medium">{t.value}</th>
                <th className="hidden p-3 font-medium sm:table-cell">{t.work}</th>
              </tr>
            </thead>
            <tbody>
              {permits.rows.map((r) => (
                <tr key={`${r.issued_on}|${r.contractor}|${r.value_cad}|${r.work_type ?? ""}`} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap p-3">{day(r.issued_on, lang)}</td>
                  <td className="p-3 font-medium">{r.contractor}</td>
                  <td className="whitespace-nowrap p-3 text-right">{compactDollars(r.value_cad, lang)}</td>
                  <td className="hidden p-3 text-muted-foreground sm:table-cell">{r.work_type ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t.note}</p>
        <DataSourcesCredit credits={permits.credits} />
      </Container>
    </section>
  );
}

function ActiveList({ list, city, tradeSlug, tradeLabel }: { list: ContractorList; city: string; tradeSlug: string; tradeLabel: string }) {
  const t = getT("openData").active;
  const lang = getLang();
  void tradeSlug;
  return (
    <section className="border-t border-border bg-secondary/30" data-block="active-contractors">
      <Container className="py-10">
        <h2 className="text-2xl font-semibold tracking-tight">{fmt(t.title, { trade: tradeLabel, city })}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {fmt(t.lead, { trade: tradeLabel.toLowerCase(), city, from: list.windowStart ? day(list.windowStart, lang) : "", to: list.windowEnd ? day(list.windowEnd, lang) : "" })}
        </p>
        <ol className="mt-4 max-w-xl divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {list.rows.map((r) => (
            <li key={r.rank} className="flex items-baseline justify-between gap-3 p-3">
              <span className="min-w-0 truncate font-medium">
                <span className="mr-2 text-muted-foreground">{r.rank}.</span>
                {r.contractor}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {r.permits} {t.permits.toLowerCase()}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">{t.note}</p>
        <DataSourcesCredit credits={[CALGARY_ATTRIBUTION]} />
      </Container>
    </section>
  );
}

/**
 * On /trades/<trade>/<city>: recent big permits in that city (cities with
 * data only) and, for Calgary, the most active contractors in this trade.
 */
export async function OpenDataTradeBlocks({ city, tradeSlug, tradeLabel }: { city: string; tradeSlug: string; tradeLabel: string }) {
  const [permits, active] = await Promise.all([
    loadRecentPermits(city).catch((): RecentPermits => ({ rows: [], credits: [] })),
    loadContractorActivity(city, tradeSlug).catch((): ContractorList => ({ rows: [], windowStart: null, windowEnd: null })),
  ]);
  const label = tradeName(tradeLabel, getLang());
  return (
    <>
      {active.rows.length > 0 && <ActiveList list={active} city={city} tradeSlug={tradeSlug} tradeLabel={label} />}
      {permits.rows.length > 0 && <PermitsList permits={permits} city={city} />}
    </>
  );
}

/** On the City of Toronto buyer page: the City's own plan of what it will put out to bid (rows from loadPlannedProcurements). */
export function ComingUp({ rows, no }: { rows: readonly PlannedRow[]; no: number }) {
  if (!rows.length) return null;
  const t = getT("openData").coming;
  return (
    <>
      <SH2 no={no} id="coming-up">{t.title}</SH2>
      <p className="small muted">{t.lead}</p>
      <ul className="s-table" data-list="coming-up">
        {rows.map((r) => (
          <li key={r.title}>
            <span className="code" aria-hidden>{r.sourcing_year ? String(r.sourcing_year).slice(2) : "—"}</span>
            <span>
              <span className="nm">{r.title}</span>
              <span className="lic">
                {[r.type_of_work, r.sourcing_year ? fmt(t.sourcing, { year: String(r.sourcing_year) }) : null, r.sourcing_type, r.estimated_range ? fmt(t.estimate, { range: r.estimated_range }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">{t.note}</p>
      <DataSourcesCredit credits={[TORONTO_ATTRIBUTION]} />
    </>
  );
}

/** On the City of Calgary buyer page: the top five contractors in each trade (lists from loadCalgaryTop). */
export function CalgaryActiveSummary({ lists, no }: { lists: readonly { trade: string; label: string; list: ContractorList }[]; no: number }) {
  const t = getT("openData").active;
  const lang = getLang();
  const shown = lists.filter((l) => l.list.rows.length > 0);
  if (!shown.length) return null;
  return (
    <>
      <SH2 no={no} id="active-contractors">{fmt(t.summaryTitle, { city: "Calgary" })}</SH2>
      <p className="small muted">{fmt(t.summaryLead, { city: "Calgary" })}</p>
      {shown.map(({ trade, label, list }) => (
        <div key={trade} data-list={"active-" + trade}>
          <h3>{tradeName(label, lang)}</h3>
          <ul className="s-table">
            {list.rows.map((r) => (
              <li key={r.rank}>
                <span className="code" aria-hidden>{r.rank}</span>
                <span>
                  <span className="nm">{r.contractor}</span>
                  <span className="lic">{r.permits} {t.permits.toLowerCase()}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="small muted">{t.note}</p>
      <DataSourcesCredit credits={[CALGARY_ATTRIBUTION]} />
    </>
  );
}
