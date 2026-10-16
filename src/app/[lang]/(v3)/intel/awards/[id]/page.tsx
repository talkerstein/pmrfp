import type { Metadata } from "next";
import { RecordFooter } from "@/components/public/record-footer";
import { localizeCredit } from "@/lib/data-credits";
import { notFound } from "next/navigation";
import { getBidResults, getHistoryAward } from "@/lib/contract-history/load";
import { getCategories } from "@/lib/data/taxonomy";
import { whoElseBid } from "@/lib/bid-results/model";
import { EXACT_NOTICE_SOURCES, intelAwardPath } from "@/lib/intel/history";
import { intelDay, intelMoney } from "@/lib/intel/format";
import { loadIntelViewer } from "@/lib/intel/viewer";
import { intelNoindexMeta } from "@/lib/intel/meta";
import { setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { SimplePage } from "@/components/v3/simple";
import { IntelCta, IntelNav } from "@/components/intel/views";
import { WhoElseBidPanel } from "@/components/intel/who-else-bid";

type Params = Promise<{ lang: string; id: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, id } = await params;
  const l: Locale = hasLocale(lang) ? lang : "en";
  return intelNoindexMeta(l, getDictionary(l).bidResults.award.metaTitle, intelAwardPath(id));
}

/**
 * One award-history record (Intel only, never indexed): the award, its
 * contract term with where the end date came from, the bid count and, where
 * the source publishes it, who else bid. The record is read with the
 * viewer's own session, so row level security returns nothing to anyone
 * without Intel; they see what the page is and how to get it, no data.
 */
export default async function IntelAwardRecord({ params, searchParams }: { params: Params; searchParams: SP }) {
  const lang = await setLangFrom(params);
  const { id } = await params;
  const sp = await searchParams;
  const path = intelAwardPath(id);
  const { ctx, intel } = await loadIntelViewer({ lang, countryParam: sp.country, view: sp.view, next: path });
  const tb = getDictionary(lang).bidResults;
  const t = ctx.t;
  const crumbs = [{ label: t.crumb, href: "/intel" }];

  if (!intel) {
    return (
      <SimplePage lang={lang} current={null} group="company" crumbs={crumbs} tabs={false} aside={false} title={tb.award.crumb} lead={tb.award.locked}>
        <IntelNav ctx={ctx} current="home" />
        <IntelCta ctx={ctx} />
      </SimplePage>
    );
  }

  const [award, bids, categories] = await Promise.all([getHistoryAward(id), getBidResults(id), getCategories().catch(() => [])]);
  if (!award) notFound();
  const panel = whoElseBid(bids);
  const money = (n: number) => intelMoney(n, award.currency === "USD" ? "USD" : "CAD", lang);
  const place = [award.city ? regionName(award.city, lang) : null, award.province ? regionName(award.province, lang) : null].filter(Boolean).join(", ");
  const facts: [string, string | null][] = [
    [tb.award.buyer, award.buyer],
    [tb.award.holder, award.winner_is_individual ? t.individual : award.winner_business_name],
    [tb.award.value, award.value !== null ? money(Number(award.value)) : t.notDisclosed],
    [tb.award.awarded, award.award_date_precision === "half_year" ? fmt(tb.award.halfYear, { date: intelDay(award.award_date, lang) }) : intelDay(award.award_date, lang)],
    [tb.award.start, award.start_date ? intelDay(award.start_date, lang) : null],
    [tb.award.end, award.end_date ? `${intelDay(award.end_date, lang)} (${award.end_date_source ? tb.award.endSource[award.end_date_source] : ""})` : null],
    [tb.award.potentialEnd, award.potential_end_date ? intelDay(award.potential_end_date, lang) : null],
    [tb.award.bids, award.number_of_bids !== null ? String(award.number_of_bids) : null],
    [tb.award.trades, award.trade_slugs.length ? award.trade_slugs.map((s) => tradeName(categories.find((c) => c.slug === s)?.name ?? s, lang)).join(", ") : null],
    [tb.award.place, place || null],
  ];
  return (
    <SimplePage lang={lang} current={null} group="company" crumbs={crumbs} tabs={false} aside={false} title={award.title} lead={award.description ?? ""}>
      <IntelNav ctx={ctx} current="home" />
      <div className="s-dtw">
        <table className="s-dt" data-list="award-facts">
          <tbody>
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {panel ? <WhoElseBidPanel panel={panel} t={tb} lang={lang} /> : <p className="small muted">{tb.award.noBids}</p>}
      <p className="small">
        {award.notice_url && (
          <a className="ext" href={award.notice_url} target="_blank" rel="noopener noreferrer">
            {EXACT_NOTICE_SOURCES.has(award.source) ? tb.award.record : tb.award.dataset}
          </a>
        )}
      </p>
      <p className="small muted">
        {localizeCredit(award.attribution, lang)} {tb.award.licence}: {award.licence}. {fmt(tb.award.asOf, { date: intelDay(award.as_of, lang) })}
      </p>
      <RecordFooter credits={[]} lang={lang} kind="intel_award" path={path} refId={id} className="mt-2" />
    </SimplePage>
  );
}
